const mongoose = require('mongoose');

// ── Artist Schema ──
const artistSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  designation: { type: String, default: '' },   // e.g. "DJ", "Live Act", "MC"
  photo:       { type: String, default: '' },   // base64 or URL
});

// ── Ticket Category Schema ──
const ticketTypeSchema = new mongoose.Schema({
  category:    { type: String, required: true },   // free-text name e.g. "VIP", "Gold", "Family"
  name:        { type: String, default: '' },       // display name (same as category or custom)
  color:       { type: String, default: '#6A0DAD' }, // hex color chosen by admin
  price:       { type: Number, required: true },
  ageLimit:    { type: Number, default: 0 },
  ticketType:  { type: String, enum: ['single', 'multiple'], default: 'single' },
  isCombo:     { type: Boolean, default: false },
  comboCount:  { type: Number, default: 1 },
  totalSeats:  { type: Number, required: true },
  bookedSeats: { type: Number, default: 0 },
  terms:       { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
});

ticketTypeSchema.virtual('availableSeats').get(function() {
  return this.totalSeats - this.bookedSeats;
});
ticketTypeSchema.virtual('isSoldOut').get(function() {
  return this.bookedSeats >= this.totalSeats;
});

// ── Main Event Schema ──
const eventSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  shortDescription:  { type: String, default: '' },
  about:             { type: String, default: '' },

  // Banners
  bannerDesktop:     { type: String, default: '' },  // landing page banner
  bannerMobile:      { type: String, default: '' },  // mobile banner
  bannerDetail:      { type: String, default: '' },  // event detail page banner

  // Artists
  artists:           [artistSchema],

  // Date & Time
  date:              { type: Date, required: true },
  doorsOpen:         { type: String, default: '8:00 PM' },
  endTime:           { type: String, default: '4:00 AM' },

  // Location
  venue:             { type: String, required: true },
  venueAddress:      { type: String, default: '' },
  googleMapLink:     { type: String, default: '' },

  // Tickets
  ticketTypes:       [ticketTypeSchema],
  convenienceFee:    { type: Number, default: 0 },

  // Meta
  isActive:          { type: Boolean, default: true },
  isFeatured:        { type: Boolean, default: false },

}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

eventSchema.virtual('isEventSoldOut').get(function() {
  return this.ticketTypes.length > 0 &&
         this.ticketTypes.every(t => t.bookedSeats >= t.totalSeats);
});
eventSchema.virtual('minPrice').get(function() {
  const active = this.ticketTypes.filter(t => t.isActive && t.bookedSeats < t.totalSeats);
  if (!active.length) return null;
  return Math.min(...active.map(t => t.price));
});

module.exports = mongoose.model('Event', eventSchema);