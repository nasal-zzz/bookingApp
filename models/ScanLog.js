const mongoose = require('mongoose');

// Records every successful QR scan (entry granted)
const scanLogSchema = new mongoose.Schema({
  booking:    { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  event:      { type: mongoose.Schema.Types.ObjectId, ref: 'Event',   required: true },
  ticketId:   { type: String, required: true },
  bookingRef: { type: String, required: true },
  attendeeName:  { type: String, default: '' },
  attendeeAge:   { type: Number, default: 0 },
  attendeeGender:{ type: String, default: '' },
  ticketType: { type: String, default: '' },
  scannedBy:  { type: String, default: '' },  // staff username
  staffName:  { type: String, default: '' },  // staff full name
  scannedAt:  { type: Date,   default: Date.now },
  isGroup:    { type: Boolean, default: false },
  groupSize:  { type: Number,  default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('ScanLog', scanLogSchema);