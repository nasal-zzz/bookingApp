const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { optionalAuth } = require('../middleware/auth');

// Home page
router.get('/', optionalAuth, async (req, res) => {
  try {
    const event = await Event.findOne({ isActive: true }).sort({ date: 1 });
    res.render('pages/index', {
      title: 'NightPass — Book Your Party Entry',
      event,
      user: req.user || null,
    });
  } catch (err) {
    res.render('pages/index', { title: 'NightPass', event: null, user: null });
  }
});

// Payment page (GET — just renders the page, actual payment via POST API)
router.get('/payment', optionalAuth, (req, res) => {
  res.render('pages/payment', { title: 'Payment — NightPass', user: req.user || null });
});

module.exports = router;
