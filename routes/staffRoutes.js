const express = require('express');
const router  = express.Router();
const Staff   = require('../models/Staff');

// ── SUPER ADMIN hardcoded credentials ──
const SUPER_ADMIN = {
  username: process.env.SUPER_ADMIN_USER || 'superadmin',
  password: process.env.SUPER_ADMIN_PASS || 'MEE@SuperAdmin2026',
  role:     'superadmin',
};

// ── LOGIN PAGE ──
router.get('/login', (req, res) => {
  if (req.session.staffLoggedIn) return res.redirect('/staff/dashboard');
  if (req.session.adminLoggedIn || req.session.superAdminLoggedIn) return res.redirect('/admin');
  res.render('staff/login', { title: 'Staff Login — MEE', error: null });
});

// ── LOGIN HANDLER — checks superadmin first, then DB staff ──
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // 1. Check superadmin
  if (username === SUPER_ADMIN.username && password === SUPER_ADMIN.password) {
    req.session.superAdminLoggedIn = true;
    req.session.staffLoggedIn  = true;
    req.session.staffUser      = { username, role: 'superadmin', name: 'Super Admin' };
    await new Promise((r, j) => req.session.save(e => e ? j(e) : r()));
    return res.redirect('/superadmin');
  }

  // 2. Check DB staff (admin or staff role)
  try {
    const member = await Staff.findOne({ username });
    if (!member) {
      return res.render('staff/login', { title: 'Staff Login — MEE', error: 'Invalid username or password.' });
    }
    if (!member.isActive) {
      return res.render('staff/login', { title: 'Staff Login — MEE', error: 'Your account has been blocked. Contact the super admin.' });
    }
    if (member.password !== password) {
      return res.render('staff/login', { title: 'Staff Login — MEE', error: 'Invalid username or password.' });
    }

    // Set session based on role
    req.session.staffLoggedIn = true;
    req.session.staffUser = {
      id:       member._id.toString(),
      username: member.username,
      name:     member.firstName + ' ' + (member.lastName || ''),
      role:     member.role,
      canScanQR:       member.canScanQR,
      canViewBookings: member.canViewBookings,
      canManageEvents: member.canManageEvents,
    };

    // Also set adminLoggedIn if they have manage permission
    if (member.role === 'admin' || member.canManageEvents) {
      req.session.adminLoggedIn = true;
      req.session.adminUser = member.username;
    }

    await new Promise((r, j) => req.session.save(e => e ? j(e) : r()));

    // Redirect based on role
    if (member.role === 'admin') return res.redirect('/admin');
    if (member.canScanQR) return res.redirect('/staff/scanner');
    return res.redirect('/staff/dashboard');

  } catch (err) {
    console.error('Staff login error:', err);
    return res.render('staff/login', { title: 'Staff Login', error: 'Login error. Please try again.' });
  }
});

// ── LOGOUT ──
router.get('/logout', (req, res) => {
  delete req.session.staffLoggedIn;
  delete req.session.staffUser;
  delete req.session.adminLoggedIn;
  delete req.session.adminUser;
  delete req.session.superAdminLoggedIn;
  delete req.session.superAdminUser;
  res.redirect('/staff/login');
});

// ── AUTH MIDDLEWARE for staff routes ──
const staffAuth = (req, res, next) => {
  if (!req.session.staffLoggedIn) {
    const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
    if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    return res.redirect('/staff/login');
  }
  req.staffUser = req.session.staffUser;
  next();
};

// ── DASHBOARD (all authenticated staff) ──
router.get('/dashboard', staffAuth, (req, res) => {
  const u = req.session.staffUser;
  if (u.role === 'superadmin') return res.redirect('/superadmin');
  if (u.role === 'admin')      return res.redirect('/admin');
  // Staff: show scanner or restricted dashboard
  res.render('staff/dashboard', { title: 'Staff Dashboard — MEE', staffUser: u });
});

// ── QR SCANNER (for staff with canScanQR) ──
router.get('/scanner', staffAuth, (req, res) => {
  const u = req.session.staffUser;
  if (!u.canScanQR && u.role !== 'admin' && u.role !== 'superadmin') {
    return res.redirect('/staff/dashboard');
  }
  res.render('staff/scanner', { title: 'QR Scanner — MEE', staffUser: u });
});

// ── API: Verify & mark ticket used ──
router.post('/api/scan', staffAuth, async (req, res) => {
  try {
    const u = req.session.staffUser;
    if (!u.canScanQR && u.role !== 'admin' && u.role !== 'superadmin') {
      return res.json({ success: false, message: 'No scan permission.' });
    }

    const { ticketId, bookingRef, isGroup } = req.body;
    if (!ticketId && !bookingRef) return res.json({ success: false, message: 'No ticket data provided.' });

    const Booking = require('../models/Booking');

    // ── GROUP QR: find by bookingRef ──
    if (isGroup || (!ticketId && bookingRef)) {
      const booking = await Booking.findOne({ bookingRef, paymentStatus: 'paid' })
        .populate('event', 'name date venue');

      if (!booking) return res.json({ success: false, status: 'invalid', message: 'Booking not found or payment not confirmed.' });

      // Check if ALL tickets already used
      const usedCount = booking.tickets.filter(t => t.isUsed).length;
      if (usedCount === booking.tickets.length) {
        return res.json({
          success: false, status: 'used',
          message: `All ${booking.tickets.length} tickets already used!`,
          ticket: { ticketId: bookingRef, attendee: booking.tickets.map(t => t.attendee.name).join(', '), usedAt: booking.tickets[0]?.usedAt },
          event:  { name: booking.event?.name, date: booking.event?.date },
        });
      }

      // Mark all unused tickets as used
      const now = new Date();
      booking.tickets.forEach(t => {
        if (!t.isUsed) { t.isUsed = true; t.usedAt = now; t.usedBy = u.username; }
      });
      await booking.save();

      return res.json({
        success: true, status: 'valid',
        message: `Group entry granted ✓ (${booking.tickets.length} people)`,
        ticket: {
          ticketId:   bookingRef,
          attendee:   booking.tickets.map(t => t.attendee.name).join(', '),
          type:       booking.ticketType,
          groupSize:  booking.tickets.length,
          seatNumbers: booking.tickets.map(t => t.seatNumber).filter(Boolean),
        },
        event: { name: booking.event?.name, date: booking.event?.date, venue: booking.event?.venue },
        scannedBy: u.name,
      });
    }

    // ── SINGLE TICKET QR: find by ticketId, fallback to bookingRef ──
    const query = ticketId
      ? { 'tickets.ticketId': ticketId, paymentStatus: 'paid' }
      : { bookingRef, paymentStatus: 'paid' };

    const booking = await Booking.findOne(query).populate('event', 'name date venue');

    if (!booking) return res.json({ success: false, status: 'invalid', message: 'Ticket not found or payment not confirmed.' });

    const ticket = ticketId
      ? booking.tickets.find(t => t.ticketId === ticketId)
      : booking.tickets[0];

    if (!ticket) return res.json({ success: false, status: 'invalid', message: 'Ticket not found.' });

    if (ticket.isUsed) {
      return res.json({
        success: false, status: 'used',
        message: 'Ticket already used!',
        ticket: { ticketId: ticket.ticketId, attendee: ticket.attendee.name, usedAt: ticket.usedAt },
        event:  { name: booking.event?.name, date: booking.event?.date },
      });
    }

    // Mark as used
    ticket.isUsed = true;
    ticket.usedAt = new Date();
    ticket.usedBy = u.username;
    await booking.save();

    return res.json({
      success: true, status: 'valid',
      message: 'Entry granted ✓',
      ticket: {
        ticketId:   ticket.ticketId,
        attendee:   ticket.attendee.name,
        age:        ticket.attendee.age,
        seatNumber: ticket.seatNumber || null,
        type:       booking.ticketType,
      },
      event: { name: booking.event?.name, date: booking.event?.date, venue: booking.event?.venue },
      scannedBy: u.name,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.json({ success: false, status: 'error', message: 'Server error. Try again.' });
  }
});

module.exports = router;