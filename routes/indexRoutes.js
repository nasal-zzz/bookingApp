// const express = require('express');
// const router = express.Router();
// const Event = require('../models/Event');
// const { optionalAuth, noCache } = require('../middleware/auth');

// // Home page
// router.get('/', noCache, optionalAuth, async (req, res) => {
//   try {
//     const events = await Event.find({ isActive: true }).sort({ isFeatured: -1, date: 1 });
//     res.render('pages/index', {
//       title: 'NightPass — Book Your Party Entry',
//       events,
//       event: events[0] || null,
//       user: req.user || null,
//     });
//   } catch (err) {
//     res.render('pages/index', { title: 'NightPass', events: [], event: null, user: null });
//   }
// });

// // Event detail page — MUST be before module.exports
// router.get('/event/:id', noCache, optionalAuth, async (req, res) => {
//   try {
//     const event = await Event.findById(req.params.id);
//     if (!event || !event.isActive) return res.redirect('/');
//     res.render('pages/event-detail', {
//       title: `${event.name} — NightPass`,
//       event,
//       user: req.user || null,
//     });
//   } catch (err) {
//     res.redirect('/');
//   }
// });

// // Payment page
// router.get('/payment', optionalAuth, (req, res) => {
//   res.render('pages/payment', { title: 'Payment — NightPass', user: req.user || null });
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { optionalAuth, noCache } = require('../middleware/auth');

// Home page — noCache ensures back button always hits server
router.get('/', noCache, optionalAuth, async (req, res) => {
  try {
    const events = await Event.find({ isActive: true }).sort({ isFeatured: -1, date: 1 });
    res.render('pages/index', {
      title: 'NightPass — Book Your Party Entry',
      events,
      event: events[0] || null, // backward compat
      user: req.user || null,
    });
  } catch (err) {
    res.render('pages/index', { title: 'NightPass', events: [], event: null, user: null });
  }
});

// Event detail page
router.get('/event/:id', optionalAuth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || !event.isActive) {
      return res.status(404).render('pages/error', {
        title: '404 — NightPass',
        message: 'Event not found or no longer available.',
        code: 404,
      });
    }
    // Also fetch all active events so the detail page can show the hero slider
    const events = await Event.find({ isActive: true }).sort({ isFeatured: -1, date: 1 });
    res.render('pages/event-detail', {
      title: `${event.name} — NightPass`,
      event,
      events,
      user: req.user || null,
    });
  } catch (err) {
    console.error('Event detail error:', err);
    res.status(500).render('pages/error', {
      title: 'Error — NightPass',
      message: 'Could not load event.',
      code: 500,
    });
  }
});

// Payment page (GET — just renders the page, actual payment via POST API)
router.get('/payment', optionalAuth, (req, res) => {
  res.render('pages/payment', { title: 'Payment — NightPass', user: req.user || null });
});

module.exports = router;