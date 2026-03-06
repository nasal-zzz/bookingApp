// const express = require('express');
// const router  = express.Router();
// const adminController = require('../controllers/adminController');
// const Coupon  = require('../models/Coupon');
// const ScanLog = require('../models/ScanLog');
// const Staff   = require('../models/Staff');
// const Event   = require('../models/Event');
// const Booking = require('../models/Booking');
// const User    = require('../models/User');
// const Banner  = require('../models/Banner');
// const Review  = require('../models/Review');

// // ── Get current admin info for views ──
// function getCurrentAdmin(req) {
//   if (req.session.staffUser) return req.session.staffUser;
//   if (req.session.adminUser) return { username: req.session.adminUser, name: req.session.adminUser, role: 'admin' };
//   return { username: 'admin', name: 'Admin', role: 'admin' };
// }

// // ── Admin credentials ──
// // Hardcoded admin + support for .env override
// const ADMINS = [
//   { username: 'admin-melatturpattu', password: 'mainAdminMelatturPattu' },
//   // Extra admins can be added here or via env:
//   // { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
// ];

// const checkAdmin = (username, password) =>
//   ADMINS.some(a => a.username === username && a.password === password);

// // ── Auth middleware ── accepts adminLoggedIn OR staffLoggedIn with admin/superadmin role
// const adminAuth = (req, res, next) => {
//   const isAdmin = req.session.adminLoggedIn ||
//     (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
//   if (isAdmin) return next();
//   if (req.method === 'POST' && req.path === '/login') return next();
//   if (req.path !== '/login') {
//     const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
//     if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
//     return res.redirect('/staff/login#admin');
//   }
//   next();
// };

// router.get('/login', (req, res) => {
//   if (req.session.adminLoggedIn || req.session.staffLoggedIn) return res.redirect('/admin');
//   return res.redirect('/staff/login#admin');
// });

// router.post('/login', (req, res) => {
//   const { username, password } = req.body;
//   if (checkAdmin(username, password)) {
//     req.session.adminLoggedIn = true;
//     req.session.adminUser = username;
//     return res.redirect('/admin');
//   }
//   res.render('admin/login', { title: 'Admin Login', error: 'Incorrect username or password.' });
// });

// router.get('/logout', (req, res) => {
//   req.session.destroy(() => res.redirect('/staff/login'));
// });

// // ── PROFILE PAGE ──
// router.get('/profile', (req, res) => {
//   const isSuperAdmin = req.session.superAdminLoggedIn ||
//     (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
//   const isAdmin = req.session.adminLoggedIn ||
//     (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
//   if (!isAdmin) return res.redirect('/staff/login');
//   const currentAdmin = getCurrentAdmin(req);
//   res.render('admin/profile', {
//     title: 'My Profile — Admin',
//     currentAdmin,
//     isSuperAdmin,
//   });
// });

// // Public API — visible banners for homepage (must be BEFORE adminAuth)
// router.get('/api/banners', async (req, res) => {
//   try {
//     const banners = await Banner.find({ isVisible: true }).sort({ order: 1 }).select('image title linkUrl');
//     res.json({ success: true, banners });
//   } catch(err) { res.json({ success: false, banners: [] }); }
// });

// router.use(adminAuth);

// router.get('/',                         adminController.getDashboard);
// router.get('/events/new',               adminController.getNewEvent);
// router.post('/events',                  adminController.postCreateEvent);
// router.get('/events/:id/edit',          adminController.getEditEvent);
// router.post('/events/:id',              adminController.postUpdateEvent);
// router.post('/events/:id/delete',       adminController.deleteEvent);
// router.post('/events/:id/toggle',       adminController.toggleEvent);

// // ── Stop ALL ticket categories for an event (close booking for entire event) ──
// router.post('/events/:id/stop-all-tickets', async (req, res) => {
//   try {
//     const event = await Event.findById(req.params.id);
//     if (!event) return res.json({ success: false, message: 'Event not found' });
//     const { stop } = req.body; // stop: 'true' or 'false'
//     const shouldStop = stop === 'true';
//     event.ticketTypes.forEach(t => { t.isActive = !shouldStop; });
//     await event.save();
//     res.json({ success: true, stopped: shouldStop, count: event.ticketTypes.length });
//   } catch(err) {
//     res.json({ success: false, message: err.message });
//   }
// });

// // ── Toggle individual ticket category on/off (stop selling) ──
// router.post('/events/:id/ticket-toggle', async (req, res) => {
//   try {
//     const { category } = req.body;
//     const event = await Event.findById(req.params.id);
//     if (!event) return res.json({ success: false, message: 'Event not found' });
//     const tt = event.ticketTypes.find(t => t.category === category);
//     if (!tt) return res.json({ success: false, message: 'Category not found' });
//     tt.isActive = !tt.isActive;
//     await event.save();
//     res.json({ success: true, isActive: tt.isActive, category: tt.category, name: tt.name });
//   } catch(err) {
//     res.json({ success: false, message: err.message });
//   }
// });
// router.get('/bookings',                 adminController.getBookings);

// // POST /admin/bookings/send-reminders — bulk send pending/failed payment reminders
// router.post('/bookings/send-reminders', async (req, res) => {
//   if (!req.session.adminLoggedIn) return res.json({ success: false, message: 'Not authorised' });
//   try {
//     const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
//     const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

//     const now          = new Date();
//     const oneHourAgo   = new Date(now - 60 * 60 * 1000);
//     const twentyFourHrsAgo = new Date(now - 24 * 60 * 60 * 1000);

//     // Find bookings where:
//     // — still pending/failed
//     // — immediate was already sent (or old enough)
//     // — 24hr reminder not yet sent
//     // — created at least 1 hour ago (give user time to complete)
//     const bookings = await Booking.find({
//       paymentStatus:    { $in: ['pending', 'failed'] },
//       createdAt:        { $lte: oneHourAgo },
//       reminder24SentAt: null,
//     }).populate('user', 'firstName email phone').populate('event', 'name');

//     let sent24 = 0, sentImmediate = 0;
//     for (const b of bookings) {
//       const user  = b.user;
//       const event = b.event;
//       if (!user) continue;
//       const name  = user.firstName || 'there';
//       const email = user.email || '';
//       const phone = user.phone || '';
//       const isOldEnoughFor24 = b.createdAt <= twentyFourHrsAgo;

//       try {
//         if (isOldEnoughFor24) {
//           // Send 24hr reminder
//           if (b.paymentStatus === 'pending') {
//             if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
//             if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
//           } else {
//             if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
//             if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
//           }
//           await Booking.findByIdAndUpdate(b._id, { reminder24SentAt: new Date() });
//           sent24++;
//         } else if (!b.reminderImmediateSentAt) {
//           // Send immediate if somehow missed
//           if (b.paymentStatus === 'pending') {
//             if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
//             if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
//           } else {
//             if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
//             if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
//           }
//           await Booking.findByIdAndUpdate(b._id, { reminderImmediateSentAt: new Date() });
//           sentImmediate++;
//         }
//       } catch(e) { console.warn('Reminder error for', b.bookingRef, e.message); }
//     }
//     res.json({ success: true, sent24, sentImmediate, total: bookings.length });
//   } catch(err) {
//     res.json({ success: false, message: err.message });
//   }
// });

// // ── POST /admin/bookings/:id/send-message — send WhatsApp+email to single pending/failed booking ──
// router.post('/bookings/:id/send-message', async (req, res) => {
//   try {
//     const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
//     const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

//     const booking = await Booking.findById(req.params.id)
//       .populate('user', 'firstName email phone')
//       .populate('event', 'name date venue');

//     if (!booking) return res.json({ success: false, message: 'Booking not found.' });
//     if (booking.paymentStatus === 'paid') return res.json({ success: false, message: 'Booking is already paid.' });

//     const user  = booking.user;
//     const event = booking.event;
//     const name  = user?.firstName || 'Customer';
//     const email = user?.email || '';
//     const phone = user?.phone || '';

//     let sent = 0;
//     if (booking.paymentStatus === 'pending') {
//       if (email) { await sendPendingPaymentReminder({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
//       if (phone) { await sendWhatsAppPending({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
//     } else if (booking.paymentStatus === 'failed') {
//       if (email) { await sendFailedPaymentNotice({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
//       if (phone) { await sendWhatsAppPaymentFailed({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
//     }

//     res.json({ success: true, message: `Message sent via ${sent} channel${sent !== 1 ? 's' : ''}.`, sent });
//   } catch(err) {
//     res.json({ success: false, message: err.message });
//   }
// });

// router.get('/seatmap/:eventId',          adminController.getSeatMap);
// router.post('/seatmap/:eventId',         adminController.postSeatMap);
// router.post('/seatmap/:eventId/toggle',  adminController.toggleSeatMap);


// // ── Sponsor Banners ──

// router.get('/banners', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
//   try {
//     const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
//     res.render('admin/banners', { title: 'Sponsor Banners — Admin', banners, currentAdmin, isSuperAdmin });
//   } catch(err) { res.redirect('/admin'); }
// });

// router.post('/banners', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
//   try {
//     const { title, image, linkUrl } = req.body;
//     if (!image) return res.json({ success: false, message: 'No image provided.' });
//     if (image.length > 7 * 1024 * 1024) return res.json({ success: false, message: 'Image too large (max 5MB).' });
//     const count = await Banner.countDocuments();
//     const banner = await Banner.create({ title: title||'', image, linkUrl: linkUrl||'', order: count });
//     res.json({ success: true, bannerId: banner._id });
//   } catch(err) { res.json({ success: false, message: err.message }); }
// });

// router.post('/banners/:id/toggle', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
//   try {
//     const b = await Banner.findById(req.params.id);
//     if (!b) return res.json({ success: false });
//     b.isVisible = !b.isVisible;
//     await b.save();
//     res.json({ success: true, isVisible: b.isVisible });
//   } catch(err) { res.json({ success: false }); }
// });

// router.post('/banners/:id/delete', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/banners');
//   await Banner.findByIdAndDelete(req.params.id).catch(()=>{});
//   res.redirect('/admin/banners');
// });


// // ── Reviews admin ──

// router.get('/reviews', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
//   try {
//     const reviews = await Review.find()
//       .populate('user', 'firstName lastName phone')
//       .populate('event', 'name date')
//       .sort({ createdAt: -1 });
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
//     res.render('admin/reviews', { title: 'Reviews — Admin', reviews, currentAdmin, isSuperAdmin });
//   } catch(err) {
//     res.redirect('/admin');
//   }
// });

// router.post('/reviews/:id/toggle', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
//   try {
//     const review = await Review.findById(req.params.id);
//     if (!review) return res.json({ success: false });
//     review.isVisible = !review.isVisible;
//     await review.save();
//     res.json({ success: true, isVisible: review.isVisible });
//   } catch(err) {
//     res.json({ success: false });
//   }
// });

// router.post('/reviews/:id/delete', async (req, res) => {
//   if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/reviews');
//   await Review.findByIdAndDelete(req.params.id).catch(()=>{});
//   res.redirect('/admin/reviews');
// });

// // ── Admin: Staff management (admins can create/manage staff-role accounts) ──
// router.get('/staff', async (req, res) => {
//   try {
//     const staff = await Staff.find({ role: 'staff' }).sort({ createdAt: -1 });
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
//     res.render('admin/staff', { title: 'Staff Management — Admin', staff, currentAdmin, isSuperAdmin });
//   } catch(err) { res.redirect('/admin'); }
// });

// router.post('/staff', async (req, res) => {
//   try {
//     const { firstName, lastName, email, phone, manualUsername, manualPassword, canScanQR, canViewBookings, canManageEvents } = req.body;
//     let username, password;
//     if (manualUsername && manualUsername.trim()) {
//       username = manualUsername.trim().toLowerCase().replace(/\s+/g,'-');
//       if (!manualPassword || manualPassword.trim().length < 4) return res.json({ success:false, message:'Password must be at least 4 characters.' });
//       password = manualPassword.trim();
//       const taken = await Staff.findOne({ username });
//       if (taken) return res.json({ success:false, message:`Username "${username}" is already taken.` });
//     } else {
//       const base = `staff-${firstName.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
//       const existing = await Staff.findOne({ username: base });
//       username = existing ? `${base}${Math.floor(Math.random()*900)+100}` : base;
//       password = `${username}-${(phone||'000').slice(-3)}`;
//     }
//     const member = await Staff.create({
//       firstName, lastName: lastName||'', email, phone: phone||'',
//       username, password, role: 'staff',
//       canScanQR: canScanQR==='on', canViewBookings: canViewBookings==='on', canManageEvents: canManageEvents==='on',
//       createdBy: req.session.staffUser?.id || null,
//     });
//     res.json({ success:true, username: member.username, password: member.password, id: member._id });
//   } catch(err) {
//     res.json({ success:false, message: err.code===11000 ? 'Email or username already exists.' : err.message });
//   }
// });

// router.post('/staff/:id/toggle', async (req, res) => {
//   try {
//     const member = await Staff.findOne({ _id: req.params.id, role: 'staff' });
//     if (!member) return res.json({ success:false, message:'Staff not found' });
//     member.isActive = !member.isActive;
//     await member.save();
//     res.json({ success:true, isActive: member.isActive });
//   } catch(err) { res.json({ success:false, message: err.message }); }
// });

// router.post('/staff/:id/delete', async (req, res) => {
//   await Staff.findOneAndDelete({ _id: req.params.id, role: 'staff' }).catch(()=>{});
//   res.redirect('/admin/staff');
// });

// // ── Admin error handler — keeps user inside admin context ──
// router.use((err, req, res, next) => {
//   console.error('[ADMIN ERROR]', req.path, err.message);
//   const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
//   if (isJson) return res.status(500).json({ success: false, message: err.message });
//   res.status(500).render('admin/error', {
//     title:      'Error — Admin',
//     status:     500,
//     errTitle:   'SOMETHING WENT WRONG',
//     errMessage: 'An unexpected error occurred. Please try again.',
//     errDetail:  process.env.NODE_ENV !== 'production' ? err.message : null,
//   });
// });

// // ── Admin: Clean up duplicate pending bookings ──
// // Finds any pending/failed booking where a paid booking exists for same user+event
// router.post('/cleanup-duplicates', async (req, res) => {
//   try {
//     const paidBookings = await Booking.find({ paymentStatus: 'paid' }).lean();
//     let removed = 0;
//     for (const paid of paidBookings) {
//       // Find pending/failed bookings for same user + event
//       const dupes = await Booking.find({
//         user:          paid.user,
//         event:         paid.event,
//         paymentStatus: { $in: ['pending', 'failed'] },
//         _id:           { $ne: paid._id }
//       });
//       for (const dupe of dupes) {
//         await Booking.findByIdAndDelete(dupe._id);
//         await User.findByIdAndUpdate(paid.user, { $pull: { bookings: dupe._id } }).catch(()=>{});
//         removed++;
//         console.log('🧹 Removed duplicate booking:', dupe.bookingRef, '(pending/failed, paid exists)');
//       }
//     }
//     res.json({ success: true, removed, message: removed + ' duplicate pending/failed bookings removed.' });
//   } catch(err) {
//     res.json({ success: false, message: err.message });
//   }
// });


// // ── Admin Coupon Management ──
// router.get('/coupons', async (req, res) => {
//   try {
//     const coupons = await Coupon.find().sort({ createdAt: -1 });
//     const currentAdmin = req.session.staffUser || { username: req.session.adminUser || 'admin', name: 'Admin', role: 'admin' };
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
//     res.render('admin/coupons', { title: 'Coupons — Admin', coupons, currentAdmin, isSuperAdmin });
//   } catch(err) { res.status(500).send('Error loading coupons'); }
// });

// router.post('/coupons', async (req, res) => {
//   try {
//     const { code, type, value, minOrder, minTickets, maxUses, validFrom, validUntil, description } = req.body;
//     if (validUntil) {
//       const expiry = new Date(validUntil); expiry.setHours(23,59,59,999);
//       if (expiry < new Date()) return res.json({ success: false, message: 'Expiry date cannot be in the past.' });
//     }
//     if (!code || !code.trim()) return res.json({ success: false, message: 'Coupon code required.' });
//     if (!value || parseFloat(value) <= 0) return res.json({ success: false, message: 'Value must be > 0.' });
//     const coupon = await Coupon.create({
//       code: code.toUpperCase().trim(), type: type||'fixed',
//       value: parseFloat(value), minOrder: parseFloat(minOrder)||0, minTickets: parseInt(minTickets)||0,
//       maxUses: parseInt(maxUses)||0, validFrom: validFrom||null,
//       validUntil: validUntil||null, description: description||'',
//     });
//     res.json({ success: true, couponId: coupon._id });
//   } catch(err) {
//     res.json({ success: false, message: err.code===11000 ? 'Coupon code already exists.' : err.message });
//   }
// });

// router.post('/coupons/:id/toggle', async (req, res) => {
//   try {
//     const c = await Coupon.findById(req.params.id);
//     if (!c) return res.json({ success: false });
//     c.isActive = !c.isActive; await c.save();
//     res.json({ success: true, isActive: c.isActive });
//   } catch(err) { res.json({ success: false }); }
// });

// router.post('/coupons/:id/delete', async (req, res) => {
//   try { await Coupon.findByIdAndDelete(req.params.id); res.redirect('/admin/coupons'); }
//   catch(err) { res.redirect('/admin/coupons'); }
// });

// // ── Participants (QR scan log) by event ──
// router.get('/participants', async (req, res) => {
//   try {
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
//     const events = await Event.find().sort({ date: -1 }).lean();
//     const selectedId = req.query.event || (events[0]?._id?.toString() || '');
//     const selectedEvent = selectedId ? await Event.findById(selectedId).select('name date venue').lean() : null;
//     let logs = [];
//     if (selectedId) {
//       logs = await ScanLog.find({ event: selectedId })
//         .populate('booking', 'bookingRef ticketType quantity totalAmount')
//         .sort({ scannedAt: -1 })
//         .lean();
//     }
//     res.render('admin/participants', { title: 'Staff Activity — Admin', events, logs, selectedId, selectedEvent, currentAdmin, isSuperAdmin });
//   } catch(err) { console.error(err); res.status(500).send('Error'); }
// });

// // ── Admin: Users by Event ──
// router.get('/users-by-event', async (req, res) => {
//   try {
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
//     const events = await Event.find().sort({ date: -1 }).select('name date').lean();
//     const selectedEventId = req.query.eventId || '';
//     let bookings = [];
//     let selectedEvent = null;
//     if (selectedEventId) {
//       selectedEvent = await Event.findById(selectedEventId).select('name date venue').lean();
//       bookings = await Booking.find({ event: selectedEventId, paymentStatus: 'paid' })
//         .populate('user', 'firstName lastName email phone')
//         .sort({ createdAt: -1 })
//         .lean();
//       // Also get scan logs to know who entered
//       const ScanLog = require('../models/ScanLog');
//       const enteredRefs = new Set(
//         (await ScanLog.find({ event: selectedEventId }).select('bookingRef').lean())
//           .map(l => l.bookingRef)
//       );
//       // Flatten all attendees across all bookings
//       const attendees = [];
//       bookings.forEach(b => {
//         (b.tickets||[]).forEach(t => {
//           attendees.push({
//             bookingRef:  b.bookingRef,
//             ticketType:  b.ticketType,
//             totalAmount: b.totalAmount,
//             quantity:    b.quantity,
//             couponCode:  b.couponCode||null,
//             createdAt:   b.createdAt,
//             user:        b.user,
//             ticketId:    t.ticketId,
//             name:        t.attendee?.name || (b.user ? (b.user.firstName+' '+(b.user.lastName||'')) : '—'),
//             age:         t.attendee?.age  || null,
//             gender:      t.attendee?.gender || '',
//             seatNumber:  t.seatNumber || null,
//             isUsed:      t.isUsed || false,
//             usedAt:      t.usedAt  || null,
//             entered:     enteredRefs.has(b.bookingRef),
//           });
//         });
//       });
//       return res.render('admin/users-by-event', { title: 'Users by Event — Admin', events, bookings, attendees, selectedEvent, selectedEventId, currentAdmin, isSuperAdmin });
//     }
//     res.render('admin/users-by-event', { title: 'Users by Event — Admin', events, bookings:[], attendees:[], selectedEvent:null, selectedEventId, currentAdmin, isSuperAdmin });
//   } catch(err) {
//     console.error('/admin/users-by-event error:', err);
//     res.status(500).send('Error loading users by event');
//   }
// });

// // ── Admin: Send WhatsApp event reminder to a phone number ──
// router.post('/api/send-reminder', async (req, res) => {
//   try {
//     const { phone, name, eventId, type } = req.body; // type: 'reminder' | 'noshow'
//     if (!phone || !eventId) return res.json({ success: false, message: 'Missing phone or eventId' });
//     const event = await Event.findById(eventId).lean();
//     if (!event) return res.json({ success: false, message: 'Event not found' });
//     const { sendWhatsAppReminder } = require('../utils/whatsappHelper');
//     await sendWhatsAppReminder({ phone, name: name||'Guest', event, type: type||'reminder' });
//     res.json({ success: true });
//   } catch(err) {
//     console.error('Reminder error:', err);
//     res.json({ success: false, message: err.message });
//   }
// });

// // ── Admin: Entered Tickets (Scan Log) ──
// router.get('/entered-tickets', async (req, res) => {
//   try {
//     const currentAdmin = getCurrentAdmin(req);
//     const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
//     const events = await Event.find().sort({ date: -1 }).lean();
//     const selectedEventId = req.query.eventId || (events[0]?._id?.toString() || '');
//     let logs = [];
//     let selectedEvent = null;
//     if (selectedEventId) {
//       selectedEvent = await Event.findById(selectedEventId).lean();
//       logs = await ScanLog.find({ event: selectedEventId })
//         .populate('booking', 'bookingRef ticketType quantity totalAmount')
//         .sort({ scannedAt: -1 })
//         .lean();
//     }
//     res.render('admin/entered-tickets', { title: 'Entered Tickets — Admin', events, logs, selectedEvent, selectedEventId, currentAdmin, isSuperAdmin });
//   } catch(err) { console.error(err); res.status(500).send('Error loading entered tickets'); }
// });


// module.exports = router;

const express = require('express');
const router  = express.Router();
const adminController = require('../controllers/adminController');
const Coupon  = require('../models/Coupon');
const ScanLog = require('../models/ScanLog');
const Staff   = require('../models/Staff');
const Event   = require('../models/Event');
const Booking = require('../models/Booking');
const User    = require('../models/User');
const Banner  = require('../models/Banner');
const Review  = require('../models/Review');

// ── Get current admin info for views ──
function getCurrentAdmin(req) {
  if (req.session.staffUser) return req.session.staffUser;
  if (req.session.adminUser) return { username: req.session.adminUser, name: req.session.adminUser, role: 'admin' };
  return { username: 'admin', name: 'Admin', role: 'admin' };
}

// ── Admin credentials ──
// Hardcoded admin + support for .env override
const ADMINS = [
  { username: 'admin-melatturpattu', password: 'mainAdminMelatturPattu' },
  // Extra admins can be added here or via env:
  // { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
];

const checkAdmin = (username, password) =>
  ADMINS.some(a => a.username === username && a.password === password);

// ── Auth middleware ── accepts adminLoggedIn OR staffLoggedIn with admin/superadmin role
const adminAuth = (req, res, next) => {
  const isAdmin = req.session.adminLoggedIn ||
    (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
  if (isAdmin) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  if (req.path !== '/login') {
    const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
    if (isJson) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    return res.redirect('/staff/login#admin');
  }
  next();
};

router.get('/login', (req, res) => {
  if (req.session.adminLoggedIn || req.session.staffLoggedIn) return res.redirect('/admin');
  return res.redirect('/staff/login#admin');
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (checkAdmin(username, password)) {
    req.session.adminLoggedIn = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: 'Admin Login', error: 'Incorrect username or password.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/staff/login'));
});

// ── PROFILE PAGE ──
router.get('/profile', (req, res) => {
  const isSuperAdmin = req.session.superAdminLoggedIn ||
    (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
  const isAdmin = req.session.adminLoggedIn ||
    (req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role));
  if (!isAdmin) return res.redirect('/staff/login');
  const currentAdmin = getCurrentAdmin(req);
  res.render('admin/profile', {
    title: 'My Profile — Admin',
    currentAdmin,
    isSuperAdmin,
  });
});

// Public API — visible banners for homepage (must be BEFORE adminAuth)
router.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find({ isVisible: true }).sort({ order: 1 }).select('image title linkUrl');
    res.json({ success: true, banners });
  } catch(err) { res.json({ success: false, banners: [] }); }
});

router.use(adminAuth);

router.get('/',                         adminController.getDashboard);
router.get('/events/new',               adminController.getNewEvent);
router.post('/events',                  adminController.postCreateEvent);
router.get('/events/:id/edit',          adminController.getEditEvent);
router.post('/events/:id',              adminController.postUpdateEvent);
router.post('/events/:id/delete',       adminController.deleteEvent);
router.post('/events/:id/toggle',       adminController.toggleEvent);

// ── Stop ALL ticket categories for an event (close booking for entire event) ──
router.post('/events/:id/stop-all-tickets', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.json({ success: false, message: 'Event not found' });
    const { stop } = req.body; // stop: 'true' or 'false'
    const shouldStop = stop === 'true';
    event.ticketTypes.forEach(t => { t.isActive = !shouldStop; });
    await event.save();
    res.json({ success: true, stopped: shouldStop, count: event.ticketTypes.length });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

// ── Toggle individual ticket category on/off (stop selling) ──
router.post('/events/:id/ticket-toggle', async (req, res) => {
  try {
    const { category } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) return res.json({ success: false, message: 'Event not found' });
    const tt = event.ticketTypes.find(t => t.category === category);
    if (!tt) return res.json({ success: false, message: 'Category not found' });
    tt.isActive = !tt.isActive;
    await event.save();
    res.json({ success: true, isActive: tt.isActive, category: tt.category, name: tt.name });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});
router.get('/bookings',                 adminController.getBookings);

// POST /admin/bookings/send-reminders — bulk send pending/failed payment reminders
router.post('/bookings/send-reminders', async (req, res) => {
  if (!req.session.adminLoggedIn) return res.json({ success: false, message: 'Not authorised' });
  try {
    const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
    const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

    const now          = new Date();
    const oneHourAgo   = new Date(now - 60 * 60 * 1000);
    const twentyFourHrsAgo = new Date(now - 24 * 60 * 60 * 1000);

    const bookings = await Booking.find({
      paymentStatus:    { $in: ['pending', 'failed'] },
      createdAt:        { $lte: oneHourAgo },
      reminder24SentAt: null,
    }).populate('user', 'firstName email phone').populate('event', 'name');

    let sent24 = 0, sentImmediate = 0;
    for (const b of bookings) {
      const user  = b.user;
      const event = b.event;
      if (!user) continue;
      const name  = user.firstName || 'there';
      const email = user.email || '';
      const phone = user.phone || '';
      const isOldEnoughFor24 = b.createdAt <= twentyFourHrsAgo;

      try {
        if (isOldEnoughFor24) {
          if (b.paymentStatus === 'pending') {
            if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          } else {
            if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          }
          await Booking.findByIdAndUpdate(b._id, { reminder24SentAt: new Date() });
          sent24++;
        } else if (!b.reminderImmediateSentAt) {
          if (b.paymentStatus === 'pending') {
            if (email) await sendPendingPaymentReminder({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPending({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          } else {
            if (email) await sendFailedPaymentNotice({ to: email, name, booking: b, event: event||{} }).catch(()=>{});
            if (phone) await sendWhatsAppPaymentFailed({ phone, name, booking: b, event: event||{} }).catch(()=>{});
          }
          await Booking.findByIdAndUpdate(b._id, { reminderImmediateSentAt: new Date() });
          sentImmediate++;
        }
      } catch(e) { console.warn('Reminder error for', b.bookingRef, e.message); }
    }
    res.json({ success: true, sent24, sentImmediate, total: bookings.length });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

// ── POST /admin/bookings/:id/send-message — send WhatsApp+email to single pending/failed booking ──
router.post('/bookings/:id/send-message', async (req, res) => {
  try {
    const { sendPendingPaymentReminder, sendFailedPaymentNotice } = require('../utils/emailHelper');
    const { sendWhatsAppPending, sendWhatsAppPaymentFailed } = require('../utils/whatsappHelper');

    const booking = await Booking.findById(req.params.id)
      .populate('user', 'firstName email phone')
      .populate('event', 'name date venue');

    if (!booking) return res.json({ success: false, message: 'Booking not found.' });
    if (booking.paymentStatus === 'paid') return res.json({ success: false, message: 'Booking is already paid.' });

    const user  = booking.user;
    const event = booking.event;
    const name  = user?.firstName || 'Customer';
    const email = user?.email || '';
    const phone = user?.phone || '';

    let sent = 0;
    if (booking.paymentStatus === 'pending') {
      if (email) { await sendPendingPaymentReminder({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
      if (phone) { await sendWhatsAppPending({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
    } else if (booking.paymentStatus === 'failed') {
      if (email) { await sendFailedPaymentNotice({ to: email, name, booking, event: event||{} }).catch(()=>{}); sent++; }
      if (phone) { await sendWhatsAppPaymentFailed({ phone, name, booking, event: event||{} }).catch(()=>{}); sent++; }
    }

    res.json({ success: true, message: `Message sent via ${sent} channel${sent !== 1 ? 's' : ''}.`, sent });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

router.get('/seatmap/:eventId',          adminController.getSeatMap);
router.post('/seatmap/:eventId',         adminController.postSeatMap);
router.post('/seatmap/:eventId/toggle',  adminController.toggleSeatMap);


// ── Sponsor Banners ──

router.get('/banners', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/banners', { title: 'Sponsor Banners — Admin', banners, currentAdmin, isSuperAdmin });
  } catch(err) { res.redirect('/admin'); }
});

router.post('/banners', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const { title, image, linkUrl } = req.body;
    if (!image) return res.json({ success: false, message: 'No image provided.' });
    if (image.length > 7 * 1024 * 1024) return res.json({ success: false, message: 'Image too large (max 5MB).' });
    const count = await Banner.countDocuments();
    const banner = await Banner.create({ title: title||'', image, linkUrl: linkUrl||'', order: count });
    res.json({ success: true, bannerId: banner._id });
  } catch(err) { res.json({ success: false, message: err.message }); }
});

router.post('/banners/:id/toggle', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const b = await Banner.findById(req.params.id);
    if (!b) return res.json({ success: false });
    b.isVisible = !b.isVisible;
    await b.save();
    res.json({ success: true, isVisible: b.isVisible });
  } catch(err) { res.json({ success: false }); }
});

router.post('/banners/:id/delete', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/banners');
  await Banner.findByIdAndDelete(req.params.id).catch(()=>{});
  res.redirect('/admin/banners');
});


// ── Reviews admin ──

router.get('/reviews', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/staff/login');
  try {
    const reviews = await Review.find()
      .populate('user', 'firstName lastName phone')
      .populate('event', 'name date')
      .sort({ createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/reviews', { title: 'Reviews — Admin', reviews, currentAdmin, isSuperAdmin });
  } catch(err) {
    res.redirect('/admin');
  }
});

router.post('/reviews/:id/toggle', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.json({ success: false });
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.json({ success: false });
    review.isVisible = !review.isVisible;
    await review.save();
    res.json({ success: true, isVisible: review.isVisible });
  } catch(err) {
    res.json({ success: false });
  }
});

router.post('/reviews/:id/delete', async (req, res) => {
  if (!req.session.adminLoggedIn && !(req.session.staffLoggedIn && ['admin','superadmin'].includes(req.session.staffUser?.role))) return res.redirect('/admin/reviews');
  await Review.findByIdAndDelete(req.params.id).catch(()=>{});
  res.redirect('/admin/reviews');
});

// ── Admin: Staff management (admins can create/manage staff-role accounts) ──
router.get('/staff', async (req, res) => {
  try {
    const staff = await Staff.find({ role: 'staff' }).sort({ createdAt: -1 });
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/staff', { title: 'Staff Management — Admin', staff, currentAdmin, isSuperAdmin });
  } catch(err) { res.redirect('/admin'); }
});

router.post('/staff', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, manualUsername, manualPassword, canScanQR, canViewBookings, canManageEvents } = req.body;
    let username, password;
    if (manualUsername && manualUsername.trim()) {
      username = manualUsername.trim().toLowerCase().replace(/\s+/g,'-');
      if (!manualPassword || manualPassword.trim().length < 4) return res.json({ success:false, message:'Password must be at least 4 characters.' });
      password = manualPassword.trim();
      const taken = await Staff.findOne({ username });
      if (taken) return res.json({ success:false, message:`Username "${username}" is already taken.` });
    } else {
      const base = `staff-${firstName.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
      const existing = await Staff.findOne({ username: base });
      username = existing ? `${base}${Math.floor(Math.random()*900)+100}` : base;
      password = `${username}-${(phone||'000').slice(-3)}`;
    }
    const member = await Staff.create({
      firstName, lastName: lastName||'', email, phone: phone||'',
      username, password, role: 'staff',
      canScanQR: canScanQR==='on', canViewBookings: canViewBookings==='on', canManageEvents: canManageEvents==='on',
      createdBy: req.session.staffUser?.id || null,
    });
    res.json({ success:true, username: member.username, password: member.password, id: member._id });
  } catch(err) {
    res.json({ success:false, message: err.code===11000 ? 'Email or username already exists.' : err.message });
  }
});

router.post('/staff/:id/toggle', async (req, res) => {
  try {
    const member = await Staff.findOne({ _id: req.params.id, role: 'staff' });
    if (!member) return res.json({ success:false, message:'Staff not found' });
    member.isActive = !member.isActive;
    await member.save();
    res.json({ success:true, isActive: member.isActive });
  } catch(err) { res.json({ success:false, message: err.message }); }
});

router.post('/staff/:id/delete', async (req, res) => {
  await Staff.findOneAndDelete({ _id: req.params.id, role: 'staff' }).catch(()=>{});
  res.redirect('/admin/staff');
});

// ── Admin error handler — keeps user inside admin context ──
router.use((err, req, res, next) => {
  console.error('[ADMIN ERROR]', req.path, err.message);
  const isJson = req.headers['content-type']?.includes('application/json') || req.xhr;
  if (isJson) return res.status(500).json({ success: false, message: err.message });
  res.status(500).render('admin/error', {
    title:      'Error — Admin',
    status:     500,
    errTitle:   'SOMETHING WENT WRONG',
    errMessage: 'An unexpected error occurred. Please try again.',
    errDetail:  process.env.NODE_ENV !== 'production' ? err.message : null,
  });
});

// ── Admin: Clean up duplicate pending bookings ──
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    const paidBookings = await Booking.find({ paymentStatus: 'paid' }).lean();
    let removed = 0;
    for (const paid of paidBookings) {
      const dupes = await Booking.find({
        user:          paid.user,
        event:         paid.event,
        paymentStatus: { $in: ['pending', 'failed'] },
        _id:           { $ne: paid._id }
      });
      for (const dupe of dupes) {
        await Booking.findByIdAndDelete(dupe._id);
        await User.findByIdAndUpdate(paid.user, { $pull: { bookings: dupe._id } }).catch(()=>{});
        removed++;
        console.log('🧹 Removed duplicate booking:', dupe.bookingRef, '(pending/failed, paid exists)');
      }
    }
    res.json({ success: true, removed, message: removed + ' duplicate pending/failed bookings removed.' });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// ── COUPON MANAGEMENT — updated for new coupons.ejs page ──
// ════════════════════════════════════════════════════════════

// GET /admin/coupons — loads coupons with full redemption details attached
router.get('/coupons', async (req, res) => {
  try {
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
    const events     = await Event.find({}, 'name date').sort({ date: -1 }).lean();
    const rawCoupons = await Coupon.find().sort({ createdAt: -1 }).lean();

    // Attach redemption details from paid bookings
    const codes = rawCoupons.map(c => c.code);
    const usageBookings = await Booking.find({
      couponCode:    { $in: codes },
      paymentStatus: 'paid',
    })
      .populate('event', 'name date venue')
      .populate('user',  'firstName lastName phone email')
      .sort({ createdAt: -1 }).lean();

    const usageMap = {};
    for (const b of usageBookings) {
      if (!usageMap[b.couponCode]) usageMap[b.couponCode] = [];
      usageMap[b.couponCode].push(b);
    }

    const now = new Date();
    const coupons = rawCoupons.map(c => ({
      ...c,
      usages:    usageMap[c.code] || [],
      isExpired: !!(c.validUntil && now > new Date(c.validUntil)),
    }));

    res.render('admin/coupons', { title: 'Coupons — Admin', coupons, events, currentAdmin, isSuperAdmin });
  } catch(err) { console.error(err); res.status(500).send('Error loading coupons'); }
});

// POST /admin/coupons — create new coupon (form-based, redirects)
router.post('/coupons', async (req, res) => {
  try {
    const { code, type, value, minOrder, minTickets, maxUses, validFrom, validUntil, description, isActive, isFeatured } = req.body;
    if (!code || !code.trim()) return res.redirect('/admin/coupons?err=Code+required');
    if (!value || parseFloat(value) <= 0) return res.redirect('/admin/coupons?err=Value+must+be+greater+than+0');
    await Coupon.create({
      code:       code.toUpperCase().trim(),
      type:       type       || 'fixed',
      value:      parseFloat(value),
      minOrder:   parseFloat(minOrder)   || 0,
      minTickets: parseInt(minTickets)   || 0,
      maxUses:    parseInt(maxUses)      || 0,
      validFrom:  validFrom  || null,
      validUntil: validUntil || null,
      description: description || '',
      isActive:   isActive   === 'on' || isActive   === true,
      isFeatured: isFeatured === 'on' || isFeatured === true,
    });
    res.redirect('/admin/coupons');
  } catch(err) {
    res.redirect('/admin/coupons?err=' + encodeURIComponent(err.code === 11000 ? 'Coupon code already exists.' : err.message));
  }
});

// POST /admin/coupons/:id/edit — edit existing coupon
router.post('/coupons/:id/edit', async (req, res) => {
  try {
    const { code, type, value, minOrder, minTickets, maxUses, validFrom, validUntil, description, isActive, isFeatured } = req.body;
    await Coupon.findByIdAndUpdate(req.params.id, {
      code:       code.toUpperCase().trim(),
      type:       type       || 'fixed',
      value:      parseFloat(value),
      minOrder:   parseFloat(minOrder)   || 0,
      minTickets: parseInt(minTickets)   || 0,
      maxUses:    parseInt(maxUses)      || 0,
      validFrom:  validFrom  || null,
      validUntil: validUntil || null,
      description: description || '',
      isActive:   isActive   === 'on' || isActive   === true,
      isFeatured: isFeatured === 'on' || isFeatured === true,
    });
    res.redirect('/admin/coupons');
  } catch(err) {
    res.redirect('/admin/coupons?err=' + encodeURIComponent(err.message));
  }
});

// POST /admin/coupons/:id/toggle — flip isActive
router.post('/coupons/:id/toggle', async (req, res) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (c) { c.isActive = !c.isActive; await c.save(); }
    res.redirect('/admin/coupons');
  } catch(err) { res.redirect('/admin/coupons'); }
});

// POST /admin/coupons/:id/feature — flip isFeatured
router.post('/coupons/:id/feature', async (req, res) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (c) { c.isFeatured = !c.isFeatured; await c.save(); }
    res.redirect('/admin/coupons');
  } catch(err) { res.redirect('/admin/coupons'); }
});

// POST /admin/coupons/:id/delete
router.post('/coupons/:id/delete', async (req, res) => {
  try { await Coupon.findByIdAndDelete(req.params.id); res.redirect('/admin/coupons'); }
  catch(err) { res.redirect('/admin/coupons'); }
});


// ── Participants (QR scan log) by event ──
router.get('/participants', async (req, res) => {
  try {
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
    const events = await Event.find().sort({ date: -1 }).lean();
    const selectedId = req.query.event || (events[0]?._id?.toString() || '');
    const selectedEvent = selectedId ? await Event.findById(selectedId).select('name date venue').lean() : null;
    let logs = [];
    if (selectedId) {
      logs = await ScanLog.find({ event: selectedId })
        .populate('booking', 'bookingRef ticketType quantity totalAmount')
        .sort({ scannedAt: -1 })
        .lean();
    }
    res.render('admin/participants', { title: 'Staff Activity — Admin', events, logs, selectedId, selectedEvent, currentAdmin, isSuperAdmin });
  } catch(err) { console.error(err); res.status(500).send('Error'); }
});

// ── Admin: Users by Event ──
router.get('/users-by-event', async (req, res) => {
  try {
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
    const events = await Event.find().sort({ date: -1 }).select('name date').lean();
    const selectedEventId = req.query.eventId || '';
    let bookings = [];
    let selectedEvent = null;
    if (selectedEventId) {
      selectedEvent = await Event.findById(selectedEventId).select('name date venue').lean();
      bookings = await Booking.find({ event: selectedEventId, paymentStatus: 'paid' })
        .populate('user', 'firstName lastName email phone')
        .sort({ createdAt: -1 })
        .lean();
      const enteredRefs = new Set(
        (await ScanLog.find({ event: selectedEventId }).select('bookingRef').lean())
          .map(l => l.bookingRef)
      );
      const attendees = [];
      bookings.forEach(b => {
        (b.tickets||[]).forEach(t => {
          attendees.push({
            bookingRef:  b.bookingRef,
            ticketType:  b.ticketType,
            totalAmount: b.totalAmount,
            quantity:    b.quantity,
            couponCode:  b.couponCode||null,
            createdAt:   b.createdAt,
            user:        b.user,
            ticketId:    t.ticketId,
            name:        t.attendee?.name || (b.user ? (b.user.firstName+' '+(b.user.lastName||'')) : '—'),
            age:         t.attendee?.age  || null,
            gender:      t.attendee?.gender || '',
            seatNumber:  t.seatNumber || null,
            isUsed:      t.isUsed || false,
            usedAt:      t.usedAt  || null,
            entered:     enteredRefs.has(b.bookingRef),
          });
        });
      });
      return res.render('admin/users-by-event', { title: 'Users by Event — Admin', events, bookings, attendees, selectedEvent, selectedEventId, currentAdmin, isSuperAdmin });
    }
    res.render('admin/users-by-event', { title: 'Users by Event — Admin', events, bookings:[], attendees:[], selectedEvent:null, selectedEventId, currentAdmin, isSuperAdmin });
  } catch(err) {
    console.error('/admin/users-by-event error:', err);
    res.status(500).send('Error loading users by event');
  }
});

// ── Admin: Send WhatsApp event reminder to a phone number ──
router.post('/api/send-reminder', async (req, res) => {
  try {
    const { phone, name, eventId, type } = req.body;
    if (!phone || !eventId) return res.json({ success: false, message: 'Missing phone or eventId' });
    const event = await Event.findById(eventId).lean();
    if (!event) return res.json({ success: false, message: 'Event not found' });
    const { sendWhatsAppReminder } = require('../utils/whatsappHelper');
    await sendWhatsAppReminder({ phone, name: name||'Guest', event, type: type||'reminder' });
    res.json({ success: true });
  } catch(err) {
    console.error('Reminder error:', err);
    res.json({ success: false, message: err.message });
  }
});

// ── Admin: Entered Tickets (Scan Log) ──
router.get('/entered-tickets', async (req, res) => {
  try {
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffUser && req.session.staffUser.role === 'superadmin');
    const events = await Event.find().sort({ date: -1 }).lean();
    const selectedEventId = req.query.eventId || (events[0]?._id?.toString() || '');
    let logs = [];
    let selectedEvent = null;
    if (selectedEventId) {
      selectedEvent = await Event.findById(selectedEventId).lean();
      logs = await ScanLog.find({ event: selectedEventId })
        .populate('booking', 'bookingRef ticketType quantity totalAmount')
        .sort({ scannedAt: -1 })
        .lean();
    }
    res.render('admin/entered-tickets', { title: 'Entered Tickets — Admin', events, logs, selectedEvent, selectedEventId, currentAdmin, isSuperAdmin });
  } catch(err) { console.error(err); res.status(500).send('Error loading entered tickets'); }
});


module.exports = router;