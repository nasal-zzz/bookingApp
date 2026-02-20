const express  = require('express');
const router   = express.Router();
const passport = require('../config/passport');
const authController  = require('../controllers/authController');
const { redirectIfAuth, signToken } = require('../middleware/auth');

// ── PAGES ──
router.get('/login',  redirectIfAuth, authController.getLogin);
router.get('/signup', redirectIfAuth, authController.getSignup);
router.get('/otp',    authController.getOTP);

// ── PHONE OTP API ──
router.post('/send-otp',   authController.sendLoginOTP);
router.post('/signup',     authController.postSignup);
router.post('/verify-otp', authController.verifyOTPHandler);
router.post('/resend-otp', authController.resendOTP);

// ── GOOGLE OAUTH ──
// Step 1 — redirect user to Google
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account', // always show account picker
  })
);

// Step 2 — Google redirects back here after login
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login?error=google_failed',
    session: true,
  }),
  async (req, res) => {
    try {
      // req.user is set by passport after successful auth
      const user = req.user;

      // Issue our JWT token (same as phone login)
      const token = signToken(user._id);
      req.session.token  = token;
      req.session.userId = user._id;

      // Redirect to intended page or booking
      const redirectTo = req.session.redirectAfterLogin || '/booking';
      delete req.session.redirectAfterLogin;

      console.log(`✅ Google login: ${user.firstName} (${user.email})`);
      res.redirect(redirectTo);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('/auth/login?error=google_failed');
    }
  }
);

// ── LOGOUT ──
router.get('/logout', authController.logout);

module.exports = router;
