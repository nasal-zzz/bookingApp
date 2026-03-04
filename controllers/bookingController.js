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
    if (available <= 0) return res.json({ success: false, message: `Sorry, ${ttype.name||ttype.category} tickets are sold out.` });
    if (!ttype.isActive) return res.json({ success: false, message: `${ttype.name||ttype.category} tickets are currently not available.` });
    // For multiple-entry tickets qty=1 but attendees = comboCount
    const effectiveQty = ttype.ticketType === 'multiple' ? 1 : qty;
    if (effectiveQty > 10) return res.json({ success: false, message: 'Max 10 tickets per booking.' });
    if (available < effectiveQty) return res.json({ success: false, message: `Only ${available} seats left.` });

    const pricePerTicket = ttype.price;
    const subtotal = pricePerTicket * effectiveQty;
    const convFee  = event.convenienceFee || 0;  // use 0 if admin didn't set one

    let discount = 0;

    // ── Combo offer: auto-apply if qty meets the minimum ──
    if (ttype.comboOfferMinQty > 0 && ttype.comboOfferDiscount > 0 && effectiveQty >= ttype.comboOfferMinQty) {
      discount = ttype.comboOfferDiscount;
    }

    // ── Coupon code discount ──
    if (couponCode) {
      try {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
        if (coupon) {
          const now = new Date();
          const validFrom  = coupon.validFrom  ? new Date(coupon.validFrom)  : null;
          const validUntil = coupon.validUntil ? new Date(coupon.validUntil) : null;
          if (validUntil) validUntil.setHours(23,59,59,999);
          const notYet  = validFrom  && now < validFrom;
          const expired = validUntil && now > validUntil;
          const maxedOut = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
          const belowMin = coupon.minOrder > 0 && subtotal < coupon.minOrder;
          if (!notYet && !expired && !maxedOut && !belowMin) {
            const couponDisc = coupon.type === 'percent'
              ? Math.round(subtotal * coupon.value / 100)
              : coupon.value;
            // Use coupon if bigger than combo discount, or add to it
            discount = Math.max(discount, couponDisc);
            console.log('✅ Coupon applied in createOrder:', coupon.code, '→ discount:', discount);
          } else {
            console.warn('⚠ Coupon skipped in createOrder:', coupon.code, {notYet, expired, maxedOut, belowMin});
          }
        }
      } catch(e) { console.warn('Coupon error in createOrder:', e.message); }
    }

    const totalAmount = Math.max(subtotal - discount + convFee, 0);

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.create({
      amount:   totalAmount * 100,
      currency: 'INR',
      receipt:  'MEE_' + Date.now(),
    });
    // ── Save / upsert a pending booking so verifyPayment can upgrade it ──
    // Reuse any existing pending/failed for same user+event to avoid duplicates
    let pendingBookingDoc = null;
    try {
      const attArr = Array.isArray(attendees) ? attendees : (attendees ? [attendees] : []);
      const ticketStubs = [];
      const _qrH = require('../utils/qrHelper');
      for (let i = 0; i < effectiveQty; i++) {
        const att = attArr[i] || attArr[0] || {};
        ticketStubs.push({
          ticketId: _qrH.generateTicketId(i),
          attendee: { name: att.name || req.user.firstName || 'Guest', age: parseInt(att.age) || 25, special: att.special || '' },
          seatNumber: (ttype.category || 'ticket').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_s' + (i + 1),
          qrCode: '', qrData: ''
        });
      }
      const existingStale = await Booking.findOne({
        user: req.user._id,
        event: event._id,
        paymentStatus: { $in: ['pending', 'failed'] },
      }).sort({ createdAt: -1 });

      if (existingStale) {
        existingStale.ticketType     = ttype.category;
        existingStale.pricePerTicket = pricePerTicket;
        existingStale.quantity       = effectiveQty;
        existingStale.subtotal       = subtotal;
        existingStale.discount       = discount;
        existingStale.convenienceFee = convFee;
        existingStale.totalAmount    = totalAmount;
        existingStale.orderId        = order.id;
        existingStale.couponCode     = couponCode ? couponCode.toUpperCase() : null;
        existingStale.paymentStatus  = 'pending';
        existingStale.tickets        = ticketStubs;
        await existingStale.save();
        pendingBookingDoc = existingStale;
        console.log('🔄 Reused existing booking for retry:', existingStale.bookingRef);
      } else {
        pendingBookingDoc = await Booking.create({
          user: req.user._id, event: event._id,
          ticketType: ttype.category, pricePerTicket,
          quantity: effectiveQty, subtotal, discount,
          couponCode: couponCode ? couponCode.toUpperCase() : null,
          convenienceFee: convFee, totalAmount,
          tickets: ticketStubs, paymentStatus: 'pending',
          orderId: order.id,
          contactPhone: req.user.phone || '',
          contactEmail: req.user.email || '',
        });
        await User.findByIdAndUpdate(req.user._id, { $push: { bookings: pendingBookingDoc._id } }).catch(() => {});
        console.log('📝 New pending booking:', pendingBookingDoc.bookingRef);

        // Send pending notifications only for brand-new bookings (not retries)
        try {
          const { sendPendingPaymentReminder } = require('../utils/emailHelper');
          const { sendWhatsAppPending } = require('../utils/whatsappHelper');
          if (req.user.email) sendPendingPaymentReminder({ to: req.user.email, name: req.user.firstName, booking: pendingBookingDoc, event }).catch(() => {});
          if (req.user.phone) sendWhatsAppPending({ phone: req.user.phone, name: req.user.firstName, booking: pendingBookingDoc, event }).catch(() => {});
          console.log('📨 Pending notifications queued for:', pendingBookingDoc.bookingRef);
        } catch(ne) { console.warn('Pending notify error:', ne.message); }
      }
    } catch (pe) {
      console.warn('⚠ Pending booking save failed (non-fatal):', pe.message);
    }

    req.session.pendingBooking = {
      bookingId:      pendingBookingDoc ? pendingBookingDoc._id.toString() : null,
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
// POST /booking/save-pending  — user dismissed Razorpay without paying
// No-op: the pending booking in DB is fine, user can retry.
// ─────────────────────────────────────────────────────────────
exports.savePending = async (req, res) => {
  const pending = req.session.pendingBooking;
  if (pending && pending.bookingId) {
    console.log('ℹ️  savePending: user dismissed — booking stays pending:', pending.bookingId);
  } else {
    console.log('ℹ️  savePending: dismissed (no session)');
  }
  return res.json({ success: true });
};

// ─────────────────────────────────────────────────────────────
// GET /booking/check-existing?eventId=xxx
// Returns any pending/failed booking the user has for the event
// Used by booking page to show "resume payment" banner
// ─────────────────────────────────────────────────────────────
exports.checkExistingBooking = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId || !req.user) return res.json({ exists: false });
    const existing = await Booking.findOne({
      user:          req.user._id,
      event:         eventId,
      paymentStatus: { $in: ['pending', 'failed'] },
    }).sort({ createdAt: -1 }).select('_id bookingRef paymentStatus totalAmount ticketType quantity createdAt');
    if (existing) {
      return res.json({ exists: true, booking: existing });
    }
    return res.json({ exists: false });
  } catch(e) {
    return res.json({ exists: false });
  }
};


// ─────────────────────────────────────────────────────────────
// POST /booking/save-failed  — payment.failed event
// No-op: we don't persist failed payment records.
// The overlay on the frontend shows the error and lets user retry or go back.
// ─────────────────────────────────────────────────────────────
exports.saveFailed = async (req, res) => {
  try {
    const pending = req.session.pendingBooking;
    let failedBooking = null;

    if (pending && pending.bookingId) {
      failedBooking = await Booking.findOneAndUpdate(
        { _id: pending.bookingId, paymentStatus: { $in: ['pending', 'failed'] } },
        { paymentStatus: 'failed' },
        { new: true }
      ).populate('event').catch(() => null);
      if (failedBooking) {
        console.log('❌ saveFailed: booking marked failed:', pending.bookingId);
      } else {
        console.log('⚠ saveFailed: not updated (may already be paid):', pending.bookingId);
      }
    } else if (pending && pending.orderId) {
      failedBooking = await Booking.findOneAndUpdate(
        { orderId: pending.orderId, paymentStatus: { $in: ['pending', 'failed'] } },
        { paymentStatus: 'failed' },
        { new: true }
      ).populate('event').catch(() => null);
      if (failedBooking) console.log('❌ saveFailed: marked failed by orderId:', pending.orderId);
    } else {
      console.log('ℹ️  saveFailed: no active booking to update');
    }

    // Send failed payment notifications
    if (failedBooking && failedBooking.paymentStatus === 'failed') {
      try {
        const eventDoc = failedBooking.event || (pending && pending.eventId ? await require('../models/Event').findById(pending.eventId).lean() : null);
        const { sendFailedPaymentNotice } = require('../utils/emailHelper');
        const { sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');
        if (req.user && req.user.email) sendFailedPaymentNotice({ to: req.user.email, name: req.user.firstName, booking: failedBooking, event: eventDoc || {} }).catch(() => {});
        if (req.user && req.user.phone) sendWhatsAppPaymentFailed({ phone: req.user.phone, name: req.user.firstName, booking: failedBooking, event: eventDoc || {} }).catch(() => {});
        console.log('📨 Failed payment notifications queued for:', failedBooking.bookingRef);
      } catch(ne) { console.warn('Failed notify error:', ne.message); }
    }
  } catch(e) { console.warn('saveFailed error:', e.message); }
  return res.json({ success: true });
};
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
    const order = await razorpay.orders.create({ amount: booking.totalAmount * 100, currency: 'INR', receipt: 'MEE_RETRY_' + Date.now() });
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

        // Send success notifications
        try {
          const evDoc = await require('../models/Event').findById(pending.eventId).lean();
          const { sendBookingConfirmation } = require('../utils/emailHelper');
          const { sendWhatsAppTickets } = require('../utils/whatsappHelper');
          if (req.user.email && evDoc) sendBookingConfirmation({ to: req.user.email, name: req.user.firstName, booking: existingBooking, event: evDoc }).catch(() => {});
          if (req.user.phone && evDoc) sendWhatsAppTickets({ phone: req.user.phone, name: req.user.firstName, booking: existingBooking, event: evDoc }).catch(() => {});
          console.log('✅ Success notifications sent (retry branch 1):', existingBooking.bookingRef);
        } catch(ne) { console.warn('Notify err (branch1):', ne.message); }

        return res.json({ success: true, bookingId: existingBooking._id, bookingRef: existingBooking.bookingRef });
      }
    }

    // ── CHECK: if a pending/failed booking already exists for this orderId, update it ──
    const existingByOrder = await Booking.findOne({ orderId: razorpay_order_id });
    if (existingByOrder && existingByOrder.paymentStatus !== 'paid') {
      // Regenerate QR codes for existing tickets
      const { generateQRCode, buildQRPayload, buildGroupQRPayload } = require('../utils/qrHelper');
      const isGrp = existingByOrder.tickets.length > 1;
      if (isGrp) {
        const seatNums = existingByOrder.tickets.map(t => t.seatNumber || t.ticketId);
        const grpPayload = buildGroupQRPayload({ bookingRef: existingByOrder.bookingRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendees: existingByOrder.tickets.map(t=>({name:t.attendee.name,ticketId:t.ticketId,seatNumber:t.seatNumber})), ticketType: pending.ticketType });
        const grpQR = await generateQRCode(grpPayload).catch(()=>'');
        const grpData = JSON.stringify(grpPayload);
        existingByOrder.tickets.forEach(t => { t.qrData = grpData; if(grpQR) t.qrCode = grpQR; });
      } else {
        for (let i = 0; i < existingByOrder.tickets.length; i++) {
          const t = existingByOrder.tickets[i];
          const qrP = buildQRPayload({ ticketId: t.ticketId, bookingRef: existingByOrder.bookingRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendeeName: t.attendee.name, ticketType: pending.ticketType });
          try { t.qrCode = await generateQRCode(qrP); t.qrData = JSON.stringify(qrP); } catch(e) { t.qrCode = ''; }
        }
      }
      existingByOrder.paymentStatus = 'paid';
      existingByOrder.paymentId     = razorpay_payment_id;
      existingByOrder.signature     = razorpay_signature;
      await existingByOrder.save();
      await Event.updateOne(
        { _id: pending.eventId, 'ticketTypes.category': pending.ticketType },
        { $inc: { 'ticketTypes.$.bookedSeats': pending.quantity } }
      ).catch(()=>{});
      if (pending.zone) {
        await SeatMap.updateOne(
          { event: pending.eventId, 'sections.name': pending.zone },
          { $inc: { 'sections.$.bookedSeats': pending.quantity } }
        ).catch(()=>{});
      }
      // Apply coupon usage if any
      if (pending.couponCode) {
        const Coupon = require('../models/Coupon');
        await Coupon.findOneAndUpdate({ code: pending.couponCode }, { $inc: { usedCount: 1 } }).catch(()=>{});
      }
      delete req.session.pendingBooking;
      req.session.save(()=>{});
      console.log('✅ Updated existing booking to paid:', existingByOrder.bookingRef);
      // Send success notifications (email + WhatsApp with QR tickets)
      try {
        const ev2 = await require('../models/Event').findById(pending.eventId).lean();
        const { sendWhatsAppTickets } = require('../utils/whatsappHelper');
        if (req.user.email && ev2) sendBookingConfirmation({ to: req.user.email, name: req.user.firstName, booking: existingByOrder, event: ev2 }).catch(()=>{});
        if (req.user.phone && ev2) sendWhatsAppTickets({ phone: req.user.phone, name: req.user.firstName, booking: existingByOrder, event: ev2 }).catch(()=>{});
        console.log('📨 Success notifications sent (orderId branch):', existingByOrder.bookingRef);
      } catch(ne) { console.warn('Notif err (branch2):', ne.message); }
      return res.json({ success: true, bookingId: existingByOrder._id, bookingRef: existingByOrder.bookingRef });
    }

    // ── DEDUP: check if a paid booking was already created (double-submit guard) ──
    const alreadyPaid = await Booking.findOne({
      user:          req.user._id,
      event:         pending.eventId,
      paymentStatus: 'paid',
      paymentId:     razorpay_payment_id,
    });
    if (alreadyPaid) {
      console.log('ℹ️  verifyPayment: already paid booking found, returning it');
      delete req.session.pendingBooking;
      req.session.save(() => {});
      return res.json({ success: true, bookingId: alreadyPaid._id, bookingRef: alreadyPaid.bookingRef });
    }

    // ── UPSERT: if any pending/failed booking exists for this user+event, update it ──
    // This prevents creating a new booking when user retried from booking-details page
    const existingUnpaid = await Booking.findOne({
      user:          req.user._id,
      event:         pending.eventId,
      paymentStatus: { $in: ['pending', 'failed'] },
    }).sort({ createdAt: -1 });

    if (existingUnpaid) {
      console.log('🔄 verifyPayment: upgrading existing', existingUnpaid.paymentStatus, 'booking to paid:', existingUnpaid.bookingRef);
      // Regenerate QR codes
      const isGrp = existingUnpaid.tickets.length > 1;
      if (isGrp) {
        const grpPayload = buildGroupQRPayload({ bookingRef: existingUnpaid.bookingRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendees: existingUnpaid.tickets.map(t=>({name:t.attendee.name,ticketId:t.ticketId,seatNumber:t.seatNumber})), ticketType: pending.ticketType });
        const grpQR = await generateQRCode(grpPayload).catch(()=>'');
        const grpData = JSON.stringify(grpPayload);
        existingUnpaid.tickets.forEach(t => { t.qrData = grpData; if(grpQR) t.qrCode = grpQR; });
      } else {
        for (let i = 0; i < existingUnpaid.tickets.length; i++) {
          const t = existingUnpaid.tickets[i];
          const qrP = buildQRPayload({ ticketId: t.ticketId, bookingRef: existingUnpaid.bookingRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendeeName: t.attendee.name, ticketType: pending.ticketType });
          try { t.qrCode = await generateQRCode(qrP); t.qrData = JSON.stringify(qrP); } catch(e) { t.qrCode = ''; }
        }
      }
      existingUnpaid.paymentStatus = 'paid';
      existingUnpaid.paymentId     = razorpay_payment_id;
      existingUnpaid.orderId       = razorpay_order_id;
      existingUnpaid.signature     = razorpay_signature;
      await existingUnpaid.save();
      await Event.updateOne(
        { _id: pending.eventId, 'ticketTypes.category': pending.ticketType },
        { $inc: { 'ticketTypes.$.bookedSeats': pending.quantity } }
      ).catch(()=>{});
      if (pending.zone) {
        await SeatMap.updateOne(
          { event: pending.eventId, 'sections.name': pending.zone },
          { $inc: { 'sections.$.bookedSeats': pending.quantity } }
        ).catch(()=>{});
      }
      if (pending.couponCode) {
        const Coupon = require('../models/Coupon');
        await Coupon.findOneAndUpdate({ code: pending.couponCode }, { $inc: { usedCount: 1 } }).catch(()=>{});
      }
      delete req.session.pendingBooking;
      req.session.save(() => {});
      // Send success notifications (email + WhatsApp with QR tickets)
      try {
        const ev2 = await Event.findById(pending.eventId).lean();
        const { sendWhatsAppTickets } = require('../utils/whatsappHelper');
        if (req.user.email && ev2) sendBookingConfirmation({ to: req.user.email, name: req.user.firstName, booking: existingUnpaid, event: ev2 }).catch(()=>{});
        if (req.user.phone && ev2) sendWhatsAppTickets({ phone: req.user.phone, name: req.user.firstName, booking: existingUnpaid, event: ev2 }).catch(()=>{});
        console.log('📨 Success notifications sent (unpaid-upsert branch):', existingUnpaid.bookingRef);
      } catch(ne) { console.warn('Notif err (branch3):', ne.message); }
      return res.json({ success: true, bookingId: existingUnpaid._id, bookingRef: existingUnpaid.bookingRef });
    }

    // ── STEP 1: Build ticket stubs (QR generated after save, once bookingRef is known) ──
    const tickets = [];
    const attendees = pending.attendees || [];
    const isMultiple = pending.comboCount > 1 || (attendees.length > 1 && pending.quantity === 1);
    const ticketCount = attendees.length > 0 ? attendees.length : pending.quantity;
    const makeSeatNum = (category, idx) => `${(category||'ticket').toLowerCase().replace(/[^a-z0-9]/g,'_')}_s${idx + 1}`;

    if (isMultiple && attendees.length > 1) {
      const seatNumbers = attendees.map((_, i) => makeSeatNum(pending.ticketType, i));
      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i] || { name: req.user.firstName, age: 25 };
        tickets.push({ ticketId: generateTicketId(i), attendee: { name: att.name || req.user.firstName, age: parseInt(att.age)||25, special: att.special||'' }, qrData:'', qrCode:'', seatNumber: seatNumbers[i] });
      }
    } else {
      for (let i = 0; i < ticketCount; i++) {
        const att = attendees[i] || attendees[0] || { name: req.user.firstName, age: 25 };
        tickets.push({ ticketId: generateTicketId(i), seatNumber: makeSeatNum(pending.ticketType, i), attendee: { name: att.name||req.user.firstName, age: parseInt(att.age)||25, special: att.special||'' }, qrData:'', qrCode:'' });
      }
    }

    // ── STEP 2: Save booking — now bookingRef is auto-generated by Mongoose ──
    const booking = await Booking.create({
      user:           req.user._id,
      event:          pending.eventId,
      ticketType:     pending.ticketType,
      pricePerTicket: pending.pricePerTicket,
      quantity:       pending.quantity,
      subtotal:       pending.subtotal,
      discount:       pending.discount || 0,
      couponCode:     pending.couponCode || null,
      convenienceFee: pending.convenienceFee || 0,
      totalAmount:    pending.totalAmount,
      tickets,
      paymentStatus:  'paid',
      paymentId:      razorpay_payment_id,
      orderId:        razorpay_order_id,
      signature:      razorpay_signature,
      contactPhone:   req.user.phone || '',
      contactEmail:   req.user.email || '',
    });

    // ── STEP 3: Regenerate QR codes with real bookingRef, then update DB ──
    try {
      const realRef = booking.bookingRef;
      if (isMultiple && attendees.length > 1) {
        // One shared group QR for all attendees
        const seatNums = booking.tickets.map(t => t.seatNumber);
        const groupPayload = buildGroupQRPayload({
          bookingRef: realRef,
          eventId:    pending.eventId,
          paymentId:  razorpay_payment_id,
          ticketType: pending.ticketType,
          attendees:  attendees,
          groupSize:  attendees.length,
          seatNumbers: seatNums,
        });
        const groupQRCode = await generateQRCode(groupPayload).catch(() => '');
        const groupQRData = JSON.stringify(groupPayload);
        booking.tickets.forEach(t => { t.qrCode = groupQRCode; t.qrData = groupQRData; });
      } else {
        // One QR per ticket
        for (let i = 0; i < booking.tickets.length; i++) {
          const t = booking.tickets[i];
          const payload = buildQRPayload({ ticketId: t.ticketId, bookingRef: realRef, eventId: pending.eventId, paymentId: razorpay_payment_id, attendeeName: t.attendee.name, ticketType: pending.ticketType, seatNumber: t.seatNumber });
          t.qrCode = await generateQRCode(payload).catch(() => '');
          t.qrData = JSON.stringify(payload);
        }
      }
      await booking.save();
      console.log('✅ QR codes generated with bookingRef:', booking.bookingRef);
    } catch(qrErr) {
      console.error('⚠ QR regeneration failed (booking still valid):', qrErr.message);
    }

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
      title:   `Booking Confirmed — MEE`,
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
    const all = await Booking.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });

    // Build map: eventId → { paid: [], pending: [], failed: [] }
    const byEvent = {};
    const noEvent = []; // bookings where event was deleted
    for (const b of all) {
      const evId = b.event?._id?.toString();
      if (!evId) { noEvent.push(b); continue; }
      if (!byEvent[evId]) byEvent[evId] = { paid: [], pending: [], failed: [] };
      const status = b.paymentStatus;
      if (status === 'paid') byEvent[evId].paid.push(b);
      else if (status === 'pending') byEvent[evId].pending.push(b);
      else byEvent[evId].failed.push(b);
    }

    const bookings = [];

    for (const evId of Object.keys(byEvent)) {
      const group = byEvent[evId];

      if (group.paid.length > 0) {
        // Show only the latest paid booking for this event — suppress ALL pending/failed
        const latest = group.paid.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))[0];
        bookings.push(latest);
      } else if (group.pending.length > 0) {
        // No paid — show only the latest pending (1 max), no failed alongside it
        const latest = group.pending.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))[0];
        bookings.push(latest);
      } else if (group.failed.length > 0) {
        // Only failed exist — show only the latest one
        const latest = group.failed.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))[0];
        bookings.push(latest);
      }
    }

    // Add any orphaned bookings (event deleted)
    for (const b of noEvent) bookings.push(b);

    // Sort by createdAt desc
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('pages/my-bookings', {
      title:    'My Tickets — MEE',
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
    const order = await razorpay.orders.create({ amount: booking.totalAmount * 100, currency: 'INR', receipt: 'MEE_PAYNOW_' + Date.now() });
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