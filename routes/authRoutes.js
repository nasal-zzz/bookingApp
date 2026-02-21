const express  = require('express');
const router   = express.Router();
const passport = require('../config/passport');
const authController = require('../controllers/authController');
const { redirectIfAuth, noCache, signToken } = require('../middleware/auth');

// ── PAGES ──
router.get('/login',  noCache, redirectIfAuth, authController.getLogin);
router.get('/signup', noCache, redirectIfAuth, authController.getSignup);
router.get('/otp',    noCache, authController.getOTP);

// ── PHONE OTP API ──
router.post('/send-otp',   authController.sendLoginOTP);
router.post('/signup',     authController.postSignup);
router.post('/verify-otp', authController.verifyOTPHandler);
router.post('/resend-otp', authController.resendOTP);

// ── GOOGLE OAUTH ──
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
);

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login?error=google_failed',
    session: true,
  }),
  async (req, res) => {
    try {
      const user  = req.user;
      const token = signToken(user._id);
      req.session.token  = token;
      req.session.userId = user._id;

      const redirectTo = req.session.redirectAfterLogin || '/booking';
      delete req.session.redirectAfterLogin;

      console.log(`✅ Google login: ${user.firstName} (${user.email})`);

      // ── Save session to MongoDB BEFORE redirect ──
      // Critical: ensures session is persisted so homepage shows profile
      await new Promise((resolve) => req.session.save(resolve));

      // ── Use a redirect page that clears browser history ──
      // This prevents back button going to Google auth pages
      // No-cache so back button never shows this callback URL
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="refresh" content="0;url=${redirectTo}"/>
  <title>Signing in...</title>
  <style>
    body{background:#08080e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Outfit',sans-serif;}
    .wrap{text-align:center;}
    .spinner{width:40px;height:40px;border:3px solid rgba(200,255,0,0.15);border-top-color:#c8ff00;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 1.2rem;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .name{color:#c8ff00;font-size:1.1rem;font-weight:600;margin-bottom:0.3rem;}
    .sub{color:#5a5a72;font-size:0.82rem;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="spinner"></div>
    <div class="name">Welcome, ${user.firstName}! 👋</div>
    <div class="sub">Setting up your session...</div>
  </div>
  <script>
    // Use replaceState so this callback URL is not in history
    // Then replace with destination so back button goes to home not Google
    try {
      window.history.replaceState(null, '', '/');
      window.location.replace('${redirectTo}');
    } catch(e) {
      window.location.href = '${redirectTo}';
    }
  </script>
</body>
</html>`);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('/auth/login?error=google_failed');
    }
  }
);

// ── LOGOUT ──
router.get('/logout', noCache, authController.logout);

module.exports = router;
