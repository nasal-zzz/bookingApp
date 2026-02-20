const mongoose = require('mongoose');

const ticketTypeSchema = new mongoose.Schema({
  name:        { type: String, required: true },   // "General", "VIP"
  price:       { type: Number, required: true },
  totalSeats:  { type: Number, required: true },
  bookedSeats: { type: Number, default: 0 },
  includes:    [String],
  isActive:    { type: Boolean, default: true },
});

ticketTypeSchema.virtual('availableSeats').get(function () {
  return this.totalSeats - this.bookedSeats;
});

ticketTypeSchema.virtual('isSoldOut').get(function () {
  return this.bookedSeats >= this.totalSeats;
});

const eventSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  tagline:         { type: String, default: '' },
  description:     { type: String, default: '' },
  date:            { type: Date, required: true },
  doorsOpen:       { type: String, default: '8:30 PM' },
  endTime:         { type: String, default: '4:00 AM' },
  venue:           { type: String, required: true },
  venueAddress:    { type: String, default: '' },
  dressCode:       { type: String, default: 'All Black' },
  ageLimit:        { type: Number, default: 18 },
  convenienceFee:  { type: Number, default: 20 },
  ticketTypes:     [ticketTypeSchema],
  gallery:         [String],
  isActive:        { type: Boolean, default: true },
  isSoldOut:       { type: Boolean, default: false },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

module.exports = mongoose.model('Event', eventSchema);
