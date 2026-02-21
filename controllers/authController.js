const User = require('../models/User');
const { createAndSendOTP, verifyOTP } = require('../utils/otpHelper');
const { signToken } = require('../middleware/auth');

// ── GET /auth/login ──
exports.getLogin = (req, res) => {
  // Store ?next= param so we redirect there after login
  if (req.query.next) {
    req.session.redirectAfterLogin = req.query.next;
  }
  const error = req.session.error || null;
  const success = req.session.success || null;
  delete req.session.error;
  delete req.session.success;
  res.render('pages/login', {
    title: 'Login — NightPass',
    error,
    success,
  });
};

// ── GET /auth/signup ──
exports.getSignup = (req, res) => {
  res.render('pages/signup', {
    title: 'Sign Up — NightPass',
    error: req.session.error || null,
  });
  delete req.session.error;
};

// ── GET /auth/otp ──
exports.getOTP = (req, res) => {
  if (!req.session.otpPhone) return res.redirect('/auth/login');
  res.render('pages/otp', {
    title: 'Verify OTP — NightPass',
    phone: req.session.otpPhone,
    mode: req.session.otpMode || 'login',
  });
};

// ── POST /auth/send-otp (Login flow) ──
exports.sendLoginOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return res.json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });
    }

    const fullPhone = '+91' + phone;

    // Check user exists
    const user = await User.findOne({ phone: fullPhone });
    if (!user) {
      return res.json({
        success: false,
        message: 'No account found. Please sign up first.',
        redirect: '/auth/signup',
      });
    }

    // Send OTP
    const result = await createAndSendOTP(fullPhone, 'login');
    if (!result.success) {
      return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    req.session.otpPhone = fullPhone;
    req.session.otpMode = 'login';

    return res.json({ success: true, message: 'OTP sent successfully!', redirect: '/auth/otp' });
  } catch (err) {
    console.error('sendLoginOTP error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── POST /auth/signup ──
exports.postSignup = async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    if (!firstName || !phone) {
      return res.json({ success: false, message: 'Name and phone are required.' });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });
    }

    const fullPhone = '+91' + phone;

    // Check if already registered
    const existing = await User.findOne({ phone: fullPhone });
    if (existing) {
      return res.json({
        success: false,
        message: 'Phone already registered. Please log in.',
        redirect: '/auth/login',
      });
    }

    // Store signup data in session temporarily (create user after OTP verified)
    req.session.pendingUser = { firstName, lastName: lastName || '', email: email || '', phone: fullPhone };
    req.session.otpPhone = fullPhone;
    req.session.otpMode = 'signup';

    const result = await createAndSendOTP(fullPhone, 'signup');
    if (!result.success) {
      return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    return res.json({ success: true, redirect: '/auth/otp' });
  } catch (err) {
    console.error('postSignup error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── POST /auth/verify-otp ──
exports.verifyOTPHandler = async (req, res) => {
  try {
    const { otp } = req.body;
    const phone = req.session.otpPhone;
    const mode = req.session.otpMode;

    if (!phone) return res.json({ success: false, message: 'Session expired. Please start again.', redirect: '/auth/login' });

    const result = await verifyOTP(phone, otp);
    if (!result.success) {
      return res.json({ success: false, message: result.message });
    }

    let user;

    if (mode === 'signup') {
      // Create user
      const pending = req.session.pendingUser;
      if (!pending) return res.json({ success: false, message: 'Session expired.', redirect: '/auth/signup' });

      user = await User.create({
        firstName: pending.firstName,
        lastName: pending.lastName,
        email: pending.email,
        phone: pending.phone,
        isVerified: true,
      });
      delete req.session.pendingUser;
    } else {
      // Login — find existing user
      user = await User.findOne({ phone });
      if (!user) return res.json({ success: false, message: 'User not found.', redirect: '/auth/login' });
      user.isVerified = true;
      await user.save();
    }

    // Sign JWT
    const token = signToken(user._id);
    req.session.token = token;
    req.session.userId = user._id;
    delete req.session.otpPhone;
    delete req.session.otpMode;

    // Redirect to original page or booking
    const redirectTo = req.session.redirectAfterLogin || '/booking';
    delete req.session.redirectAfterLogin;

    // ── CRITICAL: save session to MongoDB BEFORE sending response ──
    // Without this, the homepage renders before session is persisted
    // and optionalAuth reads an empty session → shows Login button
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      return res.json({ success: true, redirect: redirectTo });
    });
  } catch (err) {
    console.error('verifyOTP error:', err);
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ── POST /auth/resend-otp ──
exports.resendOTP = async (req, res) => {
  try {
    const phone = req.session.otpPhone;
    if (!phone) return res.json({ success: false, message: 'Session expired.' });

    const result = await createAndSendOTP(phone, req.session.otpMode || 'login');
    if (!result.success) return res.json({ success: false, message: 'Failed to resend OTP.' });

    return res.json({ success: true, message: 'OTP resent successfully!' });
  } catch (err) {
    res.json({ success: false, message: 'Server error.' });
  }
};

// ── GET /auth/logout ──
exports.logout = (req, res) => {
  // passport logout MUST come first — it needs the session intact
  // calling session.destroy() first causes the crash
  if (req.logout) {
    req.logout((err) => {
      if (err) console.error('Passport logout error:', err);
      req.session.destroy(() => {
        res.clearCookie('np_token');
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  } else {
    // fallback if passport not initialized
    req.session.destroy(() => {
      res.clearCookie('np_token');
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  }
};

// ── Google OAuth callback (passport.js optional — manual below) ──
exports.googleCallback = async (req, res) => {
  try {
    const { googleId, email, firstName, lastName, avatar } = req.googleUser;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // Create new user from Google
      const phone = 'GOOGLE_' + googleId; // placeholder until phone added
      user = await User.create({ firstName, lastName, email, googleId, avatar, phone, isVerified: true });
    } else {
      user.googleId = googleId;
      user.isVerified = true;
      await user.save();
    }

    const token = signToken(user._id);
    req.session.token = token;
    req.session.userId = user._id;

    const redirectTo = req.session.redirectAfterLogin || '/booking';
    delete req.session.redirectAfterLogin;
    res.redirect(redirectTo);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect('/auth/login?error=google_failed');
  }
};
