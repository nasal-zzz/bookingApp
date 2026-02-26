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
const Event  = require('../models/Event');
const Banner = require('../models/Banner');
const { optionalAuth, noCache } = require('../middleware/auth');

// Home page — noCache ensures back button always hits server
router.get('/', noCache, optionalAuth, async (req, res) => {
  try {
    const allEvents   = await Event.find().sort({ date: -1 });
    const events       = allEvents.filter(ev => ev.isActive && new Date(ev.date) >= new Date());
    const pastEvents   = allEvents.filter(ev => new Date(ev.date) < new Date());
    const banners      = await Banner.find({ isVisible: true }).sort({ order: 1 }).lean();
    res.render('pages/index', {
      title: 'NightPass — Book Your Party Entry',
      events, pastEvents, banners,
      event: events[0] || null,
      user: req.user || null,
    });
  } catch (err) {
    res.render('pages/index', { title: 'NightPass', events: [], pastEvents: [], banners: [], event: null, user: null });
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
// Help & Support page
router.get('/support', optionalAuth, (req, res) => {
  res.render('pages/support', { title: 'Help & Support — NightPass', user: req.user || null });
});

// Support email send
router.post('/support/send', optionalAuth, async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.json({ success: false, message: 'All required fields must be filled.' });
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    if (!process.env.SMTP_USER) {
      // Dev mode — log but pretend success
      console.log(`📧 [Support DEV] From: ${name} <${email}> | ${subject}`);
      return res.json({ success: true });
    }
    await transporter.sendMail({
      from:    `"NightPass Support" <${process.env.SMTP_USER}>`,
      to:      'meemelattur@gmail.com',
      replyTo: email,
      subject: `[NightPass Support] ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#08080e;color:#e8e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#1a0030,#6A0DAD);padding:24px;text-align:center;">
            <h2 style="color:#fff;margin:0;letter-spacing:3px;">NIGHTPASS — SUPPORT REQUEST</h2>
          </div>
          <div style="padding:28px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px;color:#888;font-size:12px;width:120px;">NAME</td><td style="padding:8px;color:#fff;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:8px;color:#888;font-size:12px;">EMAIL</td><td style="padding:8px;color:#fff;">${email}</td></tr>
              <tr><td style="padding:8px;color:#888;font-size:12px;">PHONE</td><td style="padding:8px;color:#fff;">${phone || '—'}</td></tr>
              <tr><td style="padding:8px;color:#888;font-size:12px;">SUBJECT</td><td style="padding:8px;color:#9D4EDD;font-weight:700;">${subject}</td></tr>
            </table>
            <div style="margin-top:20px;background:#13131e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:18px;">
              <p style="color:#888;font-size:11px;margin-bottom:8px;">MESSAGE</p>
              <p style="color:#fff;line-height:1.7;white-space:pre-wrap;">${message}</p>
            </div>
          </div>
        </div>`,
    });
    res.json({ success: true });
  } catch(err) {
    console.error('Support email error:', err);
    res.json({ success: false, message: 'Failed to send email. Please contact us via WhatsApp.' });
  }
});