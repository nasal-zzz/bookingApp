// const express = require('express');
// const router = express.Router();
// const userController = require('../controllers/userController');
// const { requireAuth } = require('../middleware/auth');

// router.get('/profile',                      requireAuth, userController.getProfile);
// router.post('/profile/update',              requireAuth, userController.updateProfile);
// router.delete('/delete-booking/:bookingId', requireAuth, userController.deleteBooking);

// module.exports = router;

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

router.get('/profile',                      requireAuth, userController.getProfile);
router.post('/profile/update',              requireAuth, userController.updateProfile);
router.delete('/delete-booking/:bookingId', requireAuth, userController.deleteBooking);


// ── Avatar ──
router.post('/avatar', requireAuth, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar || !avatar.startsWith('data:image/')) {
      return res.json({ success: false, message: 'Invalid image data.' });
    }
    // Rough size check — base64 ~1.37x actual, 200x200 JPEG ≈ ~20-50KB
    if (avatar.length > 200000) {
      return res.json({ success: false, message: 'Image too large after processing.' });
    }
    await require('../models/User').findByIdAndUpdate(req.user._id, { avatar });
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

// ── Reviews ──
const Review = require('../models/Review');
const Booking = require('../models/Booking');

// POST /user/review — submit a review
router.post('/review', requireAuth, async (req, res) => {
  try {
    const { eventId, rating, text } = req.body;
    if (!eventId || !rating || !text) return res.json({ success: false, message: 'All fields required.' });
    const r = parseInt(rating);
    if (r < 1 || r > 5) return res.json({ success: false, message: 'Rating must be 1-5.' });
    if (text.trim().length < 5) return res.json({ success: false, message: 'Review too short.' });

    // Check for existing paid booking (optional but nice)
    const booking = await Booking.findOne({ user: req.user._id, event: eventId, paymentStatus: 'paid' });

    const review = await Review.findOneAndUpdate(
      { user: req.user._id, event: eventId },
      { rating: r, text: text.trim(), booking: booking?._id || null, isVisible: true },
      { upsert: true, new: true }
    );
    res.json({ success: true, reviewId: review._id });
  } catch (err) {
    console.error('Review error:', err);
    res.json({ success: false, message: err.message });
  }
});

// GET /user/my-review/:eventId — check if user already reviewed
router.get('/my-review/:eventId', requireAuth, async (req, res) => {
  try {
    const review = await Review.findOne({ user: req.user._id, event: req.params.eventId });
    res.json({ success: true, review: review || null });
  } catch(err) {
    res.json({ success: false });
  }
});

// GET /user/reviews/all — get all visible reviews (for homepage)
router.get('/reviews/all', async (req, res) => {
  try {
    const reviews = await Review.find({ isVisible: true })
      .populate('user', 'firstName lastName')
      .populate('event', 'name')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ success: true, reviews });
  } catch(err) {
    res.json({ success: false, reviews: [] });
  }
});

// GET /user/reviews/:eventId — get all reviews for an event
router.get('/reviews/:eventId', async (req, res) => {
  try {
    const reviews = await Review.find({ event: req.params.eventId, isVisible: true })
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, reviews });
  } catch(err) {
    res.json({ success: false });
  }
});

module.exports = router;