const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');

// Simple admin password check middleware
const adminAuth = (req, res, next) => {
  const adminPass = req.session.adminAuth;
  if (adminPass === process.env.ADMIN_PASSWORD) return next();

  // Check login form submission
  if (req.method === 'POST' && req.path === '/login') return next();

  // Return JSON error for API/fetch requests, HTML for browser navigation
  if (req.path !== '/login') {
    const isJson = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    if (isJson || req.xhr) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in to admin panel.' });
    }
    return res.render('admin/login', { title: 'Admin Login — NightPass', error: null });
  }
  next();
};

router.get('/login', (req, res) => {
  if (req.session.adminAuth === process.env.ADMIN_PASSWORD) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.adminAuth = password;
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: 'Admin Login', error: 'Incorrect password.' });
});

router.get('/logout', (req, res) => {
  delete req.session.adminAuth;
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

module.exports = router;
