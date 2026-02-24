const OTP        = require('../models/OTP');
const twilio     = require('twilio');
const nodemailer = require('nodemailer');

// ── Twilio SMS ──
const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') return null;
  return twilio(sid, token);
};

const SMS_FROM = () => process.env.TWILIO_PHONE_NUMBER || '';

// ── Nodemailer ──
const getMailer = () => nodemailer.createTransport({
  host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }, // allow self-signed certs
});

// ── Generate 6-digit OTP ──
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Send OTP via SMS ──
const sendSmsOTP = async (phone, otp) => {
  const client = getTwilioClient();
  if (!client) {
    console.log('\n' + '='.repeat(50));
    console.log(`📱 [DEV] SMS OTP to: ${phone}`);
    console.log(`🔑 OTP Code: ${otp}`);
    console.log('='.repeat(50) + '\n');
    return { success: true, dev: true };
  }
  try {
    const msg = await client.messages.create({
      from: SMS_FROM(),
      to:   phone,
      body: `Your NightPass OTP is: ${otp}\nValid for 5 minutes. Do not share.\n— NightPass`,
    });
    console.log(`✅ SMS OTP sent to ${phone} | SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('❌ SMS OTP error:', err.message);
    if (err.code === 21211) return { success: false, message: 'Invalid phone number.' };
    return { success: false, message: 'Failed to send OTP. Please try again.' };
  }
};

// ── Send OTP via Email ──
const sendEmailOTP = async (email, otp) => {
  // DEV fallback — always log to console
  console.log('\n' + '='.repeat(50));
  console.log(`📧 Email OTP to: ${email}`);
  console.log(`🔑 OTP Code: ${otp}`);
  console.log('='.repeat(50) + '\n');

  // Try sending real email if SMTP configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { success: true, dev: true }; // dev mode
  }

  try {
    const mailer = getMailer();
    await mailer.sendMail({
      from:    `"NightPass" <${process.env.SMTP_USER}>`,
      to:      email,
      subject: `${otp} is your NightPass verification code`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0B0B0F;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0F;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#14141C;border-radius:12px;overflow:hidden;border:1px solid rgba(106,13,173,0.3);">
        <!-- Header -->
        <tr><td style="background:#6A0DAD;padding:24px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:6px;font-weight:900;">NIGHTPASS</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 36px;">
          <p style="color:#B3B3B3;font-size:14px;margin:0 0 8px;">Hi there,</p>
          <p style="color:#fff;font-size:15px;line-height:1.6;margin:0 0 28px;">
            Your email verification code for NightPass is:
          </p>
          <!-- OTP Box -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <div style="background:#0B0B0F;border:2px solid rgba(106,13,173,0.5);border-radius:10px;padding:24px;display:inline-block;margin:0 0 28px;">
                <span style="font-family:monospace;font-size:38px;letter-spacing:12px;color:#6A0DAD;font-weight:700;">${otp}</span>
              </div>
            </td></tr>
          </table>
          <p style="color:#666;font-size:13px;margin:0 0 6px;">⏱ Valid for <strong style="color:#fff;">5 minutes</strong></p>
          <p style="color:#666;font-size:13px;margin:0;">🔒 Never share this code with anyone — NightPass will never ask for it.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#0B0B0F;padding:16px 36px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#444;font-size:12px;margin:0;text-align:center;">
            If you didn't create a NightPass account, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    console.log(`✅ Email OTP sent to ${email}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    // Don't block signup — OTP is already logged to console in dev
    // Return success so flow continues; OTP is in server logs
    return { success: true, dev: true, warning: err.message };
  }
};

// ── Create + send via SMS ──
const createAndSendOTP = async (phone, purpose = 'login') => {
  await OTP.deleteMany({ phone });
  const otp = generateOTP();
  await OTP.create({ phone, otp, purpose, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  return sendSmsOTP(phone, otp);
};

// ── Create + send via Email ──
const createAndSendEmailOTP = async (email, purpose = 'email-verify') => {
  await OTP.deleteMany({ phone: email });
  const otp = generateOTP();
  await OTP.create({ phone: email, otp, purpose, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  return sendEmailOTP(email, otp);
};

// ── Verify OTP ──
const verifyOTP = async (key, otp) => {
  const record = await OTP.findOne({ phone: key, verified: false });
  if (!record) return { success: false, message: 'OTP not found or already used. Please request a new one.' };
  if (record.attempts >= 5) {
    await OTP.deleteMany({ phone: key });
    return { success: false, message: 'Too many attempts. Please request a new OTP.' };
  }
  if (new Date() > record.expiresAt) {
    await OTP.deleteMany({ phone: key });
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }
  if (record.otp !== otp) {
    record.attempts += 1;
    await record.save();
    const remaining = 5 - record.attempts;
    return { success: false, message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` };
  }
  await OTP.deleteMany({ phone: key });
  return { success: true };
};

module.exports = { createAndSendOTP, createAndSendEmailOTP, verifyOTP };