const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone:     { type: String, required: true },
  otp:       { type: String, required: true },
  purpose:   { type: String, enum: ['login', 'signup', 'email-verify', 'phone-verify'], default: 'login' },
  attempts:  { type: Number, default: 0 },
  verified:  { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

module.exports = mongoose.model('OTP', otpSchema);