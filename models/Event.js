const mongoose = require('mongoose');

const TIER_COLORS = {
  standard:  '#a0a0a0',
  silver:    '#c0c8d8',
  gold:      '#f5c842',
  platinum:  '#c8ff00',
  vip:       '#bf80ff',
  general:   '#a0a0a0',
};

const ticketTypeSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, enum: ['standard','silver','gold','platinum','vip','general'], default: 'standard' },
  price:       { type: Number, required: true },
  totalSeats:  { type: Number, required: true },
  bookedSeats: { type: Number, default: 0 },
  includes:    [String],
  isActive:    { type: Boolean, default: true },
});

ticketTypeSchema.virtual('availableSeats').get(function() {
  return this.totalSeats - this.bookedSeats;
});
ticketTypeSchema.virtual('isSoldOut').get(function() {
  return this.bookedSeats >= this.totalSeats;
});
ticketTypeSchema.virtual('color').get(function() {
  return TIER_COLORS[this.category] || '#c8ff00';
});

const eventSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  tagline:        { type: String, default: '' },
  description:    { type: String, default: '' },
  date:           { type: Date, required: true },
  doorsOpen:      { type: String, default: '8:00 PM' },
  endTime:        { type: String, default: '4:00 AM' },
  venue:          { type: String, required: true },
  venueAddress:   { type: String, default: '' },
  dressCode:      { type: String, default: 'All Black' },
  ageLimit:       { type: Number, default: 18 },
  convenienceFee: { type: Number, default: 20 },
  poster:         { type: String, default: '🎶' },
  genre:          { type: String, default: 'Electronic' },
  ticketTypes:    [ticketTypeSchema],
  isActive:       { type: Boolean, default: true },
  isFeatured:     { type: Boolean, default: false },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

eventSchema.virtual('isEventSoldOut').get(function() {
  return this.ticketTypes.every(t => t.bookedSeats >= t.totalSeats);
});
eventSchema.virtual('minPrice').get(function() {
  const active = this.ticketTypes.filter(t => t.isActive && t.bookedSeats < t.totalSeats);
  if (!active.length) return null;
  return Math.min(...active.map(t => t.price));
});

module.exports = mongoose.model('Event', eventSchema);
