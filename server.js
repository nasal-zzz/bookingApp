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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ── SESSION (must be before passport) ──
app.use(session({
  secret: process.env.SESSION_SECRET || 'nightpass_secret_key_2026',
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
  res.locals.appName     = process.env.APP_NAME || 'NightPass';
  res.locals.appUrl      = process.env.APP_URL  || 'http://localhost:3000';
  res.locals.user        = req.user || null;
  res.locals.rzpKeyId    = process.env.RAZORPAY_KEY_ID;
  res.locals.currentPath = req.path;
  next();
});

// ── ROUTES ──
app.use('/',        require('./routes/indexRoutes'));
app.use('/auth',    require('./routes/authRoutes'));
app.use('/booking', require('./routes/bookingRoutes'));
app.use('/user',    require('./routes/userRoutes'));

// ── 404 ──
app.use((req, res) => {
  res.status(404).render('pages/error', {
    title: '404 — NightPass',
    message: 'Page not found.',
    code: 404,
  });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).render('pages/error', {
    title: 'Error — NightPass',
    message: err.message || 'Something went wrong.',
    code: 500,
  });
});

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`\n🚀 NightPass running at http://localhost:${PORT}`);
//   console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
// });

// module.exports = app;
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 NightPass running at http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
