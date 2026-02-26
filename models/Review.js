const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event:     { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  booking:   { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null }, // optional: link to booking
  rating:    { type: Number, required: true, min: 1, max: 5 },
  text:      { type: String, required: true, trim: true, maxlength: 500 },
  isVisible: { type: Boolean, default: true }, // admin can hide
}, { timestamps: true });

// One review per user per event
reviewSchema.index({ user: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);