const OTP    = require('../models/OTP');
const twilio = require('twilio');

// ── Twilio WhatsApp client ──
const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('AC_placeholder') || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') return null;
  return twilio(sid, token);
};

// WhatsApp sender number — must be Twilio sandbox or approved number
// Format: whatsapp:+14155238886  (Twilio sandbox default)
const WA_FROM = () => process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// ── Generate 6-digit OTP ──
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Send OTP via WhatsApp ──
const sendWhatsAppOTP = async (phone, otp) => {
  const client = getTwilioClient();

  // DEV MODE — print to terminal if Twilio not configured
  if (!client) {
    console.log('\n' + '='.repeat(50));
    console.log(`📱 [DEV] WhatsApp OTP to: ${phone}`);
    console.log(`🔑 OTP Code: ${otp}`);
    console.log('='.repeat(50) + '\n');
    return { success: true, dev: true };
  }

  const to  = `whatsapp:${phone}`;  // e.g. whatsapp:+919544258208
  const body = `🎟 *NightPass OTP*\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\n_NightPass — Your Party, Your Pass_`;

  try {
    const msg = await client.messages.create({
      from: WA_FROM(),
      to,
      body,
    });
    console.log(`✅ WhatsApp OTP sent to ${phone} | SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('❌ WhatsApp OTP error:', err.message);

    // Friendly error messages for common Twilio errors
    if (err.code === 63007 || err.message.includes('not opted in')) {
      return { success: false, error: 'not_opted_in', message: 'Please send "join <sandbox-word>" to the Twilio WhatsApp number first.' };
    }
    if (err.code === 21211) {
      return { success: false, error: 'invalid_number', message: 'Invalid phone number.' };
    }
    return { success: false, error: err.message, message: 'Failed to send WhatsApp OTP. Please try again.' };
  }
};

// ── Create OTP and send via WhatsApp ──
const createAndSendOTP = async (phone, purpose = 'login') => {
  // Delete any existing OTP for this phone
  await OTP.deleteMany({ phone });

  const otp       = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTP.create({ phone, otp, purpose, expiresAt });

  const result = await sendWhatsAppOTP(phone, otp);
  return result;
};

// ── Verify OTP ──
const verifyOTP = async (phone, otp) => {
  const record = await OTP.findOne({ phone, verified: false });

  if (!record) {
    return { success: false, message: 'OTP not found or already used. Please request a new one.' };
  }

  if (record.attempts >= 5) {
    await OTP.deleteMany({ phone });
    return { success: false, message: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  if (new Date() > record.expiresAt) {
    await OTP.deleteMany({ phone });
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    await record.save();
    const remaining = 5 - record.attempts;
    return { success: false, message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` };
  }

  await OTP.deleteMany({ phone });
  return { success: true };
};

module.exports = { createAndSendOTP, verifyOTP };
