// const mongoose = require('mongoose');

// const TIER_COLORS = {
//   standard:  '#a0a0a0',
//   silver:    '#c0c8d8',
//   gold:      '#f5c842',
//   platinum:  '#c8ff00',
//   vip:       '#bf80ff',
//   general:   '#a0a0a0',
// };

// const ticketTypeSchema = new mongoose.Schema({
//   name:        { type: String, required: true },
//   category:    { type: String, enum: ['standard','silver','gold','platinum','vip','general'], default: 'standard' },
//   price:       { type: Number, required: true },
//   totalSeats:  { type: Number, required: true },
//   bookedSeats: { type: Number, default: 0 },
//   includes:    [String],
//   isActive:    { type: Boolean, default: true },
// });

// ticketTypeSchema.virtual('availableSeats').get(function() {
//   return this.totalSeats - this.bookedSeats;
// });
// ticketTypeSchema.virtual('isSoldOut').get(function() {
//   return this.bookedSeats >= this.totalSeats;
// });
// ticketTypeSchema.virtual('color').get(function() {
//   return TIER_COLORS[this.category] || '#c8ff00';
// });

// const eventSchema = new mongoose.Schema({
//   name:           { type: String, required: true },
//   tagline:        { type: String, default: '' },
//   description:    { type: String, default: '' },
//   date:           { type: Date, required: true },
//   doorsOpen:      { type: String, default: '8:00 PM' },
//   endTime:        { type: String, default: '4:00 AM' },
//   venue:          { type: String, required: true },
//   venueAddress:   { type: String, default: '' },
//   dressCode:      { type: String, default: 'All Black' },
//   ageLimit:       { type: Number, default: 18 },
//   convenienceFee: { type: Number, default: 20 },
//   poster:         { type: String, default: '🎶' },
//   bannerDesktop:  { type: String, default: '' },   // landscape image URL for desktop slider
//   bannerMobile:   { type: String, default: '' },   // portrait image URL for mobile slider
//   genre:          { type: String, default: 'Electronic' },
//   ticketTypes:    [ticketTypeSchema],
//   isActive:       { type: Boolean, default: true },
//   isFeatured:     { type: Boolean, default: false },
// }, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// eventSchema.virtual('isEventSoldOut').get(function() {
//   return this.ticketTypes.every(t => t.bookedSeats >= t.totalSeats);
// });
// eventSchema.virtual('minPrice').get(function() {
//   const active = this.ticketTypes.filter(t => t.isActive && t.bookedSeats < t.totalSeats);
//   if (!active.length) return null;
//   return Math.min(...active.map(t => t.price));
// });

// module.exports = mongoose.model('Event', eventSchema);

const mongoose = require('mongoose');

// ── Artist Schema ──
const artistSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  designation: { type: String, default: '' },   // e.g. "DJ", "Live Act", "MC"
  photo:       { type: String, default: '' },   // base64 or URL
});

// ── Ticket Category Schema ──
const ticketTypeSchema = new mongoose.Schema({
  category:    {
    type: String,
    enum: ['platinum', 'gold', 'silver', 'fanfit', 'family'],
    required: true,
  },
  price:       { type: Number, required: true },
  ageLimit:    { type: Number, default: 18 },
  ticketType:  { type: String, enum: ['single', 'multiple'], default: 'single' },
  // family = combo of 4 tickets, filled by user at booking
  isCombo:     { type: Boolean, default: false },  // true only for family
  comboCount:  { type: Number, default: 1 },       // 4 for family, 1 for others
  totalSeats:  { type: Number, required: true },
  bookedSeats: { type: Number, default: 0 },
  terms:       { type: String, default: '' },      // terms & conditions
  isActive:    { type: Boolean, default: true },
});

ticketTypeSchema.virtual('availableSeats').get(function() {
  return this.totalSeats - this.bookedSeats;
});
ticketTypeSchema.virtual('isSoldOut').get(function() {
  return this.bookedSeats >= this.totalSeats;
});

// Colors per category
const CATEGORY_COLORS = {
  platinum: '#9D4EDD',
  gold:     '#f5c842',
  silver:   '#c0c8d8',
  fanfit:   '#00FF88',
  family:   '#FF6B6B',
};
ticketTypeSchema.virtual('color').get(function() {
  return CATEGORY_COLORS[this.category] || '#6A0DAD';
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
  convenienceFee:    { type: Number, default: 20 },

  // Meta
  dressCode:         { type: String, default: 'All Black' },
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
