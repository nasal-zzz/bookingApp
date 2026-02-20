const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// Generate a unique ticket ID
const generateTicketId = (idx = 0) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'NP-';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += '-';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += `-T${idx + 1}`;
  return id;
};

// Generate QR code as base64 PNG
const generateQRCode = async (data) => {
  try {
    const qrDataURL = await QRCode.toDataURL(JSON.stringify(data), {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    return qrDataURL;
  } catch (err) {
    console.error('QR generation error:', err);
    throw err;
  }
};

// Build QR payload for a ticket
const buildQRPayload = ({ ticketId, bookingRef, eventId, paymentId, attendeeName, ticketType }) => {
  return {
    t: ticketId,        // ticket ID
    b: bookingRef,      // booking reference
    e: eventId,         // event ID
    p: paymentId,       // payment ID
    n: attendeeName,    // attendee name
    ty: ticketType,     // ticket type
    v: 1,               // version
    ts: Date.now(),     // timestamp
  };
};

module.exports = { generateTicketId, generateQRCode, buildQRPayload };
