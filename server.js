
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const morgan     = require('morgan');
const path       = require('path');
const passport   = require('./config/passport');

const connectDB = require('./config/db');
connectDB();

const app = express();

// ── MIDDLEWARE ──
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ── Dedicated QR image route (bypasses ngrok interstitial for Twilio) ──
app.get('/qr/:filename', (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  // Ensure filename is safe (no path traversal)
  const filename = path.basename(req.params.filename);
  const file     = path.join(__dirname, 'public', 'qr', filename);
  if (!fs.existsSync(file)) {
    console.warn('QR file not found:', file);
    return res.status(404).send('QR not found');
  }
  res.set({
    'Content-Type':               'image/png',
    'ngrok-skip-browser-warning': '1',
    'Cache-Control':              'public, max-age=86400',
    'Access-Control-Allow-Origin':'*',
  });
  res.sendFile(file);
});

// ── SESSION (must be before passport) ──
app.use(session({
  secret: process.env.SESSION_SECRET || 'mee_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    touchAfter: 24 * 3600,
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

// ── PASSPORT ──
app.use(passport.initialize());
app.use(passport.session());

// ── VIEW ENGINE ──
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── GLOBAL LOCALS ──
app.use((req, res, next) => {
  res.locals.appName     = process.env.APP_NAME || 'Melattur Entertainment Events';
  res.locals.appUrl      = process.env.APP_URL  || 'http://localhost:3000';
  res.locals.user        = req.user || null;
  res.locals.rzpKeyId    = process.env.RAZORPAY_KEY_ID;
  res.locals.currentPath = req.path;
  next();
});

// ── ROUTES ──
app.use('/',           require('./routes/indexRoutes'));
app.use('/auth',       require('./routes/authRoutes'));
app.use('/booking',    require('./routes/bookingRoutes'));
app.use('/user',       require('./routes/userRoutes'));
app.use('/admin',      require('./routes/adminRoutes'));
app.use('/superadmin', require('./routes/superadminRoutes'));
app.use('/staff',      require('./routes/staffRoutes'));

// ── 404 ──
app.use((req, res) => {
  res.status(404).render('pages/error', {
    title: '404 — MEE',
    message: 'Page not found.',
    code: 404,
  });
});

// ── GLOBAL ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  const path = req.path || '';
  const detail = process.env.NODE_ENV !== 'production' ? err.message : null;

  // SuperAdmin paths → superadmin error page
  if (path.startsWith('/superadmin')) {
    return res.status(500).render('superadmin/error', {
      title:      'Error — Super Admin',
      status:     500,
      errTitle:   'SOMETHING WENT WRONG',
      errMessage: 'An unexpected error occurred.',
      errDetail:  detail,
    });
  }
  // Admin paths → admin error page
  if (path.startsWith('/admin')) {
    return res.status(500).render('admin/error', {
      title:      'Error — Admin',
      status:     500,
      errTitle:   'SOMETHING WENT WRONG',
      errMessage: 'An unexpected error occurred. Please try again.',
      errDetail:  detail,
    });
  }
  // Everything else → user-facing error page
  res.status(500).render('pages/error', {
    title:   'Error — MEE',
    message: err.message || 'Something went wrong.',
    code:    500,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Melattur Entertainment Events running at http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;