const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, trim: true, default: '' },
  phone:      { type: String, required: true, unique: true, trim: true },
  email:      { type: String, trim: true, lowercase: true, default: '' },
  googleId:   { type: String, default: null },
  avatar:     { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },
  bookings:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
}, { timestamps: true });

userSchema.virtual('fullName').get(function () {
  return (this.firstName + ' ' + this.lastName).trim();
});

module.exports = mongoose.model('User', userSchema);
