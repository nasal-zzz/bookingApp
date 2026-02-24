const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName:     { type: String, required: true, trim: true },
  lastName:      { type: String, trim: true, default: '' },
  phone:         { type: String, default: '', trim: true },        // empty until verified (Google users)
  whatsapp:      { type: String, default: '', trim: true },        // WhatsApp number
  email:         { type: String, trim: true, lowercase: true, default: '' },
  gender:        { type: String, enum: ['', 'male','female','other','prefer_not'], default: '' },
  place:         { type: String, trim: true, default: '' },        // City / Town
  district:      { type: String, trim: true, default: '' },        // District
  googleId:      { type: String, default: null },
  avatar:        { type: String, default: '' },
  isVerified:    { type: Boolean, default: false },   // phone OTP verified
  emailVerified: { type: Boolean, default: false },   // email OTP verified
  isActive:      { type: Boolean, default: true },
  bookings:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
}, { timestamps: true });

// Sparse unique indexes — allow multiple empty strings but enforce uniqueness for real values
userSchema.index({ phone: 1 }, { unique: true, sparse: true, partialFilterExpression: { phone: { $gt: '' } } });
userSchema.index({ email: 1 }, { unique: true, sparse: true, partialFilterExpression: { email: { $gt: '' } } });

userSchema.virtual('fullName').get(function () {
  return (this.firstName + ' ' + this.lastName).trim();
});

module.exports = mongoose.model('User', userSchema);