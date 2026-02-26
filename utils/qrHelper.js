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

// Build QR payload for a single-entry ticket
const buildQRPayload = ({ ticketId, bookingRef, eventId, paymentId, attendeeName, ticketType, seatNumber }) => {
  return {
    t: ticketId,        // ticket ID
    b: bookingRef,      // booking reference
    e: eventId,         // event ID
    p: paymentId,       // payment ID
    n: attendeeName,    // attendee name
    ty: ticketType,     // ticket type
    sn: seatNumber || null,  // seat number e.g. "gold_s1"
    v: 1,               // version
    ts: Date.now(),     // timestamp
  };
};

// Build QR payload for a GROUP (multiple-entry) ticket — one QR for all attendees
// Scanned once at gate, grants entry to the whole group
const buildGroupQRPayload = ({ bookingRef, eventId, paymentId, ticketType, attendees, groupSize, seatNumbers }) => {
  return {
    grp: true,                          // flag: this is a group QR
    b:   bookingRef,                    // booking reference
    e:   eventId,                       // event ID
    p:   paymentId,                     // payment ID
    ty:  ticketType,                    // ticket type
    gs:  groupSize,                     // number of people in group
    ns:  attendees.map(a => a.name),   // all attendee names
    sns: seatNumbers || [],             // seat numbers e.g. ["family_s1","family_s2"]
    v:   1,
    ts:  Date.now(),
  };
};

module.exports = { generateTicketId, generateQRCode, buildQRPayload, buildGroupQRPayload };