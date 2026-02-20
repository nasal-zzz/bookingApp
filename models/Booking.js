const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  age:     { type: Number, required: true },
  special: { type: String, default: '' },
});

const ticketSchema = new mongoose.Schema({
  ticketId:     { type: String, required: true },  // removed unique:true — handled at booking level
  attendee:     attendeeSchema,
  qrCode:       { type: String, default: '' },
  qrData:       { type: String, default: '' },
  isUsed:       { type: Boolean, default: false },
  usedAt:       { type: Date, default: null },
  usedByDevice: { type: String, default: null },
  scannedBy:    { type: String, default: null },
});

// Generate booking ref — called before schema so it's available at creation time
function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'NP-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const bookingSchema = new mongoose.Schema({
  // bookingRef generated as default — so it exists BEFORE validation
  bookingRef:     { type: String, unique: true, default: generateRef },

  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event:          { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  ticketType:     { type: String, required: true },
  pricePerTicket: { type: Number, required: true },
  quantity:       { type: Number, required: true },
  subtotal:       { type: Number, required: true },
  discount:       { type: Number, default: 0 },
  couponCode:     { type: String, default: null },
  convenienceFee: { type: Number, default: 20 },
  totalAmount:    { type: Number, required: true },
  tickets:        [ticketSchema],

  // Payment
  paymentStatus:  { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentId:      { type: String, default: null },
  orderId:        { type: String, default: null },
  signature:      { type: String, default: null },

  // Contact
  contactPhone:   { type: String, default: '' },
  contactEmail:   { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
