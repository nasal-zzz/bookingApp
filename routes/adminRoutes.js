const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');

// ── Admin credentials ──
// Hardcoded admin + support for .env override
const ADMINS = [
  { username: 'admin-melatturpattu', password: 'mainAdminMelatturPattu' },
  // Extra admins can be added here or via env:
  // { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
];

const checkAdmin = (username, password) =>
  ADMINS.some(a => a.username === username && a.password === password);

// ── Auth middleware ──
const adminAuth = (req, res, next) => {
  if (req.session.adminLoggedIn) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  if (req.path !== '/login') {
    const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
    if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    return res.render('admin/login', { title: 'Admin Login — NightPass', error: null });
  }
  next();
};

router.get('/login', (req, res) => {
  if (req.session.adminLoggedIn) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', error: null });
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
  delete req.session.adminLoggedIn;
  delete req.session.adminUser;
  res.redirect('/admin/login');
});

router.use(adminAuth);

router.get('/',                         adminController.getDashboard);
router.get('/events/new',               adminController.getNewEvent);
router.post('/events',                  adminController.postCreateEvent);
router.get('/events/:id/edit',          adminController.getEditEvent);
router.post('/events/:id',              adminController.postUpdateEvent);
router.post('/events/:id/delete',       adminController.deleteEvent);
router.post('/events/:id/toggle',       adminController.toggleEvent);
router.get('/bookings',                 adminController.getBookings);

router.get('/seatmap/:eventId',          adminController.getSeatMap);
router.post('/seatmap/:eventId',         adminController.postSeatMap);
router.post('/seatmap/:eventId/toggle',  adminController.toggleSeatMap);

module.exports = router;
