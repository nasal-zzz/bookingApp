const express    = require('express');
const router     = express.Router();
const bc         = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/auth');
const SeatMap    = require('../models/SeatMap');
const Event      = require('../models/Event');

// ── NAMED ROUTES — must come BEFORE wildcard /:eventId ──────────────────────

router.get('/my-bookings',            requireAuth, bc.getMyBookings);
router.get('/ticket/:bookingId',      requireAuth, bc.getTicket);          // legacy → redirects to /success/
router.get('/success/:bookingId',     requireAuth, bc.getSuccessPage);     // Step 4: success/download

// Step 1 — Seat picker
router.get('/seatmap/:eventId',       requireAuth, bc.getSeatPicker);

// Step 1 → Step 2 redirect helper (API seat-hold check kept)
router.post('/seatmap/:eventId/hold', async (req, res) => {
  try {
    const { seatIds } = req.body;
    const seatMap = await SeatMap.findOne({ event: req.params.eventId, isActive: true });
    if (!seatMap) return res.json({ success: false, message: 'No seat map found' });
    const unavailable = [];
    seatMap.sections.forEach(sec => {
      sec.seats.forEach(seat => {
        if (seatIds.includes(seat.seatId) && seat.status !== 'available') unavailable.push(seat.seatId);
      });
    });
    if (unavailable.length) return res.json({ success: false, message: `Seats taken: ${unavailable.join(', ')}` });
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

// Step 2 — Attendee details
router.get('/details/:eventId',       requireAuth, bc.getDetailsPage);

// Step 3 — Retry payment (for pending/failed bookings)
router.get('/retry-payment/:bookingId', requireAuth, bc.retryPayment);

// ── API ROUTES ───────────────────────────────────────────────────────────────
router.post('/create-order',      requireAuth, bc.createOrder);
router.post('/verify-payment',    requireAuth, bc.verifyPayment);
router.post('/save-pending',      requireAuth, bc.savePending);
router.post('/save-failed',       requireAuth, bc.saveFailed);
router.get('/api/event',          bc.getEventData);
router.get('/api/events',         bc.getAllEvents);

// ── WILDCARD — legacy entry points (from home / event detail "Book Now" button)
// These redirect to the proper step 1 or step 2 based on whether a seatmap exists
router.get('/',           requireAuth, bc.getBookingPage);
router.get('/:eventId',   requireAuth, bc.getBookingPage);

module.exports = router;
