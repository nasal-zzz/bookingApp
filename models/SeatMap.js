const mongoose = require('mongoose');

// ── Individual seat (kept for backward compat, not used in zone-builder) ──
const seatSchema = new mongoose.Schema({
  seatId:      { type: String },
  row:         { type: String },
  number:      { type: Number },
  category:    { type: String },
  status:      { type: String, enum: ['available','booked','blocked'], default: 'available' },
  bookedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  x:           { type: Number, default: 0 },
  y:           { type: Number, default: 0 },
}, { _id: false });

// ── Zone / Section ──
const sectionSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, required: true },

  // ─ Zone visual properties saved by zone-builder ─
  zoneShape:   { type: String, enum: ['rect', 'round', 'triangle'], default: 'rect' },
  zoneW:       { type: Number, default: 200 },
  zoneH:       { type: Number, default: 100 },
  zoneRot:     { type: Number, default: 0 },   // degrees; 0 IS a valid saved value

  // Canvas position
  x:           { type: Number, default: 0 },
  y:           { type: Number, default: 0 },

  // Seat capacity
  totalSeats:  { type: Number, default: 0 },
  bookedSeats: { type: Number, default: 0 },

  // Legacy grid fields
  rows:        { type: Number, default: 1 },
  seatsPerRow: { type: Number, default: 1 },
  seats:       { type: [seatSchema], default: [] },
});

// ── Stage ──
const stageSchema = new mongoose.Schema({
  shape:  { type: String, enum: ['rectangle','semicircle','thrust','intheround'], default: 'rectangle' },
  label:  { type: String, default: 'STAGE' },
  x:      { type: Number, default: 100 },
  y:      { type: Number, default: 30 },
  width:  { type: Number, default: 500 },
  height: { type: Number, default: 120 },
}, { _id: false });

// ── SeatMap ──
const seatMapSchema = new mongoose.Schema({
  event:        { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
  stage:        { type: stageSchema, default: () => ({}) },
  sections:     [sectionSchema],
  canvasWidth:  { type: Number, default: 960 },
  canvasHeight: { type: Number, default: 760 },
  isActive:     { type: Boolean, default: false },

  // PNG snapshot of the venue map — shown to users on the booking/seatpicker page
  previewImage: { type: String, default: null },
}, { timestamps: true });

seatMapSchema.virtual('allSeats').get(function () {
  return this.sections.flatMap(s => s.seats);
});

module.exports = mongoose.model('SeatMap', seatMapSchema);
