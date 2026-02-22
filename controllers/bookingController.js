const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const Razorpay = require('razorpay');
const crypto = require('crypto');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { generateTicketId, generateQRCode, buildQRPayload } = require('../utils/qrHelper');

// ── GET /booking/:eventId ──

exports.getEventDetail = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event || !event.isActive) return res.redirect('/');
    res.render('pages/event-detail', {
      title: event.name + ' — NightPass',
      event,
      user: req.user || null,
    });
  } catch (err) {
    console.error('getEventDetail error:', err);
    res.redirect('/');
  }
};

exports.getBookingPage = async (req, res) => {
  try {
    // Support /booking?event=ID or /booking/EVENT_ID
    const eventId = req.params.eventId || req.query.event;
    const event = eventId
      ? await Event.findOne({ _id: eventId, isActive: true })
      : await Event.findOne({ isActive: true }).sort({ date: 1 });

    if (!event) {
      return res.render('pages/error', {
        title: 'Event Not Found',
        message: 'This event is no longer available. Check other events!',
        code: 404,
      });
    }
    res.render('pages/booking', {
      title: 'Book Tickets — NightPass',
      event,
      user: req.user,
      error: null,
    });
  } catch (err) {
    console.error('getBookingPage error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// ── POST /booking/create-order ──
exports.createOrder = async (req, res) => {
  try {
    const { ticketType, quantity, couponCode, attendees } = req.body;
    const qty = parseInt(quantity) || 1;

    const eventId = req.body.eventId || req.session.pendingEventId;
    const event = eventId
      ? await Event.findOne({ _id: eventId, isActive: true })
      : await Event.findOne({ isActive: true }).sort({ date: 1 });
    if (!event) return res.json({ success: false, message: 'Event not found.' });

    // DEBUG — log what we received vs what's in DB
    console.log('🎟 ticketType received:', JSON.stringify(ticketType));
    console.log('🎟 eventId received:', eventId);
    console.log('🎟 event found:', event ? event.name : 'NOT FOUND');
    console.log('🎟 DB ticketTypes:', event ? event.ticketTypes.map(t => t.name) : []);

    // Find ticket type (case-insensitive, trim whitespace)
    const ttype = event.ticketTypes.find(
      t => t.name.trim().toLowerCase() === (ticketType || '').trim().toLowerCase()
    );
    if (!ttype) {
      console.error('❌ No match! received:', ticketType, '| available:', event.ticketTypes.map(t=>t.name));
      return res.json({ success: false, message: 'Invalid ticket type selected.' });
    }

    const available = ttype.totalSeats - ttype.bookedSeats;
    if (available <= 0) return res.json({ success: false, message: 'This ticket type is sold out.' });
    if (available < qty) return res.json({ success: false, message: `Only ${available} seats left.` });

    // Pricing
    const pricePerTicket = ttype.price;
    const subtotal = pricePerTicket * qty;
    const convFee = event.convenienceFee || 20;

    // Coupon
    const COUPONS = { 'PARTY10': 100, 'NIGHT20': 200, 'FIRST50': 50 };
    let discount = 0;
    if (couponCode && COUPONS[couponCode.toUpperCase()]) {
      discount = COUPONS[couponCode.toUpperCase()];
    }

    const totalAmount = Math.max(subtotal - discount + convFee, 0);

    // Create Razorpay order
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: 'INR',
      receipt: 'NP_' + Date.now(),
    });

    // Store everything in session for verify step
    req.session.pendingBooking = {
      eventId: event._id.toString(),
      ticketType: ttype.name,
      quantity: qty,
      pricePerTicket,
      subtotal,
      discount,
      couponCode: couponCode ? couponCode.toUpperCase() : null,
      convenienceFee: convFee,
      totalAmount,
      attendees: Array.isArray(attendees) ? attendees : [attendees],
      orderId: order.id,
    };

    // Force session save
    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    console.log('✅ Order created:', order.id, '| Total:', totalAmount);

    return res.json({
      success: true,
      orderId: order.id,
      amount: totalAmount * 100,
      key: process.env.RAZORPAY_KEY_ID,
      currency: 'INR',
      prefill: {
        name: req.user.firstName + ' ' + (req.user.lastName || ''),
        email: req.user.email || '',
        contact: req.user.phone || '',
      },
    });
  } catch (err) {
    console.error('createOrder error:', err);
    res.json({ success: false, message: 'Failed to create order: ' + err.message });
  }
};

// ── POST /booking/verify-payment ──
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    console.log('🔍 Verifying payment:', razorpay_payment_id);
    console.log('🔍 Session pending:', JSON.stringify(req.session.pendingBooking));

    const pending = req.session.pendingBooking;

    if (!pending) {
      console.error('❌ No pendingBooking in session');
      return res.json({
        success: false,
        message: 'Session expired. But your payment was received! Contact support with Payment ID: ' + razorpay_payment_id,
      });
    }

    // ── Verify Razorpay signature ──
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      console.error('❌ Signature mismatch');
      return res.json({ success: false, message: 'Payment signature verification failed.' });
    }

    console.log('✅ Signature verified');

    // ── Generate tickets + QR codes ──
    const tickets = [];
    const attendees = pending.attendees || [];

    for (let i = 0; i < pending.quantity; i++) {
      const ticketId = generateTicketId(i);
      const attendee = attendees[i] || attendees[0] || { name: req.user.firstName, age: 25 };

      const qrPayload = buildQRPayload({
        ticketId,
        bookingRef: 'PENDING',
        eventId: pending.eventId,
        paymentId: razorpay_payment_id,
        attendeeName: attendee.name || req.user.firstName,
        ticketType: pending.ticketType,
      });

      let qrCode = '';
      try {
        qrCode = await generateQRCode(qrPayload);
      } catch (qrErr) {
        console.error('QR generation failed for ticket', i, qrErr.message);
        qrCode = ''; // continue without QR rather than fail entire booking
      }

      tickets.push({
        ticketId,
        attendee: {
          name: attendee.name || req.user.firstName,
          age: parseInt(attendee.age) || 25,
          special: attendee.special || '',
        },
        qrData: JSON.stringify(qrPayload),
        qrCode,
      });
    }

    console.log('✅ Generated', tickets.length, 'tickets');

    // ── Save booking to DB ──
    const booking = await Booking.create({
      user: req.user._id,
      event: pending.eventId,
      ticketType: pending.ticketType,
      pricePerTicket: pending.pricePerTicket,
      quantity: pending.quantity,
      subtotal: pending.subtotal,
      discount: pending.discount || 0,
      couponCode: pending.couponCode || null,
      convenienceFee: pending.convenienceFee || 20,
      totalAmount: pending.totalAmount,
      tickets,
      paymentStatus: 'paid',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      signature: razorpay_signature,
      contactPhone: req.user.phone || '',
      contactEmail: req.user.email || '',
    });

    console.log('✅ Booking saved:', booking.bookingRef);

    // ── Update seat count ──
    try {
      await Event.updateOne(
        { _id: pending.eventId, 'ticketTypes.name': pending.ticketType },
        { $inc: { 'ticketTypes.$.bookedSeats': pending.quantity } }
      );
    } catch (seatErr) {
      console.error('Seat count update failed (non-critical):', seatErr.message);
    }

    // ── Link booking to user ──
    try {
      await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } });
    } catch (userErr) {
      console.error('User booking link failed (non-critical):', userErr.message);
    }

    // ── Fetch event doc once for notifications ──
    let eventDoc = null;
    try {
      eventDoc = await Event.findById(pending.eventId);
    } catch(e) { console.error('Event fetch error:', e.message); }

    // ── Send confirmation email (non-blocking) ──
    if (req.user.email && eventDoc) {
      try {
        const { sendBookingConfirmation } = require('../utils/emailHelper');
        sendBookingConfirmation({
          to: req.user.email,
          name: req.user.firstName,
          booking,
          event: eventDoc,
        }).catch(e => console.error('Email send error:', e.message));
      } catch (emailErr) {
        console.error('Email helper error (non-critical):', emailErr.message);
      }
    }

    // ── Send WhatsApp ticket link (non-blocking) ──
    if (req.user.phone && eventDoc) {
      try {
        const { sendWhatsAppTickets } = require('../utils/whatsappHelper');
        sendWhatsAppTickets({
          phone: req.user.phone,        // already in +91XXXXXXXXXX format
          name:  req.user.firstName,
          booking,
          event: eventDoc,
        }).catch(e => console.error('WhatsApp ticket send error:', e.message));
      } catch (waErr) {
        console.error('WhatsApp helper error (non-critical):', waErr.message);
      }
    }

    // ── Clear session ──
    delete req.session.pendingBooking;
    req.session.save(() => {});

    return res.json({
      success: true,
      bookingId: booking._id,
      bookingRef: booking.bookingRef,
    });

  } catch (err) {
    console.error('❌ verifyPayment FULL ERROR:', err);
    res.json({
      success: false,
      message: 'Booking save failed: ' + err.message,
    });
  }
};

// ── GET /booking/ticket/:bookingId ──
exports.getTicket = async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      user: req.user._id,
    }).populate('event');

    if (!booking) {
      return res.redirect('/booking/my-bookings');
    }

    res.render('pages/ticket', {
      title: 'Your Ticket — NightPass',
      booking,
      event: booking.event,
      user: req.user,
    });
  } catch (err) {
    console.error('getTicket error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// ── GET /booking/my-bookings ──
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });

    res.render('pages/my-bookings', {
      title: 'My Bookings — NightPass',
      bookings,
      user: req.user,
    });
  } catch (err) {
    console.error('getMyBookings error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// ── GET /api/event ── (single, for booking page)
exports.getEventData = async (req, res) => {
  try {
    const eventId = req.query.id;
    const event = eventId
      ? await Event.findOne({ _id: eventId, isActive: true })
      : await Event.findOne({ isActive: true }).sort({ date: 1 });
    if (!event) return res.json({ success: false, message: 'No active event.' });
    res.json({ success: true, event });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

// ── GET /api/events ── (all active events for homepage)
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({ isActive: true }).sort({ isFeatured: -1, date: 1 });
    res.json({ success: true, events });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
