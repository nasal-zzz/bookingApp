const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title:     { type: String, default: '' },
  image:     { type: String, required: true }, // base64 or URL
  linkUrl:   { type: String, default: '' },
  isVisible: { type: Boolean, default: true },
  order:     { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);