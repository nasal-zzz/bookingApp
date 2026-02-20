# 🎉 NightPass — Party Ticket Booking System

Full-stack Node.js + Express + MongoDB + EJS party ticket booking app with Razorpay payments, OTP verification, and QR code ticket generation.

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your real credentials
```

### 3. Seed the event into MongoDB
```bash
node scripts/seedEvent.js
```

### 4. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

App runs at: **http://localhost:3000**

---

## 📁 Project Structure

```
nightpass/
├── server.js               # Entry point
├── config/
│   └── db.js               # MongoDB connection
├── models/
│   ├── User.js             # User schema
│   ├── OTP.js              # OTP schema (auto-expires)
│   ├── Event.js            # Event + ticket types
│   └── Booking.js          # Booking + tickets + QR codes
├── controllers/
│   ├── authController.js   # Login, signup, OTP, Google
│   └── bookingController.js# Booking, Razorpay, tickets
├── routes/
│   ├── indexRoutes.js      # Home page
│   ├── authRoutes.js       # /auth/*
│   └── bookingRoutes.js    # /booking/*
├── middleware/
│   └── auth.js             # JWT auth, requireAuth guard
├── utils/
│   ├── otpHelper.js        # OTP generate + Twilio send
│   ├── qrHelper.js         # QR code generation
│   └── emailHelper.js      # Nodemailer confirmation email
├── views/
│   ├── partials/           # head.ejs, navbar.ejs, scripts.ejs
│   └── pages/              # index, login, signup, otp, booking, ticket, my-bookings, error
├── public/
│   └── css/main.css        # All shared styles
└── scripts/
    └── seedEvent.js        # Seed the Eclipse Dark Night event
```

---

## 🔑 Environment Variables (.env)

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `SESSION_SECRET` | Express session secret (random string) |
| `JWT_SECRET` | JWT signing secret |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number |
| `RAZORPAY_KEY_ID` | Razorpay Key ID (rzp_test_...) |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret |
| `SMTP_USER` | Gmail address for sending emails |
| `SMTP_PASS` | Gmail App Password |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `APP_URL` | Your app URL (http://localhost:3000) |

---

## 🌊 User Flow

```
Home (/) → Book Tickets (/booking)
  ↓ Not logged in?
Login (/auth/login) or Signup (/auth/signup)
  ↓ Phone OTP sent via Twilio
Verify OTP (/auth/otp)
  ↓ Verified → JWT issued
Book Tickets (/booking)
  ↓ Select type + quantity + attendee details
Razorpay Checkout (popup)
  ↓ Payment success → backend verifies signature
Ticket Page (/booking/ticket/:id)
  ↓ QR codes generated + PDF download + email sent
My Bookings (/booking/my-bookings)
```

---

## 💳 Razorpay Setup

1. Create account at [razorpay.com](https://razorpay.com)
2. Get your **Test Key ID** and **Test Key Secret** from Dashboard → Settings → API Keys
3. Add both to `.env`
4. For production, switch to Live keys and enable HTTPS

---

## 📱 OTP via Twilio

1. Sign up at [twilio.com](https://twilio.com)
2. Get a phone number
3. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` to `.env`
4. In **development mode**, OTP is just printed to the terminal — no Twilio needed

---

## 🔒 Security Features

- JWT tokens stored in server-side sessions (not localStorage)
- OTP rate-limited (5 requests per 15 minutes)
- OTP auto-expires after 5 minutes (MongoDB TTL index)
- Max 5 failed OTP attempts before lockout
- Razorpay signature verified server-side before any booking is saved
- Helmet.js for security headers
- HTTPS cookie in production

---

## 📧 Email Confirmation

After successful payment, a styled HTML email is sent containing:
- Booking reference number
- Event details
- Attendee list with ticket IDs
- Link to view/download QR tickets

Configure `SMTP_USER` and `SMTP_PASS` (Gmail App Password) to enable.
