const twilio = require('twilio');
const fs   = require('fs');
const path = require('path');

const getClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') return null;
  return twilio(sid, token);
};

const WA_FROM = () => process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const APP_URL = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Save a base64 QR code PNG to /public/qr/ and return its public URL.
 */
const saveQRImage = (base64DataUrl, ticketId) => {
  try {
    // Strip the data:image/png;base64, prefix
    const base64 = base64DataUrl.replace(/^data:image\/png;base64,/, '')
                                .replace(/^data:image\/jpeg;base64,/, '');
    const filename = `${ticketId}.png`;
    const filePath = path.join(__dirname, '..', 'public', 'qr', filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return `${APP_URL()}/qr/${filename}`;
  } catch (e) {
    console.error('QR image save failed:', e.message);
    return null;
  }
};

/**
 * Send booking confirmation via WhatsApp.
 * Sends 1 confirmation text message, then 1 image per ticket (QR code).
 */
const sendWhatsAppTickets = async ({ phone, name, booking, event }) => {
  // ── DEBUG LOGS ──
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const waFrom = process.env.TWILIO_WHATSAPP_FROM;
  const appUrl = process.env.APP_URL;
  console.log('📱 WhatsApp sendTickets called');
  console.log('   Phone:', phone);
  console.log('   TWILIO_ACCOUNT_SID:', sid ? sid.substring(0,8) + '...' : '❌ MISSING');
  console.log('   TWILIO_AUTH_TOKEN:', tok ? '✅ set' : '❌ MISSING');
  console.log('   TWILIO_WHATSAPP_FROM:', waFrom || '⚠ using default sandbox');
  console.log('   APP_URL:', appUrl || '⚠ using localhost:3000');
  console.log('   Tickets count:', booking.tickets.length);

  const client = getClient();
  console.log('   Twilio client:', client ? '✅ created' : '❌ NOT created (check SID/token)');

  const to     = `whatsapp:${phone}`;
  const from   = WA_FROM();

  const ticketUrl = `${APP_URL()}/booking/ticket/${booking._id}`;

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });

  const ticketLines = booking.tickets.map((t, i) =>
    `  ${i + 1}. ${t.attendee.name} — ${t.ticketId}`
  ).join('\n');

  // ── Confirmation text message ──
  const confirmMsg =
`🎟 *Booking Confirmed — MEE!*

Hi ${name}! Your tickets are ready. 🎉

*${event.name.toUpperCase()}*
📅 ${eventDate}
⏰ ${event.doorsOpen || '8:00 PM'} – ${event.endTime || '4:00 AM'}
📍 ${event.venue}
👗 ${event.dressCode || 'Smart Casual'}

*Booking Ref:* ${booking.bookingRef}
*Tickets:* ${booking.quantity} × ${booking.ticketType}
*Total Paid:* ₹${booking.totalAmount.toLocaleString('en-IN')}

*Your Attendees:*
${ticketLines}

🔗 *View All Tickets Online:*
${ticketUrl}

Your QR passes are attached below 👇
⚠️ Each QR is for *one-time entry only*. Carry a valid photo ID.`;

  // DEV MODE — no Twilio configured
  if (!client) {
    console.log('\n' + '='.repeat(60));
    console.log('📱 [DEV] WhatsApp to:', phone);
    console.log(confirmMsg);
    // Still save QR files in dev so we can verify
    booking.tickets.forEach(t => {
      if (t.qrCode) {
        const url = saveQRImage(t.qrCode, t.ticketId);
        console.log(`  📸 QR saved: ${url}`);
      }
    });
    console.log('='.repeat(60) + '\n');
    return { success: true, dev: true };
  }

  try {
    // 1. Send the confirmation text first
    await client.messages.create({ from, to, body: confirmMsg });
    console.log(`✅ WhatsApp confirmation sent to ${phone}`);

    // 2. Send each ticket as a QR image with caption
    for (let i = 0; i < booking.tickets.length; i++) {
      const t = booking.tickets[i];

      if (!t.qrCode || !t.qrCode.startsWith('data:image')) {
        console.warn(`⚠ No QR image for ticket ${i + 1}, skipping`);
        continue;
      }

      // Save QR to /public/qr/ so Twilio can fetch it via URL
      const qrUrl = saveQRImage(t.qrCode, t.ticketId);
      if (!qrUrl) continue;

      const caption = `🎫 *Ticket ${i + 1} of ${booking.quantity}*\n👤 ${t.attendee.name}\n🆔 ${t.ticketId}\n\nScan this QR at the venue entrance.`;

      await client.messages.create({
        from,
        to,
        body:     caption,
        mediaUrl: [qrUrl],   // Twilio fetches this URL to send as WhatsApp image
      });

      console.log(`✅ QR image sent for ticket ${i + 1}: ${qrUrl}`);

      // Small delay between messages to avoid rate limiting
      if (i < booking.tickets.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return { success: true };
  } catch (err) {
    console.error('❌ WhatsApp send error:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendWhatsAppTickets };

// ── WhatsApp: Pending payment reminder ──
const sendWhatsAppPending = async ({ phone, name, booking, event }) => {
  try {
    const appUrl = process.env.APP_URL || '';
    const msg =
      `⏳ *Booking Pending — MEE*\n\n` +
      `Hi ${name}! Your booking for *${event.name || 'the event'}* is pending payment.\n\n` +
      `📋 Ref: *${booking.bookingRef}*\n` +
      `🎟️ ${booking.quantity} × ${booking.ticketType}\n` +
      `💰 ₹${(booking.totalAmount||0).toLocaleString('en-IN')}\n\n` +
      `Complete your payment here:\n${appUrl}/booking/retry-payment/${booking._id}\n\n` +
      `Hurry — reserved seats may expire soon!`;

    const rawPhone = String(phone).replace(/\D/g, '');
    const normalised = rawPhone.startsWith('91') ? rawPhone : '91' + rawPhone;
    const to = `whatsapp:+${normalised}`;
    const client2 = getClient();
    console.log('📱 [WA Pending] to:', to, '| client:', client2 ? 'ready' : 'sandbox/no-client');
    if (client2) {
      const result = await client2.messages.create({ from: WA_FROM(), to, body: msg });
      console.log('✅ WA Pending sent, SID:', result.sid);
    } else {
      console.log(`📱 [WA Pending DEV] → ${to}:\n${msg}`);
    }
    return { success: true };
  } catch(err) {
    // Twilio sandbox error 63016 = number not opted in. Log clearly.
    console.error('❌ WA pending error:', err.message, '| Code:', err.code);
    if (err.code === 63016) {
      console.warn('ℹ️  Twilio sandbox: recipient must send "join <keyword>" to', WA_FROM(), 'first.');
    }
    return { success: false, error: err.message };
  }
};

// ── WhatsApp: Failed payment notice ──
const sendWhatsAppPaymentFailed = async ({ phone, name, booking, event }) => {
  try {
    const appUrl = process.env.APP_URL || '';
    const msg =
      `❌ *Payment Failed — MEE*\n\n` +
      `Hi ${name}, your payment for *${event.name || 'the event'}* could not be processed.\n\n` +
      `📋 Ref: *${booking.bookingRef}*\n` +
      `💰 ₹${(booking.totalAmount||0).toLocaleString('en-IN')}\n\n` +
      `*No amount has been charged.* If money was deducted, it will be refunded in 5–7 business days.\n\n` +
      `Try again here: ${appUrl}/booking/my-bookings\n\n` +
      `Need help? Call +91 99958 43003`;

    const rawPhone = String(phone).replace(/\D/g, '');
    const normalised = rawPhone.startsWith('91') ? rawPhone : '91' + rawPhone;
    const to = `whatsapp:+${normalised}`;
    const client3 = getClient();
    console.log('📱 [WA Failed] to:', to, '| client:', client3 ? 'ready' : 'sandbox/no-client');
    if (client3) {
      const result = await client3.messages.create({ from: WA_FROM(), to, body: msg });
      console.log('✅ WA Failed sent, SID:', result.sid);
    } else {
      console.log(`📱 [WA Failed DEV] → ${to}:\n${msg}`);
    }
    return { success: true };
  } catch(err) {
    console.error('❌ WA failed error:', err.message, '| Code:', err.code);
    if (err.code === 63016) {
      console.warn('ℹ️  Twilio sandbox: recipient must send "join <keyword>" to', WA_FROM(), 'first.');
    }
    return { success: false, error: err.message };
  }
};

module.exports = { sendWhatsAppTickets, sendWhatsAppPending, sendWhatsAppPaymentFailed };