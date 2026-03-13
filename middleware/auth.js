
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Core: resolve user from session (passport OR jwt) ──
const resolveUser = async (req) => {
  if (req.user) return req.user;
  const token = req.session.token || req.cookies.np_token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-__v');
    if (user && user.isActive) return user;
  } catch (e) {}
  return null;
};

// ── Protect routes — redirect to login if not authenticated ──
const requireAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      req.session.redirectAfterLogin = req.originalUrl;
      // Save session BEFORE redirecting so redirectAfterLogin persists
      req.session.save(() => res.redirect('/auth/login'));
      return;
    }
    req.user        = user;
    res.locals.user = user;
    next();
  } catch (err) {
    req.session.destroy();
    res.redirect('/auth/login');
  }
};

// ── Optional auth ──
const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) { req.user = user; res.locals.user = user; }
  } catch (err) {}
  next();
};

// ── Redirect to home if already logged in ──
const redirectIfAuth = async (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  try {
    const user = await resolveUser(req);
    if (user) return res.redirect('/');
  } catch (err) {}
  next();
};

// ── No-cache ──
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

// ── Sign JWT ──
const signToken = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

module.exports = { requireAuth, optionalAuth, redirectIfAuth, noCache, signToken };