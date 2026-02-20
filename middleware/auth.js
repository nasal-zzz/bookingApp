// const jwt = require('jsonwebtoken');
// const User = require('../models/User');

// // Protect routes — redirect to login if not authenticated
// const requireAuth = async (req, res, next) => {
//   try {
//     const token = req.session.token || req.cookies.np_token;

//     if (!token) {
//       req.session.redirectAfterLogin = req.originalUrl;
//       return res.redirect('/auth/login');
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id).select('-__v');

//     if (!user || !user.isActive) {
//       req.session.destroy();
//       return res.redirect('/auth/login');
//     }

//     req.user = user;
//     res.locals.user = user;
//     next();
//   } catch (err) {
//     req.session.destroy();
//     res.redirect('/auth/login');
//   }
// };

// // Optional auth — attach user if logged in but don't block
// const optionalAuth = async (req, res, next) => {
//   try {
//     const token = req.session.token || req.cookies.np_token;
//     if (token) {
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       const user = await User.findById(decoded.id);
//       if (user) {
//         req.user = user;
//         res.locals.user = user;
//       }
//     }
//   } catch (err) { /* ignore */ }
//   next();
// };

// // Redirect to home if already logged in
// const redirectIfAuth = (req, res, next) => {
//   const token = req.session.token || req.cookies.np_token;
//   if (token) {
//     try {
//       jwt.verify(token, process.env.JWT_SECRET);
//       return res.redirect('/');
//     } catch (err) { /* continue */ }
//   }
//   next();
// };

// // Sign a JWT token
// const signToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRE || '7d',
//   });
// };

// module.exports = { requireAuth, optionalAuth, redirectIfAuth, signToken };


const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Protect routes — redirect to login if not authenticated ──
const requireAuth = async (req, res, next) => {
  try {
    // Check 1 — passport session (Google login)
    if (req.user) {
      res.locals.user = req.user;
      return next();
    }

    // Check 2 — JWT token (phone login)
    const token = req.session.token || req.cookies.np_token;
    if (!token) {
      req.session.redirectAfterLogin = req.originalUrl;
      return res.redirect('/auth/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-__v');

    if (!user || !user.isActive) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    req.user        = user;
    res.locals.user = user;
    next();
  } catch (err) {
    req.session.destroy();
    res.redirect('/auth/login');
  }
};

// ── Optional auth — attach user if logged in ──
const optionalAuth = async (req, res, next) => {
  try {
    // Check passport session first
    if (req.user) {
      res.locals.user = req.user;
      return next();
    }

    // Then check JWT
    const token = req.session.token || req.cookies.np_token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('-__v');
      if (user) {
        req.user        = user;
        res.locals.user = user;
      }
    }
  } catch (err) { /* ignore */ }
  next();
};

// ── Redirect to home if already logged in ──
const redirectIfAuth = (req, res, next) => {
  // Already logged in via passport (Google)
  if (req.user) return res.redirect('/');

  // Already logged in via JWT
  const token = req.session.token || req.cookies.np_token;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect('/');
    } catch (err) { /* continue */ }
  }
  next();
};

// ── Sign a JWT token ──
const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = { requireAuth, optionalAuth, redirectIfAuth, signToken };
