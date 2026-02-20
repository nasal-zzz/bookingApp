const OTP = require('../models/OTP');
const twilio = require('twilio');

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via Twilio SMS
const sendOTP = async (phone, otp) => {
  // In development, just log the OTP
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n📱 OTP for ${phone}: ${otp}\n`);
    return { success: true, dev: true };
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      body: `Your NightPass OTP is: ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    return { success: true };
  } catch (err) {
    console.error('Twilio Error:', err.message);
    return { success: false, error: err.message };
  }
};

// Create and save OTP to DB
const createAndSendOTP = async (phone, purpose = 'login') => {
  // Delete any existing OTP for this phone
  await OTP.deleteMany({ phone });

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTP.create({ phone, otp, purpose, expiresAt });

  const result = await sendOTP(phone, otp);
  return result;
};

// Verify OTP
const verifyOTP = async (phone, otp) => {
  const record = await OTP.findOne({ phone, verified: false });

  if (!record) {
    return { success: false, message: 'OTP not found or already used. Please request a new one.' };
  }

  if (record.attempts >= 5) {
    await OTP.deleteMany({ phone });
    return { success: false, message: 'Too many attempts. Please request a new OTP.' };
  }

  if (new Date() > record.expiresAt) {
    await OTP.deleteMany({ phone });
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    await record.save();
    return { success: false, message: `Incorrect OTP. ${5 - record.attempts} attempts remaining.` };
  }

  // Mark as verified and delete
  await OTP.deleteMany({ phone });
  return { success: true };
};

module.exports = { createAndSendOTP, verifyOTP };
