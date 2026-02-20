const User = require('../models/User');
const Booking = require('../models/Booking');

// ── GET /user/profile ──
exports.getProfile = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });

    const totalSpent = bookings
      .filter(b => b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + b.totalAmount, 0);

    const totalTickets = bookings
      .filter(b => b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + b.quantity, 0);

    res.render('pages/profile', {
      title: 'My Profile — NightPass',
      user: req.user,
      bookings,
      stats: {
        totalBookings: bookings.filter(b => b.paymentStatus === 'paid').length,
        totalTickets,
        totalSpent,
      },
    });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).render('pages/error', { message: err.message, code: 500 });
  }
};

// ── POST /user/profile/update ──
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    if (!firstName || firstName.trim().length < 2) {
      return res.json({ success: false, message: 'First name must be at least 2 characters.' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ success: false, message: 'Enter a valid email address.' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      firstName: firstName.trim(),
      lastName: (lastName || '').trim(),
      email: (email || '').trim().toLowerCase(),
    });

    return res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.json({ success: false, message: 'Failed to update profile.' });
  }
};
