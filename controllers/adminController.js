const Event   = require('../models/Event');
const Booking = require('../models/Booking');
const User    = require('../models/User');

// ── Helper: get current admin from session ──
function getCurrentAdmin(req) {
  if (req.session.staffUser) return req.session.staffUser;
  if (req.session.adminUser) return { username: req.session.adminUser, name: req.session.adminUser, role: 'admin' };
  return { username: 'admin', name: 'Admin', role: 'admin' };
}

// ── Parse event form body into DB-ready object ──
function parseEventBody(b) {
  let rawTiers = [];
  try { rawTiers = JSON.parse(b.ticketTypesJson || '[]'); } catch(e) {}
  const ticketTypes = rawTiers.map(t => ({
    category:    String(t.category || '').toLowerCase().replace(/\s+/g,'_'),
    name:        String(t.name     || t.category || ''),
    color:       t.color           || '#6A0DAD',
    price:       parseInt(t.price)        || 0,
    ageLimit:    parseInt(t.ageLimit)     || 0,
    ticketType:  t.ticketType             || 'single',
    totalSeats:  parseInt(t.totalSeats)   || 0,
    bookedSeats: parseInt(t.bookedSeats)  || 0,
    terms:       t.terms                  || '',
    isActive:    t.isActive === true || t.isActive === 'true',
    isCombo:     t.isCombo  === true || t.isCombo  === 'true',
    comboCount:  parseInt(t.comboCount)   || 1,
  }));

  let artists = [];
  try { artists = JSON.parse(b.artistsJson || '[]'); } catch(e) {}

  return {
    name:             b.name,
    shortDescription: b.shortDescription || '',
    about:            b.about            || '',
    bannerDesktop:    b.bannerDesktop    || '',
    bannerMobile:     b.bannerMobile     || '',
    bannerDetail:     b.bannerDetail     || '',
    artists,
    date:             new Date(b.date),
    doorsOpen:        b.doorsOpen        || '8:00 PM',
    endTime:          b.endTime          || '4:00 AM',
    venue:            b.venue,
    venueAddress:     b.venueAddress     || '',
    googleMapLink:    b.googleMapLink    || '',
    convenienceFee:   parseInt(b.convenienceFee) || 0,
    isActive:         b.isActive === 'true' || b.isActive === true,
    isFeatured:       b.isFeatured === 'true' || b.isFeatured === true,
    ticketTypes,
  };
}

exports.getDashboard = async (req, res) => {
  try {
    const [events, totalBookings, totalUsers] = await Promise.all([
      Event.find().sort({ date: -1 }),
      Booking.countDocuments({ paymentStatus: 'paid' }),
      User.countDocuments(),
    ]);
    const revenue = await Booking.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const currentAdmin  = getCurrentAdmin(req);
    const isSuperAdmin  = req.session.superAdminLoggedIn ||
      (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/dashboard', {
      title: 'Admin — MEE',
      events,
      currentAdmin,
      isSuperAdmin,
      stats: {
        totalEvents: events.length,
        activeEvents: events.filter(e => e.isActive).length,
        totalBookings,
        totalUsers,
        revenue: revenue[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).send('Admin error: ' + err.message);
  }
};

exports.getNewEvent = (req, res) => {
  const currentAdmin = getCurrentAdmin(req);
  const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
  res.render('admin/event-form', { title: 'New Event — Admin', event: null, error: null, currentAdmin, isSuperAdmin });
};

exports.postCreateEvent = async (req, res) => {
  try {
    const event = await Event.create(parseEventBody(req.body));
    console.log('✅ Event created:', event.name);
    return res.redirect('/admin?success=Event+created');
  } catch (err) {
    console.error('postCreateEvent error:', err);
    return res.render('admin/event-form', { title: 'New Event', event: null, error: err.message });
  }
};

exports.getEditEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.redirect('/admin');
    res.render('admin/event-form', { title: 'Edit Event — Admin', event, error: null });
  } catch (err) { res.redirect('/admin'); }
};

exports.postUpdateEvent = async (req, res) => {
  try {
    await Event.findByIdAndUpdate(req.params.id, parseEventBody(req.body), { new: true });
    return res.redirect('/admin?success=Event+updated');
  } catch (err) {
    const event = await Event.findById(req.params.id).catch(() => null);
    return res.render('admin/event-form', { title: 'Edit Event', event, error: err.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.redirect('/admin?success=Event deleted');
  } catch (err) { res.redirect('/admin'); }
};

exports.toggleEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (event) { event.isActive = !event.isActive; await event.save(); }
    res.redirect('/admin');
  } catch (err) { res.redirect('/admin'); }
};

exports.getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ paymentStatus: 'paid' })
      .populate('user', 'firstName lastName phone email')
      .populate('event', 'name date')
      .sort({ createdAt: -1 })
      .limit(200);
    const currentAdmin = getCurrentAdmin(req);
    const isSuperAdmin = req.session.superAdminLoggedIn || (req.session.staffLoggedIn && req.session.staffUser?.role === 'superadmin');
    res.render('admin/bookings', { title: 'Bookings — Admin', bookings, currentAdmin, isSuperAdmin });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
};

// ── Seat Map ────────────────────────────────────────────────────────────────
const SeatMap = require('../models/SeatMap');

// GET /admin/seatmap/:eventId
exports.getSeatMap = async (req, res) => {
  try {
    const event   = await Event.findById(req.params.eventId);
    if (!event) return res.redirect('/admin');
    const seatMap = await SeatMap.findOne({ event: req.params.eventId }).lean() || null;
    res.render('admin/seatmap', { title: 'Seat Map Builder', event, seatMap });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
};

// POST /admin/seatmap/:eventId  ← FIXED: explicitly maps every zone field
exports.postSeatMap = async (req, res) => {
  try {
    const { eventId, stage, sections, isActive, canvasWidth, canvasHeight, previewImage } = req.body;

    // ── Explicitly map section fields so Mongoose stores them correctly ──
    const cleanSections = (sections || []).map(s => ({
      name:        String(s.name   || ''),
      category:    String(s.category || ''),
      // Zone visual — these are what was getting lost before
      zoneShape:   s.zoneShape || 'rect',
      zoneW:       Number(s.zoneW)   || 200,
      zoneH:       Number(s.zoneH)   || 100,
      zoneRot:     s.zoneRot != null ? Number(s.zoneRot) : 0,  // 0 is valid!
      x:           Number(s.x)       || 0,
      y:           Number(s.y)       || 0,
      totalSeats:  Number(s.totalSeats)  || 0,
      bookedSeats: Number(s.bookedSeats) || 0,
      rows:        1,
      seatsPerRow: 1,
      seats:       [],
    }));

    // ── Explicitly map stage fields ──
    const cleanStage = {
      shape:  stage?.shape  || 'rectangle',
      label:  stage?.label  || 'STAGE',
      x:      Number(stage?.x)      || 80,
      y:      Number(stage?.y)      || 30,
      width:  Number(stage?.width)  || 500,
      height: Number(stage?.height) || 100,
    };

    const updateDoc = {
      event:        eventId,
      stage:        cleanStage,
      sections:     cleanSections,
      isActive:     !!isActive,
      canvasWidth:  Number(canvasWidth)  || 960,
      canvasHeight: Number(canvasHeight) || 760,
    };

    // Only update previewImage if one was sent (it's a large base64 string)
    if (previewImage && previewImage.startsWith('data:image')) {
      updateDoc.previewImage = previewImage;
    }

    await SeatMap.findOneAndUpdate(
      { event: eventId },
      updateDoc,
      { upsert: true, new: true, runValidators: false }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('SeatMap save error:', err);
    res.json({ success: false, message: err.message });
  }
};

// POST /admin/seatmap/:eventId/toggle
exports.toggleSeatMap = async (req, res) => {
  try {
    const map = await SeatMap.findOne({ event: req.params.eventId });
    if (map) { map.isActive = !map.isActive; await map.save(); }
    res.json({ success: true, isActive: map?.isActive });
  } catch (err) {
    res.json({ success: false });
  }
};