const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
  type:        { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
  value:       { type: Number, required: true },   // ₹ amount or % off
  minOrder:    { type: Number, default: 0 },        // minimum order value to apply
  maxUses:     { type: Number, default: 0 },        // 0 = unlimited
  usedCount:   { type: Number, default: 0 },
  validFrom:   { type: Date, default: null },
  validUntil:  { type: Date, default: null },
  isActive:    { type: Boolean, default: true },
  description: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);