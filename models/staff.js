const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, default: '', trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:      { type: String, default: '', trim: true },
  username:   { type: String, required: true, unique: true, trim: true },
  password:   { type: String, required: true },  // plain for now, hashed in production
  role:       { type: String, enum: ['superadmin', 'admin', 'staff'], default: 'staff' },
  isActive:   { type: Boolean, default: true },
  // Staff restrictions (ignored for superadmin/admin)
  canScanQR:       { type: Boolean, default: true },
  canViewBookings: { type: Boolean, default: false },
  canManageEvents: { type: Boolean, default: false },
  // Created by which superadmin
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
}, { timestamps: true });

staffSchema.virtual('fullName').get(function() {
  return (this.firstName + ' ' + this.lastName).trim();
});

module.exports = mongoose.model('Staff', staffSchema);