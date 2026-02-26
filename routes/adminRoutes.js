const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');
const Staff = require('../models/Staff');

// ── Get current admin info for views ──
function getCurrentAdmin(req) {
  if (req.session.staffUser) return req.session.staffUser;
  if (req.session.adminUser) return { username: req.session.adminUser, name: req.session.adminUser, role: 'admin' };
  return { username: 'admin', name: 'Admin', role: 'admin' };
}

// ── Admin credentials ──
// Hardcoded admin + support for .env override
const ADMINS = [
  { username: 'admin-melatturpattu', password: 'mainAdminMelatturPattu' },
  // Extra admins can be added here or via env:
  // { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
];

const checkAdmin = (username, password) =>
  ADMINS.some(a => a.username === username && a.password === password);

// ── Auth middleware ── accepts adminLoggedIn OR staffLoggedIn with admin/superadmin role
const adminAuth = (req, res, next) => {
  const isAdmin = req.session.adminLoggedIn ||
    (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
  if (isAdmin) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  if (req.path !== '/login') {
    const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
    if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    return res.redirect('/staff/login#admin');
  }
  next();
};

router.get('/login', (req, res) => {
  if (req.session.adminLoggedIn || req.session.staffLoggedIn) return res.redirect('/admin');
  return res.redirect('/staff/login#admin');
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (checkAdmin(username, password)) {
    req.session.adminLoggedIn = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: 'Admin Login', error: 'Incorrect username or password.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/staff/login'));
});

// ── PROFILE PAGE ──
router.get('/profile', (req, res) => {
  const isSuperAdmin = req.session.superAdminLoggedIn ||
    (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
  const isAdmin = req.session.adminLoggedIn ||
    (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
  if (!isAdmin) return res.redirect('/staff/login');
  const currentAdmin = getCurrentAdmin(req);
  res.render('admin/profile', {
    title: 'My Profile — Admin',
    currentAdmin,
    isSuperAdmin,
  });
});

router.use(adminAuth);

router.get('/',                         adminController.getDashboard);
router.get('/events/new',               adminController.getNewEvent);
router.post('/events',                  adminController.postCreateEvent);
router.get('/events/:id/edit',          adminController.getEditEvent);
router.post('/events/:id',              adminController.postUpdateEvent);
router.post('/events/:id/delete',       adminController.deleteEvent);
router.post('/events/:id/toggle',       adminController.toggleEvent);

// ── Toggle individual ticket category on/off (stop selling) ──
router.post('/events/:id/ticket-toggle', async (req, res) => {
  try {
    const { category } = req.body;
    const event = await require('../models/Event').findById(req.params.id);
    if (!event) return res.json({ success: false, message: 'Event not found' });
    const tt = event.ticketTypes.find(t => t.category === category);
    if (!tt) return res.json({ success: false, message: 'Category not found' });
    tt.isActive = !tt.isActive;
    await event.save();
    res.json({ success: true, isActive: tt.isActive, category: tt.category, name: tt.name });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});
router.get('/bookings',                 adminController.getBookings);

// POST /admin/bookings/send-reminders — bulk send pending/failed payment reminders
router.post('/bookings/send-reminders', async (req, res) => {
  if (!req.session.adminLoggedIn) return res.json({ success: false, message: 'Not authorised' });
  try {
    const Booking = require('../models/Booking');
    const Event   = require('../models/Event');
    const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
    const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

    const now          = new Date();
    const oneHourAgo   = new Date(now - 60 * 60 * 1000);
    const twentyFourHrsAgo = new Date(now - 24 * 60 * 60 * 1000);

    // Find bookings where:
    // — still pending/failed
    // — immediate was already sent (or old enough)
    // — 24hr reminder not yet sent
    // — created at least 1 hour ago (give user time to complete)
    const bookings = await Booking.find({
      paymentStatus:    { $in: ['pending', 'failed'] },
      createdAt:        { $lte: oneHourAgo },
      reminder24SentAt: null,
    }).populate('user', 'firstName email phone').populate('event', 'name');

    let sent24 = 0, sentImmediate = 0;
    for (const b of bookings) {
      const user  = b.user;
      const event = b.event;
      if (!user) continue;
      const name  = user.firstName || 'there';
      const email = user.email || '';
      const phone = user.phone || '';
      const isOldEnoughFor24 = b.createdAt <= twentyFourHrsAgo;

      try {
        if (isOldEnoughFor24) {
          // Send 24hr reminder
          if (b.paymentStatus === 'pending') {
            if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          } else {
            if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          }
          await Booking.findByIdAndUpdate(b._id, { reminder24SentAt: new Date() });
          sent24++;
        } else if (!b.reminderImmediateSentAt) {
          // Send immediate if somehow missed
          if (b.paymentStatus === 'pending') {
            if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          } else {
            if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          }
          await Booking.findByIdAndUpdate(b._id, { reminderImmediateSentAt: new Date() });
          sentImmediate++;
        }
      } catch(e) { console.warn('Reminder error for', b.bookingRef, e.message); }
    }
    res.json({ success: true, sent24, sentImmediate, total: bookings.length });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

// ── POST /admin/bookings/:id/send-message — send WhatsApp+email to single pending/failed booking ──
router.post('/bookings/:id/send-message', async (req, res) => {
  try {
    const Booking = require('../models/Booking');
    const Event   = require('../models/Event');
    const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
    const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

    const booking = await Booking.findById(req.params.id)
      .populate('user', 'firstName email phone')
      .populate('event', 'name date venue');

    if (!booking) return res.json({ success: false, message: 'Booking not found.' });
    if (booking.paymentStatus === 'paid') return res.json({ success: false, message: 'Booking is already paid.' });

    const user  = booking.user;
    const event = booking.event;
    const name  = user?.firstName || 'Customer';
    const email = user?.email || '';
    const phone = user?.phone || '';

    let sent = 0;
    if (booking.paymentStatus === 'pending') {
      if (email) { await sendPendingPaymentReminder({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
      if (phone) { await sendWhatsAppPending({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
    } else if (booking.paymentStatus === 'failed') {
      if (email) { await sendFailedPaymentNotice({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
      if (phone) { await sendWhatsAppPaymentFailed({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
    }

    res.json({ success: true, message: `Message sent via ${sent} channel${sent !== 1 ? 's' : ''}.`, sent });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

router.get('/seatmap/:eventId',          adminController.getSeatMap);
router.post('/seatmap/:eventId',         adminController.postSeatMap);
router.post('/seatmap/:eventId/toggle',  adminController.toggleSeatMap);


// ── Sponsor Banners ──
const Banner = require('../models/Banner');

router.get('/banners', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/banners', { title: 'Sponsor Banners — Admin', banners, currentAdmin, isSuperAdmin });
  } catch(err) { res.redirect('/admin'); }
});

router.post('/banners', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const { title, image, linkUrl } = req.body;
    if (!image) return res.json({ success: false, message: 'No image provided.' });
    if (image.length > 7 * 1024 * 1024) return res.json({ success: false, message: 'Image too large (max 5MB).' });
    const count = await Banner.countDocuments();
    const banner = await Banner.create({ title: title||'', image, linkUrl: linkUrl||'', order: count });
    res.json({ success: true, bannerId: banner._id });
  } catch(err) { res.json({ success: false, message: err.message }); }
});

router.post('/banners/:id/toggle', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const b = await Banner.findById(req.params.id);
    if (!b) return res.json({ success: false });
    b.isVisible = !b.isVisible;
    await b.save();
    res.json({ success: true, isVisible: b.isVisible });
  } catch(err) { res.json({ success: false }); }
});

router.post('/banners/:id/delete', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/banners');
  await Banner.findByIdAndDelete(req.params.id).catch(()=>{});
  res.redirect('/admin/banners');
});

// Public API — visible banners for homepage
router.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find({ isVisible: true }).sort({ order: 1 }).select('image title linkUrl');
    res.json({ success: true, banners });
  } catch(err) { res.json({ success: false, banners: [] }); }
});

// ── Reviews admin ──
const Review = require('../models/Review');

router.get('/reviews', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
  try {
    const reviews = await Review.find()
      .populate('user', 'firstName lastName phone')
      .populate('event', 'name date')
      .sort({ createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/reviews', { title: 'Reviews — Admin', reviews, currentAdmin, isSuperAdmin });
  } catch(err) {
    res.redirect('/admin');
  }
});

router.post('/reviews/:id/toggle', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.json({ success: false });
    review.isVisible = !review.isVisible;
    await review.save();
    res.json({ success: true, isVisible: review.isVisible });
  } catch(err) {
    res.json({ success: false });
  }
});

router.post('/reviews/:id/delete', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/reviews');
  await Review.findByIdAndDelete(req.params.id).catch(()=>{});
  res.redirect('/admin/reviews');
});

// ── Admin: Staff management (admins can create/manage staff-role accounts) ──
router.get('/staff', async (req, res) => {
  try {
    const staff = await Staff.find({ role: 'staff' }).sort({ createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/staff', { title: 'Staff Management — Admin', staff, currentAdmin, isSuperAdmin });
  } catch(err) { res.redirect('/admin'); }
});

router.post('/staff', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, manualUsername, manualPassword, canScanQR, canViewBookings, canManageEvents } = req.body;
    let username, password;
    if (manualUsername && manualUsername.trim()) {
      username = manualUsername.trim().toLowerCase().replace(/\s+/g,'-');
      if (!manualPassword || manualPassword.trim().length < 4) return res.json({ success:false, message:'Password must be at least 4 characters.' });
      password = manualPassword.trim();
      const taken = await Staff.findOne({ username });
      if (taken) return res.json({ success:false, message:`Username "${username}" is already taken.` });
    } else {
      const base = `staff-${firstName.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
      const existing = await Staff.findOne({ username: base });
      username = existing ? `${base}${Math.floor(Math.random()*900)+100}` : base;
      password = `${username}-${(phone||'000').slice(-3)}`;
    }
    const member = await Staff.create({
      firstName, lastName: lastName||'', email, phone: phone||'',
      username, password, role: 'staff',
      canScanQR: canScanQR==='on', canViewBookings: canViewBookings==='on', canManageEvents: canManageEvents==='on',
      createdBy: req.session.staffUser?.id || null,
    });
    res.json({ success:true, username: member.username, password: member.password, id: member._id });
  } catch(err) {
    res.json({ success:false, message: err.code===11000 ? 'Email or username already exists.' : err.message });
  }
});

router.post('/staff/:id/toggle', async (req, res) => {
  try {
    const member = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!member) return res.json({ success:false, message:'Staff not found' });
    member.isActive = !member.isActive;
    await member.save();
    res.json({ success:true, isActive: member.isActive });
  } catch(err) { res.json({ success:false, message: err.message }); }
});

router.post('/staff/:id/delete', async (req, res) => {
  await Staff.findOneAndDelete({ _id: req.params.id, role: 'staff' }).catch(()=>{});
  res.redirect('/admin/staff');
});

// ── Admin error handler — keeps user inside admin context ──
router.use((err, req, res, next) => {
  console.error('[ADMIN ERROR]', req.path, err.message);
  const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
  if (isJson) return res.status(500).json({ success: false, message: err.message });
  res.status(500).render('admin/error', {
    title:      'Error — Admin',
    status:     500,
    errTitle:   'SOMETHING WENT WRONG',
    errMessage: 'An unexpected error occurred. Please try again.',
    errDetail:  process.env.NODE_ENV !== 'production' ? err.message : null,
  });
});

module.exports = router;