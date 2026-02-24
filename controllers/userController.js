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
    const { firstName, lastName, email, whatsapp, gender, place, district } = req.body;

    if (!firstName || firstName.trim().length < 2)
      return res.json({ success: false, message: 'First name must be at least 2 characters.' });

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.json({ success: false, message: 'Enter a valid email address.' });

    const fullWa = whatsapp && /^[6-9]\d{9}$/.test(whatsapp.trim()) ? '+91' + whatsapp.trim() : '';

    await User.findByIdAndUpdate(req.user._id, {
      firstName: firstName.trim(),
      lastName:  (lastName || '').trim(),
      email:     (email || '').trim().toLowerCase(),
      whatsapp:  fullWa || req.user.whatsapp || '',
      gender:    gender || '',
      place:     (place || '').trim(),
      district:  district || '',
    });

    return res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.json({ success: false, message: 'Failed to update profile.' });
  }
};

// ── DELETE /user/delete-booking/:bookingId ──
exports.deleteBooking = async (req, res) => {
  try {
    const booking = await require('../models/Booking').findOne({
      _id: req.params.bookingId,
      user: req.user._id,
    });

    if (!booking) return res.json({ success: false, message: 'Booking not found.' });

    // Only allow deleting failed or pending bookings
    if (booking.paymentStatus === 'paid') {
      return res.json({ success: false, message: 'Paid bookings cannot be deleted.' });
    }

    await booking.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    console.error('deleteBooking error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};