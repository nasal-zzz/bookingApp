# 🎉 MEE — Melattur Entertainment Events

Full-stack Node.js + Express + MongoDB + EJS ticket booking platform with Razorpay payments, WhatsApp OTP, QR code tickets, seat-map builder, coupon system, and a full Admin + SuperAdmin panel.

---

## 🚀 Quick Start

```bash
npm install
cp .env.example .env   # fill in all values
npm run dev            # development (nodemon)
npm start              # production
```
App runs at **http://localhost:3000**

---

## 📁 Project Structure

```
MEE/
├── server.js
├── config/db.js
├── models/
│   ├── User.js          Booking.js       Coupon.js
│   ├── Event.js         Staff.js         ScanLog.js
│   ├── Banner.js        Review.js        OTP.js
├── controllers/
│   ├── authController.js     bookingController.js     adminController.js
├── routes/
│   ├── indexRoutes.js        authRoutes.js            bookingRoutes.js
│   ├── userRoutes.js         adminRoutes.js           superadminRoutes.js
│   └── staffRoutes.js
├── utils/
│   ├── whatsappHelper.js     qrHelper.js     pdfHelper.js     emailHelper.js
├── views/
│   ├── partials/
│   │   ├── head.ejs                  — meta + CSS (user side)
│   │   ├── navbar.ejs                — main site nav
│   │   ├── scripts.ejs               — Bootstrap JS + global scripts
│   │   ├── admin-sidebar.ejs         ✅ Canonical admin sidebar (ONE place to edit)
│   │   └── superadmin-sidebar.ejs    ✅ Canonical superadmin sidebar
│   ├── pages/       admin/       superadmin/       staff/
└── public/
    ├── css/
    │   ├── index.css       ← include ONLY this in HTML layouts
    │   ├── theme.css       🎨 accent colors, shadows — change to retheme
    │   ├── typography.css  🔤 fonts, --scale variable for global size
    │   ├── layout.css      page structure, sidebar, nav
    │   ├── components.css  buttons, forms, badges, toasts, tables
    │   ├── admin.css       admin-only styles
    │   └── user.css        user/public page styles
    └── js/
        ├── ui.js           showToast() + AdminValidator
        └── lang.js         Malayalam/English toggle
```

---

## 🔑 Environment Variables (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB Atlas connection string | ✅ |
| `SESSION_SECRET` | Random 32+ char string | ✅ |
| `TWILIO_ACCOUNT_SID` | Twilio SID | ✅ |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | ✅ |
| `TWILIO_WHATSAPP_NUMBER` | e.g. `whatsapp:+14155238886` | ✅ |
| `RAZORPAY_KEY_ID` | `rzp_test_...` or `rzp_live_...` | ✅ |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | ✅ |
| `APP_URL` | Full app URL e.g. `http://localhost:3000` | ✅ |
| `SMTP_USER` | Gmail address | Optional |
| `SMTP_PASS` | Gmail App Password | Optional |
| `GOOGLE_CLIENT_ID` | Google OAuth | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Optional |
| `SUPER_ADMIN_USER` | SuperAdmin username (default: `superadmin`) | Optional |
| `SUPER_ADMIN_PASS` | SuperAdmin password | Optional |

---

## 👤 Booking Flow

```
Home → Event Detail → Seat Map (Step 1: zone/type)
  → Booking Details (Step 2: attendee info + coupon)   ← minimal nav, back button only
  → Razorpay Payment (Step 3)
  → Ticket Page (Step 4: QR + PDF download)
  → WhatsApp confirmation sent automatically
```

**My Bookings:**
- Paid → View Ticket / Download PDF
- Pending → Complete Payment (if event active + seats available)
- Failed → Book Again / Remove
- Empty → "Browse Events" → `/#events`

---

## 🛡 Admin Panel (`/admin`)

Login with staff credentials. All pages have a **← Dashboard** back button.

| Page | Notes |
|------|-------|
| Dashboard | Stats + quick actions |
| Bookings | Filter by status, bulk WhatsApp reminders |
| Participants | Registered attendees |
| Entered Tickets | Real-time gate scan log |
| Users by Event | All paid bookings per event |
| New/Edit Event | **Unsaved-changes guard** — shows modal before leaving |
| Reviews, Banners, Coupons, Staff, Profile | — |

Sidebar is in **`views/partials/admin-sidebar.ejs`** — edit once, updates all pages.

---

## ⚡ SuperAdmin Panel (`/superadmin`)

Credentials: `SUPER_ADMIN_USER` / `SUPER_ADMIN_PASS` in `.env`  
Default: `superadmin` / `MEE@SuperAdmin2026`

Sidebar is in **`views/partials/superadmin-sidebar.ejs`**.

Pages: Dashboard · Staff & Admins · Coupons · Users by Event · Entered Tickets

---

## 📱 Staff QR Scanner (`/staff`)

Mobile camera scanner — validates tickets, logs entry to `ScanLog`, supports group tickets.

---

## 🎨 Quick Theming

```css
/* public/css/theme.css — change accent color */
--accent: #6A0DAD;

/* public/css/typography.css — scale all text */
--scale: 1;          /* 1.1 = 10% bigger everywhere */

/* swap fonts */
--font-display: 'Anton', sans-serif;
--font-body:    'Outfit', sans-serif;
```

---

## 💳 Razorpay

Duplicate booking prevention: 3-layer guard
1. Frontend: 900ms delay on `ondismiss` + `_paymentCompleted` flag
2. `savePending`: checks for existing paid booking before creating pending
3. `verifyPayment`: checks by `paymentId` + upgrades pending→paid if exists

---

## 📱 WhatsApp (Twilio)

| Event | Message |
|-------|---------|
| Login/Signup | OTP code |
| Booking confirmed | Text + QR image per ticket |
| Payment pending | Reminder with retry link |
| Payment failed | Failure notice |

Dev mode (no Twilio): messages printed to terminal.

---

## 🚑 Utility Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/admin/cleanup-duplicates` | POST | Remove duplicate pending/failed where paid exists |
| `/superadmin/api/repair-qr` | POST | Fix bookings with `PENDING` bookingRef in QR |