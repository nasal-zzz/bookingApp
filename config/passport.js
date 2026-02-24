

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email     = profile.emails?.[0]?.value || '';
    const googleId  = profile.id;
    const firstName = profile.name?.givenName  || profile.displayName || 'User';
    const lastName  = profile.name?.familyName || '';
    const avatar    = profile.photos?.[0]?.value || '';

    // 1 — Existing Google user
    let user = await User.findOne({ googleId });
    if (user) {
      if (!user.avatar && avatar) { user.avatar = avatar; await user.save(); }
      return done(null, user);
    }

    // 2 — Existing phone-signup user with same email → link Google
    if (email) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId      = googleId;
        user.emailVerified = true;
        if (!user.avatar && avatar) user.avatar = avatar;
        await user.save();
        return done(null, user);
      }
    }

    // 3 — Brand new user — create WITHOUT phone (will be added on verify-phone page)
    user = await User.create({
      firstName, lastName, email, googleId, avatar,
      phone:         '',     // empty — filled after phone verify
      isVerified:    false,  // phone not verified
      emailVerified: true,   // Google email is trusted
      gender:        '',
    });

    return done(null, user);

  } catch (err) {
    console.error('Google OAuth error:', err.message);
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-__v');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;