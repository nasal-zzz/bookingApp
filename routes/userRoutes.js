const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

router.get('/profile',                      requireAuth, userController.getProfile);
router.post('/profile/update',              requireAuth, userController.updateProfile);
router.delete('/delete-booking/:bookingId', requireAuth, userController.deleteBooking);

module.exports = router;