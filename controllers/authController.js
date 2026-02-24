const User = require('../models/User');
const { createAndSendOTP, createAndSendEmailOTP, verifyOTP } = require('../utils/otpHelper');
const { signToken } = require('../middleware/auth');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const redirectPage = (res, url, name, subtitle, color = '#6A0DAD') => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Please wait...</title>
  <style>
    body{background:#08080e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;}
    .w{text-align:center;}
    .s{width:40px;height:40px;border:3px solid rgba(255,255,255,0.08);border-top-color:${color};border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 1rem;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .n{color:${color};font-size:1rem;font-weight:600;margin-bottom:0.3rem;}
    .sub{color:#555;font-size:0.8rem;}
  </style></head>
  <body><div class="w"><div class="s"></div><div class="n">${name}</div><div class="sub">${subtitle}</div></div>
  <script>try{window.history.replaceState(null,'','/');window.location.replace('${url}');}catch(e){window.location.href='${url}';}<\/script>
  </body></html>`);
};

// ─────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────

exports.getLogin = (req, res) => {
  if (req.query.next) req.session.redirectAfterLogin = req.query.next;
  const error   = req.session.error   || null;
  const success = req.session.success || null;
  delete req.session.error; delete req.session.success;
  req.session.save(() => res.render('pages/login', { title: 'Login — NightPass', error, success }));
};

exports.getSignup = (req, res) => {
  if (req.query.next) req.session.redirectAfterLogin = req.query.next;
  const error = req.session.error || null;
  delete req.session.error;
  req.session.save(() => res.render('pages/signup', { title: 'Sign Up — NightPass', error }));
};

exports.getOTP = (req, res) => {
  if (!req.session.otpPhone) return res.redirect('/auth/login');
  res.render('pages/otp', {
    title: 'Verify OTP — NightPass',
    phone: req.session.otpPhone,
    mode:  req.session.otpMode || 'login',
  });
};

exports.getVerifyEmail = (req, res) => {
  if (!req.session.pendingEmailVerify) return res.redirect('/');
  res.render('pages/verify-email', {
    title: 'Verify Email — NightPass',
    email: req.session.pendingEmailVerify.email,
  });
};

exports.getVerifyPhone = (req, res) => {
  // Must be logged in (session.userId set) to reach this page
  if (!req.session.userId) return res.redirect('/auth/login');
  res.render('pages/verify-phone', { title: 'Verify Phone — NightPass' });
};

// ─────────────────────────────────────────────
// PHONE LOGIN
// ─────────────────────────────────────────────

exports.sendLoginOTP = async (req, res) => {
  try {
    const { phone, next } = req.body;
    if (!phone || !/^[6-9]\d{9}$/.test(phone))
      return res.json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });

    const fullPhone = '+91' + phone;
    const user = await User.findOne({ phone: fullPhone });
    if (!user)
      return res.json({ success: false, message: 'No account found. Please sign up first.', redirect: '/auth/signup' });

    const result = await createAndSendOTP(fullPhone, 'login');
    if (!result.success) return res.json({ success: false, message: result.message || 'Failed to send OTP.' });

    req.session.otpPhone = fullPhone;
    req.session.otpMode  = 'login';
    if (next && !req.session.redirectAfterLogin) req.session.redirectAfterLogin = next;
    await new Promise(r => req.session.save(r));
    return res.json({ success: true, message: 'OTP sent!', redirect: '/auth/otp' });
  } catch (err) {
    console.error('sendLoginOTP error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const phone = req.session.otpPhone;
    if (!phone) return res.json({ success: false, message: 'Session expired.' });
    const result = await createAndSendOTP(phone, req.session.otpMode || 'login');
    if (!result.success) return res.json({ success: false, message: 'Failed to resend OTP.' });
    return res.json({ success: true, message: 'OTP resent!' });
  } catch (err) {
    res.json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────

exports.postSignup = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, whatsapp, gender, place, district, next } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !gender || !place || !district)
      return res.json({ success: false, message: 'All fields are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.json({ success: false, message: 'Enter a valid email address.' });
    if (!/^[6-9]\d{9}$/.test(phone))
      return res.json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });

    const fullPhone = '+91' + phone;

    // Unique checks
    if (await User.findOne({ phone: fullPhone }))
      return res.json({ success: false, message: 'Phone already registered. Please log in.', redirect: '/auth/login' });
    if (await User.findOne({ email: email.trim().toLowerCase() }))
      return res.json({ success: false, message: 'Email already registered with another account.' });

    const fullWhatsapp = whatsapp && /^[6-9]\d{9}$/.test(whatsapp.trim())
      ? '+91' + whatsapp.trim() : fullPhone;

    // Store in session — don't create user until phone OTP verified
    req.session.pendingUser = {
      firstName, lastName, email: email.trim().toLowerCase(),
      phone: fullPhone, whatsapp: fullWhatsapp,
      gender, place, district,
    };
    req.session.otpPhone = fullPhone;
    req.session.otpMode  = 'signup';
    if (next && !req.session.redirectAfterLogin) req.session.redirectAfterLogin = next;

    const result = await createAndSendOTP(fullPhone, 'signup');
    if (!result.success) return res.json({ success: false, message: result.message || 'Failed to send OTP.' });

    await new Promise(r => req.session.save(r));
    return res.json({ success: true, redirect: '/auth/otp' });
  } catch (err) {
    console.error('postSignup error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
// VERIFY PHONE OTP (signup + login)
// ─────────────────────────────────────────────

exports.verifyOTPHandler = async (req, res) => {
  try {
    const { otp } = req.body;
    const phone   = req.session.otpPhone;
    const mode    = req.session.otpMode;

    if (!phone) return res.json({ success: false, message: 'Session expired.', redirect: '/auth/login' });

    const result = await verifyOTP(phone, otp);
    if (!result.success) return res.json({ success: false, message: result.message });

    // ── SIGNUP ──
    if (mode === 'signup') {
      const pending = req.session.pendingUser;
      if (!pending) return res.json({ success: false, message: 'Session expired.', redirect: '/auth/signup' });

      const user = await User.create({
        firstName:  pending.firstName,
        lastName:   pending.lastName,
        email:      pending.email,
        phone:      pending.phone,
        whatsapp:   pending.whatsapp || '',
        gender:     pending.gender   || '',
        place:      pending.place    || '',
        district:   pending.district || '',
        isVerified: true,
      });

      // Sign in immediately
      const token = signToken(user._id);
      req.session.token  = token;
      req.session.userId = user._id.toString();
      delete req.session.pendingUser;
      delete req.session.otpPhone;
      delete req.session.otpMode;

      // Now send email OTP to verify email
      const emailResult = await createAndSendEmailOTP(pending.email, 'email-verify');
      if (emailResult.success) {
        req.session.pendingEmailVerify = { userId: user._id.toString(), email: pending.email };
        await new Promise(r => req.session.save(r));
        return res.json({ success: true, redirect: '/auth/verify-email' });
      }

      // Email OTP failed — skip email verify, go to destination
      const redirectTo = req.session.redirectAfterLogin || '/';
      delete req.session.redirectAfterLogin;
      await new Promise(r => req.session.save(r));
      return res.json({ success: true, redirect: redirectTo });
    }

    // ── LOGIN ──
    const user = await User.findOne({ phone });
    if (!user) return res.json({ success: false, message: 'User not found.', redirect: '/auth/login' });

    user.isVerified = true;
    await user.save();

    const token = signToken(user._id);
    req.session.token  = token;
    req.session.userId = user._id.toString();
    delete req.session.otpPhone;
    delete req.session.otpMode;

    const redirectTo = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin;
    await new Promise(r => req.session.save(r));
    return res.json({ success: true, redirect: redirectTo });

  } catch (err) {
    console.error('verifyOTPHandler error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
// VERIFY EMAIL OTP
// ─────────────────────────────────────────────

exports.verifyEmailOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const pending  = req.session.pendingEmailVerify;
    if (!pending) return res.json({ success: false, message: 'Session expired.', redirect: '/' });

    const result = await verifyOTP(pending.email, otp);
    if (!result.success) return res.json({ success: false, message: result.message });

    await User.findByIdAndUpdate(pending.userId, { emailVerified: true });
    delete req.session.pendingEmailVerify;

    const redirectTo = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin;
    await new Promise(r => req.session.save(r));
    return res.json({ success: true, redirect: redirectTo });
  } catch (err) {
    console.error('verifyEmailOTP error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

exports.resendEmailOTP = async (req, res) => {
  try {
    const pending = req.session.pendingEmailVerify;
    if (!pending) return res.json({ success: false, message: 'Session expired.' });
    const result = await createAndSendEmailOTP(pending.email, 'email-verify');
    if (!result.success) return res.json({ success: false, message: result.message });
    return res.json({ success: true, message: 'OTP resent to your email!' });
  } catch (err) {
    res.json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
// PHONE VERIFY (Google users)
// ─────────────────────────────────────────────

exports.sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^[6-9]\d{9}$/.test(phone))
      return res.json({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' });

    const fullPhone = '+91' + phone;
    const userId = req.session.userId;
    if (!userId) return res.json({ success: false, message: 'Session expired. Please log in again.', redirect: '/auth/login' });

    // Check uniqueness — not taken by a DIFFERENT user
    const existing = await User.findOne({ phone: fullPhone });
    if (existing && existing._id.toString() !== userId.toString())
      return res.json({ success: false, message: 'This number is already registered with another account.' });

    const result = await createAndSendOTP(fullPhone, 'phone-verify');
    if (!result.success) return res.json({ success: false, message: result.message || 'Failed to send OTP.' });

    req.session.pendingPhoneVerify = { userId, phone: fullPhone };
    await new Promise(r => req.session.save(r));
    return res.json({ success: true, message: 'OTP sent!' });
  } catch (err) {
    console.error('sendPhoneOTP error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

exports.verifyPhoneOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const pending  = req.session.pendingPhoneVerify;
    if (!pending) return res.json({ success: false, message: 'Session expired.', redirect: '/auth/verify-phone' });

    const result = await verifyOTP(pending.phone, otp);
    if (!result.success) return res.json({ success: false, message: result.message });

    await User.findByIdAndUpdate(pending.userId, { phone: pending.phone, isVerified: true });
    delete req.session.pendingPhoneVerify;

    const redirectTo = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin;
    await new Promise(r => req.session.save(r));
    return res.json({ success: true, redirect: redirectTo });
  } catch (err) {
    console.error('verifyPhoneOTP error:', err);
    res.json({ success: false, message: 'Server error.' });
  }
};

exports.resendPhoneOTP = async (req, res) => {
  try {
    const pending = req.session.pendingPhoneVerify;
    if (!pending) return res.json({ success: false, message: 'Session expired.' });
    const result = await createAndSendOTP(pending.phone, 'phone-verify');
    if (!result.success) return res.json({ success: false, message: result.message });
    return res.json({ success: true, message: 'OTP resent!' });
  } catch (err) {
    res.json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
// GOOGLE CALLBACK
// ─────────────────────────────────────────────

exports.googleCallback = async (req, res) => {
  try {
    // req.user is already populated by passport (from passport.js)
    const user = req.user;
    if (!user) return res.redirect('/auth/login?error=google_failed');

    // Sign JWT and set session
    const token = signToken(user._id);
    req.session.token  = token;
    req.session.userId = user._id.toString();

    // Preserve redirectAfterLogin BEFORE saving session
    const redirectTo = req.session.redirectAfterLogin || '/';

    // New Google user (no phone yet) → go to verify-phone
    const needsPhone = !user.phone || user.phone.trim() === '' || !user.isVerified;
    if (needsPhone) {
      // Keep redirectAfterLogin so after phone verify they end up in the right place
      req.session.redirectAfterLogin = redirectTo;
      await new Promise(r => req.session.save(r));
      return redirectPage(res, '/auth/verify-phone',
        `Welcome, ${user.firstName}! 👋`, 'One more step — add your phone number', '#6A0DAD');
    }

    // Existing verified user → go to destination
    delete req.session.redirectAfterLogin;
    await new Promise(r => req.session.save(r));
    return redirectPage(res, redirectTo,
      `Welcome back, ${user.firstName}! 👋`, 'Setting up your session...', '#c8ff00');

  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect('/auth/login?error=google_failed');
  }
};

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

exports.logout = (req, res) => {
  if (req.logout) {
    req.logout((err) => {
      if (err) console.error('Passport logout error:', err);
      req.session.destroy(() => { res.clearCookie('np_token'); res.clearCookie('connect.sid'); res.redirect('/'); });
    });
  } else {
    req.session.destroy(() => { res.clearCookie('np_token'); res.clearCookie('connect.sid'); res.redirect('/'); });
  }
};