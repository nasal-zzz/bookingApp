const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email    = profile.emails?.[0]?.value || '';
    const googleId = profile.id;
    const firstName = profile.name?.givenName  || profile.displayName || 'User';
    const lastName  = profile.name?.familyName || '';
    const avatar    = profile.photos?.[0]?.value || '';

    // 1 — Check if user exists by googleId
    let user = await User.findOne({ googleId });

    if (user) {
      // Already signed up with Google — update avatar just in case
      user.avatar = avatar;
      await user.save();
      return done(null, user);
    }

    // 2 — Check if user exists by email (phone signup before)
    if (email) {
      user = await User.findOne({ email });
      if (user) {
        // Link Google to existing account
        user.googleId = googleId;
        user.avatar   = avatar;
        user.isVerified = true;
        await user.save();
        return done(null, user);
      }
    }

    // 3 — Brand new user — create account
    // Phone is required in our schema, use a placeholder for Google users
    user = await User.create({
      firstName,
      lastName,
      email,
      googleId,
      avatar,
      phone: 'GOOGLE_' + googleId, // placeholder — can update later
      isVerified: true,
    });

    return done(null, user);

  } catch (err) {
    console.error('Google OAuth error:', err);
    return done(err, null);
  }
}));

// Serialize — store user id in session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize — fetch user from DB on each request
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-__v');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
