const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/auth');

// Pages (require login)
router.get('/',           requireAuth, bookingController.getBookingPage);
router.get('/ticket/:bookingId', requireAuth, bookingController.getTicket);
router.get('/my-bookings', requireAuth, bookingController.getMyBookings);

// API
router.post('/create-order',    requireAuth, bookingController.createOrder);
router.post('/verify-payment',  requireAuth, bookingController.verifyPayment);
router.get('/api/event',        bookingController.getEventData);

module.exports = router;
