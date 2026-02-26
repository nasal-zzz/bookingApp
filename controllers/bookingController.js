const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const Razorpay = require('razorpay');
const crypto   = require('crypto');
const Event    = require('../models/Event');
const Booking  = require('../models/Booking');
const SeatMap  = require('../models/SeatMap');
const User     = require('../models/User');
const { generateTicketId, generateQRCode, buildQRPayload, buildGroupQRPayload } = require('../utils/qrHelper');
const { sendBookingConfirmation, sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');

// ─────────────────────────────────────────────────────────────
// STEP 1 — GET /booking/seatmap/:eventId
// If event has an active seatmap → render seat picker
// If no seatmap → redirect straight to details page (no zone)
// ─────────────────────────────────────────────────────────────
exports.getSeatPicker = async (req, res) => {
  try {
    const event   = await Event.findById(req.params.eventId);
    const seatMap = await SeatMap.findOne({ event: req.params.eventId, isActive: true }).lean();
    if (!event) return res.redirect('/');
    if (!seatMap) return res.redirect(`/booking/details/${req.params.eventId}`);
    const CAT_COLORS = { platinum:'#9D4EDD', gold:'#f5c842', silver:'#c0c8d8', fanfit:'#00FF88', family:'#FF6B6B' };
    res.render('pages/seatpicker', {
      title: `Choose Your Zone — ${event.name}`,
      event, seatMap, CAT_COLORS, user: req.user,
    });
  } catch(err) {
    console.error('getSeatPicker error:', err);
    res.redirect('/');
  }
};

// ─────────────────────────────────────────────────────────────
// STEP 2 — GET /booking/details/:eventId
// Render the attendee details form (comes from seatpicker)
// ─────────────────────────────────────────────────────────────
exports.getDetailsPage = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.redirect('/');
    res.render('pages/booking-details', {
      title: `Attendee Details — ${event.name}`,
      event,
      user: req.user,
      query: req.query,
    });
  } catch(err) {
    console.error('getDetailsPage error:', err);
    res.redirect('/');
  }
};

// ─────────────────────────────────────────────────────────────
// LEGACY — GET /booking/:eventId
// Keep for backward compat — redirects to seatmap or details
// ─────────────────────────────────────────────────────────────
exports.getBookingPage = async (req, res) => {
  try {
    const eventId = req.params.eventId || null;
    const event   = eventId
      ? await Event.findById(eventId)
      : await Event.findOne({ isActive: true }).sort({ date: 1 });
    if (!event) return res.redirect('/');

    const seatMap = await SeatMap.findOne({ event: event._id, isActive: true }).lean();
    if (seatMap) return res.redirect(`/booking/seatmap/${event._id}`);
    return res.redirect(`/booking/details/${event._id}`);
  } catch(err) {
    console.error('getBookingPage error:', err);
    res.redirect('/');
  }
};

// ─────────────────────────────────────────────────────────────
// POST /booking/create-order
// Creates Razorpay order & stores pending data in session
// ─────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { ticketType, quantity, couponCode, attendees, zone } = req.body;
    const qty = parseInt(quantity) || 1;

    const eventId = req.body.eventId || req.session.pendingEventId;
    const event = eventId
      ? await Event.findOne({ _id: eventId, isActive: true })
      : await Event.findOne({ isActive: true }).sort({ date: 1 });
    if (!event) return res.json({ success: false, message: 'Event not found.' });

    const ttype = event.ticketTypes.find(
      t => (t.category||'').trim().toLowerCase() === (ticketType||'').trim().toLowerCase()
    );
    if (!ttype) return res.json({ success: false, message: 'Invalid ticket type selected.' });

    const available = ttype.totalSeats - ttype.bookedSeats;
    if (available <= 0) return res.json({ success: false, message: 'This ticket type is sold out.' });
    // For multiple-entry tickets qty=1 but attendees = comboCount
    const effectiveQty = ttype.ticketType === 'multiple' ? 1 : qty;
    if (effectiveQty > 10) return res.json({ success: false, message: 'Max 10 tickets per booking.' });
    if (available < effectiveQty) return res.json({ success: false, message: `Only ${available} seats left.` });

    const pricePerTicket = ttype.price;
    const subtotal = pricePerTicket * effectiveQty;
    const convFee  = event.convenienceFee || 20;

    const COUPONS = { 'PARTY10': 100, 'NIGHT20': 200, 'FIRST50': 50 };
    let discount = 0;
    if (couponCode && COUPONS[couponCode.toUpperCase()]) {
      discount = COUPONS[couponCode.toUpperCase()];
    }

    const totalAmount = Math.max(subtotal - discount + convFee, 0);

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.create({
      amount:   totalAmount * 100,
      currency: 'INR',
      receipt:  'NP_' + Date.now(),
    });

    req.session.pendingBooking = {
      eventId:        event._id.toString(),
      ticketType:     ttype.category,
      zone:           zone || '',
      quantity:       effectiveQty,
      pricePerTicket,
      subtotal,
      discount,
      couponCode:     couponCode ? couponCode.toUpperCase() : null,
      convenienceFee: convFee,
      totalAmount,
      attendees:      Array.isArray(attendees) ? attendees : [attendees],
      orderId:        order.id,
    };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    console.log('✅ Order created:', order.id, '| Total:', totalAmount);

    return res.json({
      success:  true,
      orderId:  order.id,
      amount:   totalAmount * 100,
      key:      process.env.RAZORPAY_KEY_ID,
      currency: 'INR',
      prefill:  {
        name:    (req.user.firstName + ' ' + (req.user.lastName || '')).trim(),
        email:   req.user.email || '',
        contact: req.user.phone || '',
      },
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.json({ success: false, message: 'Failed to create order: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /booking/save-pending  — user dismissed Razorpay modal
// Save booking record with paymentStatus = 'pending'
// ─────────────────────────────────────────────────────────────
exports.savePending = async (req, res) => {
  try {
    const pending = req.session.pendingBooking;
    if (!pending) return res.json({ success: false, message: 'No pending booking in session' });

    const { orderId } = req.body;

    // Check if already saved (don't duplicate)
    const existing = await Booking.findOne({ orderId: orderId || pending.orderId });
    if (existing) return res.json({ success: true, bookingId: existing._id });

    // Minimal attendee placeholders
    const tickets = [];
    const attendees = pending.attendees || [];
    for (let i = 0; i < pending.quantity; i++) {
      const attendee = attendees[i] || attendees[0] || { name: req.user.firstName, age: 25 };
      tickets.push({
        ticketId: generateTicketId(i),
        attendee: { name: attendee.name || req.user.firstName, age: parseInt(attendee.age) || 25, special: attendee.special || '' },
        qrData: '',
        qrCode: '',
      });
    }

    const booking = await Booking.create({
      user:           req.user._id,
      event:          pending.eventId,
      ticketType:     pending.ticketType,
      pricePerTicket: pending.pricePerTicket,
      quantity:       pending.quantity,
      subtotal:       pending.subtotal,
      discount:       pending.discount || 0,
      couponCode:     pending.couponCode || null,
      convenienceFee: pending.convenienceFee || 20,
      totalAmount:    pending.totalAmount,
      tickets,
      paymentStatus:  'pending',
      orderId:        pending.orderId,
      contactPhone:   req.user.phone || '',
      contactEmail:   req.user.email || '',
    });

    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } }).catch(() => {});
    // Store booking id in session so retry-payment can pick it up
    req.session.pendingBookingId = booking._id.toString();
    req.session.save(() => {});

    console.log('💾 Pending booking saved:', booking.bookingRef);

    // Send IMMEDIATE pending payment reminder (async, don't block response)
    try {
      const event = await require('../models/Event').findById(pending.eventId).lean();
      const contactEmail = req.user.email || '';
      const contactPhone = req.user.phone || '';
      const name = req.user.firstName || 'there';
      if (contactEmail) {
        sendPendingPaymentReminder({ to: contactEmail, name, booking, event: event || {} }).catch(()=>{});
      }
      if (contactPhone) {
        const { sendWhatsAppPending } = require('../utils/whatsappHelper');
        sendWhatsAppPending({ phone: contactPhone, name, booking, event: event || {} }).catch(()=>{});
      }
      // Mark immediate reminder as sent
      await Booking.findByIdAndUpdate(booking._id, { reminderImmediateSentAt: new Date() }).catch(()=>{});
    } catch(notifErr) { console.warn('Pending notif error:', notifErr.message); }

    return res.json({ success: true, bookingId: booking._id });
  } catch(err) {
    console.error('savePending error:', err);
    res.json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /booking/save-failed  — payment.failed event
// ─────────────────────────────────────────────────────────────
exports.saveFailed = async (req, res) => {
  try {
    const pending = req.session.pendingBooking;
    if (!pending) return res.json({ success: false });

    const { orderId, error } = req.body;
    const existing = await Booking.findOne({ orderId: orderId || pending.orderId });
    if (existing) {
      await Booking.findByIdAndUpdate(existing._id, { paymentStatus: 'failed' });
      return res.json({ success: true });
    }

    const tickets = [];
    const attendees = pending.attendees || [];
    for (let i = 0; i < pending.quantity; i++) {
      const attendee = attendees[i] || attendees[0] || { name: req.user.firstName, age: 25 };
      tickets.push({ ticketId: generateTicketId(i), attendee: { name: attendee.name || req.user.firstName, age: parseInt(attendee.age)||25, special: attendee.special||'' }, qrData:'', qrCode:'' });
    }

    const booking = await Booking.create({
      user: req.user._id, event: pending.eventId, ticketType: pending.ticketType,
      pricePerTicket: pending.pricePerTicket, quantity: pending.quantity, subtotal: pending.subtotal,
      discount: pending.discount||0, couponCode: pending.couponCode||null, convenienceFee: pending.convenienceFee||20,
      totalAmount: pending.totalAmount, tickets, paymentStatus: 'failed',
      orderId: pending.orderId, contactPhone: req.user.phone||'', contactEmail: req.user.email||'',
    });
    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } }).catch(() => {});
    console.log('❌ Failed booking saved:', booking.bookingRef);

    // Send failed payment notification (async)
    try {
      const event = await require('../models/Event').findById(pending.eventId).lean();
      const contactEmail = req.user.email || '';
      const contactPhone = req.user.phone || '';
      const name = req.user.firstName || 'there';
      if (contactEmail) {
        sendFailedPaymentNotice({ to: contactEmail, name, booking, event: event || {} }).catch(()=>{});
      }
      // WhatsApp notification for failed payment
      if (contactPhone) {
        const { sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');
        sendWhatsAppPaymentFailed({ phone: contactPhone, name, booking, event: event || {} }).catch(()=>{});
      }
    } catch(notifErr) { console.warn('Failed notif error:', notifErr.message); }

    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /booking/retry-payment/:bookingId
// Re-open payment for pending/failed booking with original details
// ─────────────────────────────────────────────────────────────
exports.retryPayment = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      user: req.user._id,
    }).populate('event');

    if (!booking || !['pending','failed'].includes(booking.paymentStatus)) {
      return res.redirect('/booking/my-bookings');
    }

    const event = booking.event;
    if (!event || !event.isActive) return res.redirect('/booking/my-bookings');

    // Check if tickets still available
    const ttype = event.ticketTypes.find(t => t.category === booking.ticketType);
    const available = ttype ? (ttype.totalSeats - ttype.bookedSeats) : 0;
    if (available < booking.quantity) {
      return res.redirect('/booking/my-bookings?msg=sold_out');
    }

    // Re-populate session with original booking details
    req.session.pendingBooking = {
      bookingId:      booking._id.toString(),    // existing booking to update
      eventId:        event._id.toString(),
      ticketType:     booking.ticketType,
      quantity:       booking.quantity,
      pricePerTicket: booking.pricePerTicket,
      subtotal:       booking.subtotal,
      discount:       booking.discount || 0,
      couponCode:     booking.couponCode || null,
      convenienceFee: booking.convenienceFee,
      totalAmount:    booking.totalAmount,
      attendees:      booking.tickets.map(t => ({ name: t.attendee.name, age: t.attendee.age, special: t.attendee.special||'' })),
    };
    await new Promise((resolve,reject)=>{ req.session.save(err=>err?reject(err):resolve()); });

    // Create a new Razorpay order
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({ amount: booking.totalAmount * 100, currency: 'INR', receipt: 'NP_RETRY_' + Date.now() });
    req.session.pendingBooking.orderId = order.id;
    await new Promise((resolve,reject)=>{ req.session.save(err=>err?reject(err):resolve()); });

    res.render('pages/retry-payment', {
      title:   `Complete Payment — ${event.name}`,
      booking, event,
      order,
      user: req.user,
      rzpKey: process.env.RAZORPAY_KEY_ID,
    });
  } catch(err) {
    console.error('retryPayment error:', err);
    res.redirect('/booking/my-bookings');
  }
};

// ─────────────────────────────────────────────────────────────
// POST /booking/verify-payment
// Verifies Razorpay signature, completes booking
// ─────────────────────────────────────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const pending = req.session.pendingBooking;

    if (!pending) {
      return res.json({ success: false, message: 'Session expired. Contact support with Payment ID: ' + razorpay_payment_id });
    }

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.json({ success: false, message: 'Payment signature verification failed.' });
    }

    // If this is a retry, update existing booking
    if (pending.bookingId) {
      const existingBooking = await Booking.findById(pending.bookingId);
      if (existingBooking) {
        // Generate QR codes for existing tickets
        for (let i = 0; i < existingBooking.tickets.length; i++) {
          const t = existingBooking.tickets[i];
          const qrPayload = buildQRPayload({ ticketId: t.ticketId, bookingRef: existingBooking.bookingRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendeeName: t.attendee.name, ticketType: pending.ticketType });
          try { t.qrCode = await generateQRCode(qrPayload); t.qrData = JSON.stringify(qrPayload); } catch(e) { t.qrCode = ''; }
        }
        existingBooking.paymentStatus = 'paid';
        existingBooking.paymentId     = razorpay_payment_id;
        existingBooking.orderId       = razorpay_order_id;
        existingBooking.signature     = razorpay_signature;
        await existingBooking.save();

        // Update Event seat count
        await Event.updateOne(
          { _id: pending.eventId, 'ticketTypes.category': pending.ticketType },
          { $inc: { 'ticketTypes.$.bookedSeats': pending.quantity } }
        ).catch(() => {});

        // Update SeatMap zone bookedSeats (zone linked by category)
        if (pending.zone) {
          await SeatMap.updateOne(
            { event: pending.eventId, 'sections.name': pending.zone },
            { $inc: { 'sections.$.bookedSeats': pending.quantity } }
          ).catch(() => {});
        }

        delete req.session.pendingBooking;
        req.session.save(() => {});

        return res.json({ success: true, bookingId: existingBooking._id, bookingRef: existingBooking.bookingRef });
      }
    }

    // Generate tickets + QR codes (new booking)
    // Multiple-entry: 1 GROUP QR shared by all attendees (scanned once at gate)
    // Single-entry: 1 QR per ticket as before
    const tickets = [];
    const attendees = pending.attendees || [];
    const isMultiple = pending.comboCount > 1 || (attendees.length > 1 && pending.quantity === 1);
    const ticketCount = attendees.length > 0 ? attendees.length : pending.quantity;

    // Helper: generate seat number like "gold_s1", "family_s2"
    const makeSeatNum = (category, idx) => `${(category||'ticket').toLowerCase().replace(/[^a-z0-9]/g,'_')}_s${idx + 1}`;

    if (isMultiple && attendees.length > 1) {
      // Assign a seat number to each person in the group
      const seatNumbers = attendees.map((_, i) => makeSeatNum(pending.ticketType, i));

      // Build ONE group QR that encodes all attendees + seat numbers
      const groupQRPayload = buildGroupQRPayload({
        bookingRef:  'PENDING',
        eventId:     pending.eventId,
        paymentId:   razorpay_payment_id,
        ticketType:  pending.ticketType,
        attendees:   attendees,
        groupSize:   attendees.length,
        seatNumbers: seatNumbers,
      });
      let groupQRCode = '';
      try { groupQRCode = await generateQRCode(groupQRPayload); } catch(e) {}
      const groupQRData = JSON.stringify(groupQRPayload);
      // Each attendee record gets the SAME group QR + their own seat number
      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i] || { name: req.user.firstName, age: 25 };
        tickets.push({
          ticketId:   generateTicketId(i),
          attendee:   { name: att.name || req.user.firstName, age: parseInt(att.age) || 25, special: att.special || '' },
          qrData:     groupQRData,
          qrCode:     groupQRCode,   // shared group QR
          seatNumber: seatNumbers[i],
        });
      }
    } else {
      // Single-entry: one QR per ticket, each with own seat number
      for (let i = 0; i < ticketCount; i++) {
        const ticketId  = generateTicketId(i);
        const attendee  = attendees[i] || attendees[0] || { name: req.user.firstName, age: 25 };
        const seatNumber = makeSeatNum(pending.ticketType, i);
        const qrPayload = buildQRPayload({ ticketId, bookingRef: 'PENDING', eventId: pending.eventId, paymentId: razorpay_payment_id, attendeeName: attendee.name || req.user.firstName, ticketType: pending.ticketType, seatNumber });
        let qrCode = '';
        try { qrCode = await generateQRCode(qrPayload); } catch(e) {}
        tickets.push({ ticketId, seatNumber, attendee: { name: attendee.name || req.user.firstName, age: parseInt(attendee.age) || 25, special: attendee.special || '' }, qrData: JSON.stringify(qrPayload), qrCode });
      }
    }

    const booking = await Booking.create({
      user:           req.user._id,
      event:          pending.eventId,
      ticketType:     pending.ticketType,
      pricePerTicket: pending.pricePerTicket,
      quantity:       pending.quantity,
      subtotal:       pending.subtotal,
      discount:       pending.discount || 0,
      couponCode:     pending.couponCode || null,
      convenienceFee: pending.convenienceFee || 20,
      totalAmount:    pending.totalAmount,
      tickets,
      paymentStatus:  'paid',
      paymentId:      razorpay_payment_id,
      orderId:        razorpay_order_id,
      signature:      razorpay_signature,
      contactPhone:   req.user.phone || '',
      contactEmail:   req.user.email || '',
    });

    // Update Event seat count
    await Event.updateOne(
      { _id: pending.eventId, 'ticketTypes.category': pending.ticketType },
      { $inc: { 'ticketTypes.$.bookedSeats': pending.quantity } }
    ).catch(() => {});

    // Update SeatMap zone bookedSeats
    if (pending.zone) {
      await SeatMap.updateOne(
        { event: pending.eventId, 'sections.name': pending.zone },
        { $inc: { 'sections.$.bookedSeats': pending.quantity } }
      ).catch(() => {});
    }

    // Link to user
    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } }).catch(() => {});

    // Send notifications (non-blocking)
    let eventDoc = null;
    try { eventDoc = await Event.findById(pending.eventId); } catch(e) {}

    if (req.user.email && eventDoc) {
      try {
        const { sendBookingConfirmation } = require('../utils/emailHelper');
        sendBookingConfirmation({ to: req.user.email, name: req.user.firstName, booking, event: eventDoc }).catch(() => {});
      } catch(e) {}
    }
    if (req.user.phone && eventDoc) {
      try {
        const { sendWhatsAppTickets } = require('../utils/whatsappHelper');
        sendWhatsAppTickets({ phone: req.user.phone, name: req.user.firstName, booking, event: eventDoc }).catch(() => {});
      } catch(e) {}
    }

    delete req.session.pendingBooking;
    req.session.save(() => {});

    return res.json({ success: true, bookingId: booking._id, bookingRef: booking.bookingRef });
  } catch(err) {
    console.error('verifyPayment FULL ERROR:', err);
    res.json({ success: false, message: 'Booking save failed: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /booking/success/:bookingId  — success page
// ─────────────────────────────────────────────────────────────
exports.getSuccessPage = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      user: req.user._id,
    }).populate('event');

    if (!booking || booking.paymentStatus !== 'paid') {
      return res.redirect('/booking/my-bookings');
    }

    res.render('pages/ticket', {
      title:   `Booking Confirmed — NightPass`,
      booking,
      event:   booking.event,
      user:    req.user,
    });
  } catch(err) {
    console.error('getSuccessPage error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /booking/ticket/:bookingId  — legacy, redirect to success
// ─────────────────────────────────────────────────────────────
exports.getTicket = async (req, res) => {
  return res.redirect('/booking/success/' + req.params.bookingId);
};

// ─────────────────────────────────────────────────────────────
// GET /booking/my-bookings
// ─────────────────────────────────────────────────────────────
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });

    res.render('pages/my-bookings', {
      title:    'My Tickets — NightPass',
      bookings,
      user:     req.user,
    });
  } catch(err) {
    console.error('getMyBookings error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// API endpoints
exports.getEventData = async (req, res) => {
  try {
    const eventId = req.query.id;
    const event = eventId ? await Event.findOne({ _id: eventId, isActive: true }) : await Event.findOne({ isActive: true }).sort({ date: 1 });
    if (!event) return res.json({ success: false, message: 'No active event.' });
    res.json({ success: true, event });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({ isActive: true }).sort({ isFeatured: -1, date: 1 });
    res.json({ success: true, events });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
};
// POST /booking/retry-payment-api/:bookingId — JSON version for profile Pay Now button
exports.retryPaymentApi = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      user: req.user._id,
    }).populate('event');

    if (!booking || !['pending','failed'].includes(booking.paymentStatus)) {
      return res.json({ success: false, message: 'Booking not found or already paid.' });
    }

    // Re-populate session
    req.session.pendingBooking = {
      bookingId:      booking._id.toString(),
      eventId:        booking.event._id.toString(),
      ticketType:     booking.ticketType,
      quantity:       booking.quantity,
      pricePerTicket: booking.pricePerTicket,
      subtotal:       booking.subtotal,
      discount:       booking.discount || 0,
      couponCode:     booking.couponCode || null,
      convenienceFee: booking.convenienceFee,
      totalAmount:    booking.totalAmount,
      attendees:      booking.tickets.map(t => ({ name: t.attendee.name, age: t.attendee.age, special: t.attendee.special||'' })),
    };

    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({ amount: booking.totalAmount * 100, currency: 'INR', receipt: 'NP_PAYNOW_' + Date.now() });
    req.session.pendingBooking.orderId = order.id;
    await new Promise((resolve, reject) => { req.session.save(err => err ? reject(err) : resolve()); });

    res.json({
      success:     true,
      key:         process.env.RAZORPAY_KEY_ID,
      amount:      order.amount,
      currency:    order.currency,
      orderId:     order.id,
      description: booking.ticketType + ' × ' + booking.quantity,
      prefill: {
        name:  req.user.firstName + ' ' + (req.user.lastName||''),
        email: req.user.email || '',
        contact: req.user.phone || '',
      },
    });
  } catch(err) {
    console.error('retryPaymentApi error:', err);
    res.json({ success: false, message: err.message });
  }
};