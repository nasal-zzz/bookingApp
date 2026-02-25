const express  = require('express');
const router   = express.Router();
const passport = require('../config/passport');
const authController = require('../controllers/authController');
const { redirectIfAuth, noCache } = require('../middleware/auth');
const { signToken } = require('../middleware/auth');

// ── PAGES ──
router.get('/login',        noCache, redirectIfAuth, authController.getLogin);
router.get('/signup',       noCache, redirectIfAuth, authController.getSignup);
router.get('/otp',          noCache, authController.getOTP);
router.get('/verify-email', noCache, authController.getVerifyEmail);
router.get('/verify-phone', noCache, authController.getVerifyPhone);

// ── PHONE LOGIN OTP ──
router.post('/send-otp',   authController.sendLoginOTP);
router.post('/signup',     authController.postSignup);
router.post('/verify-otp', authController.verifyOTPHandler);
router.post('/resend-otp', authController.resendOTP);

// ── EMAIL VERIFY OTP ──
router.post('/verify-email-otp', authController.verifyEmailOTP);
router.post('/resend-email-otp', authController.resendEmailOTP);

// ── PHONE ADD/VERIFY OTP (Google users) ──
router.post('/send-phone-otp',   authController.sendPhoneOTP);
router.post('/verify-phone-otp', authController.verifyPhoneOTP);
router.post('/resend-phone-otp', authController.resendPhoneOTP);

// ── GOOGLE OAUTH ──
router.get('/google', (req, res, next) => {
  // Save ?next into OAuth state so it survives the Google redirect round-trip
  const state = req.query.next ? encodeURIComponent(req.query.next) : '';
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: state || undefined,
  })(req, res, next);
});
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login?error=google_failed', session: true }),
  async (req, res) => {
    try {
      // Recover the ?next= URL from OAuth state parameter
      const rawState = req.query.state || '';
      if (rawState) {
        try {
          const nextUrl = decodeURIComponent(rawState);
          // Only allow internal paths (no protocol/host)
          if (nextUrl.startsWith('/') && !req.session.redirectAfterLogin) {
            req.session.redirectAfterLogin = nextUrl;
          }
        } catch(e) {}
      }
      // Attach googleUser for controller
      req.googleUser = {
        googleId:  req.user.googleId || req.user.id,
        email:     req.user.email,
        firstName: req.user.firstName || req.user.displayName?.split(' ')[0] || '',
        lastName:  req.user.lastName  || req.user.displayName?.split(' ').slice(1).join(' ') || '',
        avatar:    req.user.avatar    || req.user.photos?.[0]?.value || '',
      };
      await authController.googleCallback(req, res);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('/auth/login?error=google_failed');
    }
  }
);

// ── LOGOUT ──
router.get('/logout', noCache, authController.logout);

module.exports = router;