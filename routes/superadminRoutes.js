const express = require('express');
const router  = express.Router();
const Staff   = require('../models/Staff');
const Coupon  = require('../models/Coupon');
const Booking = require('../models/Booking');
const Event   = require('../models/Event');

// ── Default superadmin credentials ──
const SUPER_ADMIN = {
  username: process.env.SUPER_ADMIN_USER || 'superadmin',
  password: process.env.SUPER_ADMIN_PASS || 'MEE@SuperAdmin2026',
};

// ── Auth middleware ── accepts superAdminLoggedIn OR staffLoggedIn with superadmin role
const superAuth = (req, res, next) => {
  const isSuperAdmin = req.session.superAdminLoggedIn ||
    (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
  if (isSuperAdmin) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
  if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  return res.redirect('/staff/login');
};

// ── LOGIN ──
router.get('/login', (req, res) => {
  if (req.session.superAdminLoggedIn || req.session.staffLoggedIn) return res.redirect('/superadmin');
  return res.redirect('/staff/login#superadmin');
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === SUPER_ADMIN.username && password === SUPER_ADMIN.password) {
    // Upsert superadmin record in Staff DB so they appear in admin panel
    try {
      await Staff.findOneAndUpdate(
        { username },
        {
          username,
          password,
          firstName: 'Super',
          lastName: 'Admin',
          email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@mee.local',
          phone: process.env.SUPER_ADMIN_PHONE || '0000000000',
          role: 'superadmin',
          isActive: true,
          canScanQR: true,
          canViewBookings: true,
          canManageEvents: true,
        },
        { upsert: true, new: true }
      );
    } catch(e) { /* non-fatal */ }
    req.session.superAdminLoggedIn = true;
    req.session.superAdminUser = username;
    req.session.staffLoggedIn = true;
    req.session.staffUser = { username, role: 'superadmin', name: 'Super Admin' };
    await new Promise((r, j) => req.session.save(e => e ? j(e) : r()));
    return res.redirect('/superadmin');
  }
  // Also try DB staff with superadmin role
  try {
    const member = await Staff.findOne({ username, role: 'superadmin' });
    if (member && member.password === password && member.isActive) {
      req.session.superAdminLoggedIn = true;
      req.session.superAdminUser = username;
      req.session.staffLoggedIn = true;
      req.session.staffUser = { id: member._id.toString(), username, role: 'superadmin', name: member.firstName + ' ' + (member.lastName||'') };
      await new Promise((r, j) => req.session.save(e => e ? j(e) : r()));
      return res.redirect('/superadmin');
    }
  } catch(e) {}
  res.render('superadmin/login', { title: 'Super Admin Login — MEE', error: 'Invalid credentials.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/staff/login'));
});

router.use(superAuth);

// ── DASHBOARD ──
router.get('/', async (req, res) => {
  try {
    const [staffCount, totalBookings, totalRevenue, coupons] = await Promise.all([
      Staff.countDocuments(),
      Booking.countDocuments({ paymentStatus: 'paid' }),
      Booking.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Coupon.countDocuments(),
    ]);
    const currentAdmin = req.session.staffUser || { username: req.session.superAdminUser || 'superadmin', name: 'Super Admin', role: 'superadmin' };
    res.render('superadmin/dashboard', {
      title: 'Super Admin — MEE',
      staffCount, totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      coupons,
      currentAdmin,
    });
  } catch (err) {
    res.render('superadmin/dashboard', { title: 'Super Admin', staffCount: 0, totalBookings: 0, totalRevenue: 0, coupons: 0, currentAdmin: req.session.staffUser || { name: 'Super Admin', role: 'superadmin' } });
  }
});

// ── STAFF MANAGEMENT ──
router.get('/staff', async (req, res) => {
  try {
    const staff = await Staff.find().sort({ createdAt: -1 });
    const currentAdmin = req.session.staffUser || { username: req.session.superAdminUser || 'superadmin', name: 'Super Admin', role: 'superadmin' };
    res.render('superadmin/staff', { title: 'Staff Management — MEE', staff, currentAdmin });
  } catch (err) {
    res.render('superadmin/staff', { title: 'Staff Management', staff: [] });
  }
});

router.post('/staff', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, canScanQR, canViewBookings, canManageEvents } = req.body;
    // Auto-generate username: "staff-firstname" or "admin-firstname"
    const prefix    = role === 'admin' ? 'admin' : 'staff';
    const baseUser  = `${prefix}-${firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    // If username exists, append random suffix
    const existing  = await Staff.findOne({ username: baseUser });
    const username  = existing ? `${baseUser}${Math.floor(Math.random() * 900) + 100}` : baseUser;
    // Password: username-last3digitsofphone
    const last3     = (phone || '000').slice(-3);
    const password  = `${username}-${last3}`;
    const member = await Staff.create({
      firstName, lastName: lastName || '', email, phone: phone || '',
      username, password, role: role || 'staff',
      canScanQR: canScanQR === 'on', canViewBookings: canViewBookings === 'on', canManageEvents: canManageEvents === 'on',
      createdBy: null,
    });
    res.json({ success: true, username: member.username, password: member.password, id: member._id });
  } catch (err) {
    res.json({ success: false, message: err.code === 11000 ? 'Email already exists.' : err.message });
  }
});

router.post('/staff/:id/toggle', async (req, res) => {
  try {
    const member = await Staff.findById(req.params.id);
    if (!member) return res.json({ success: false, message: 'Not found' });
    member.isActive = !member.isActive;
    await member.save();
    res.json({ success: true, isActive: member.isActive });
  } catch (err) { res.json({ success: false, message: err.message }); }
});

router.post('/staff/:id/delete', async (req, res) => {
  try {
    await Staff.findByIdAndDelete(req.params.id);
    res.redirect('/superadmin/staff');
  } catch (err) { res.redirect('/superadmin/staff'); }
});

// ── COUPON MANAGEMENT ──
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    const currentAdmin = req.session.staffUser || { username: req.session.superAdminUser || 'superadmin', name: 'Super Admin', role: 'superadmin' };
    res.render('superadmin/coupons', { title: 'Coupons — MEE', coupons, currentAdmin });
  } catch (err) {
    res.render('superadmin/coupons', { title: 'Coupons', coupons: [] });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, validFrom, validUntil, description } = req.body;
    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type: type || 'fixed',
      value: parseFloat(value),
      minOrder: parseFloat(minOrder) || 0,
      maxUses: parseInt(maxUses) || 0,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      description: description || '',
    });
    res.json({ success: true, couponId: coupon._id });
  } catch (err) {
    res.json({ success: false, message: err.code === 11000 ? 'Coupon code already exists.' : err.message });
  }
});

router.post('/coupons/:id/toggle', async (req, res) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (!c) return res.json({ success: false });
    c.isActive = !c.isActive;
    await c.save();
    res.json({ success: true, isActive: c.isActive });
  } catch (err) { res.json({ success: false, message: err.message }); }
});

router.post('/coupons/:id/delete', async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.redirect('/superadmin/coupons');
  } catch (err) { res.redirect('/superadmin/coupons'); }
});

// ── USERS BY EVENT ──
router.get('/users-by-event', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 }).select('name date');
    const selectedEventId = req.query.eventId;
    let bookings = [];
    let selectedEvent = null;
    if (selectedEventId) {
      selectedEvent = await Event.findById(selectedEventId).select('name date');
      bookings = await Booking.find({ event: selectedEventId, paymentStatus: 'paid' })
        .populate('user', 'firstName lastName email phone')
        .sort({ createdAt: -1 });
    }
    res.render('superadmin/users-by-event', { title: 'Users by Event', events, bookings, selectedEvent, selectedEventId: selectedEventId || '', coupons: [], currentAdmin: req.session.staffUser || { name: 'Super Admin', role: 'superadmin' } });
  } catch (err) {
    console.error('[SA] users-by-event error:', err.message);
    res.render('superadmin/error', { title: 'Error — Super Admin', status: 500, errTitle: 'LOAD FAILED', errMessage: 'Could not load attendee data.', errDetail: process.env.NODE_ENV !== 'production' ? err.message : null });
  }
});

// ── API: Validate coupon (used by booking page) ──
// This replaces the hardcoded coupons in booking-details.ejs
router.post('/api/validate-coupon', async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) return res.json({ success: false, message: 'Invalid coupon code.' });
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) return res.json({ success: false, message: 'Coupon not yet active.' });
    if (coupon.validUntil && now > coupon.validUntil) return res.json({ success: false, message: 'Coupon has expired.' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.json({ success: false, message: 'Coupon usage limit reached.' });
    if (coupon.minOrder > 0 && orderAmount < coupon.minOrder) return res.json({ success: false, message: `Min order ₹${coupon.minOrder} required.` });
    const discount = coupon.type === 'percent'
      ? Math.round((orderAmount * coupon.value) / 100)
      : coupon.value;
    res.json({ success: true, discount: Math.min(discount, orderAmount), code: coupon.code, description: coupon.description });
  } catch (err) { res.json({ success: false, message: 'Server error.' }); }
});

// ── Superadmin error handler ──
router.use((err, req, res, next) => {
  console.error('[SUPERADMIN ERROR]', req.path, err.message);
  const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
  if (isJson) return res.status(500).json({ success: false, message: err.message });
  res.status(500).render('superadmin/error', {
    title:      'Error — Super Admin',
    status:     500,
    errTitle:   'SOMETHING WENT WRONG',
    errMessage: 'An unexpected error occurred in the Super Admin panel.',
    errDetail:  process.env.NODE_ENV !== 'production' ? err.message : null,
  });
});

module.exports = router;