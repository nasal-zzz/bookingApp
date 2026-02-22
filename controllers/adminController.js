const Event   = require('../models/Event');
const Booking = require('../models/Booking');
const User    = require('../models/User');

// ── GET /admin ── Dashboard

// ── Parse event form body into DB-ready object ──
function parseEventBody(b) {
  // Parse tickets
  let rawTiers = [];
  try { rawTiers = JSON.parse(b.ticketTypesJson || '[]'); } catch(e) {}
  const ticketTypes = rawTiers.map(t => ({
    category:    t.category,
    price:       parseInt(t.price)        || 0,
    ageLimit:    parseInt(t.ageLimit)     || 18,
    ticketType:  t.ticketType             || 'single',
    totalSeats:  parseInt(t.totalSeats)   || 0,
    bookedSeats: parseInt(t.bookedSeats)  || 0,
    terms:       t.terms                  || '',
    isActive:    t.isActive === true || t.isActive === 'true',
    isCombo:     t.isCombo  === true || t.isCombo  === 'true',
    comboCount:  parseInt(t.comboCount)   || 1,
  }));

  // Parse artists
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
    dressCode:        b.dressCode        || 'All Black',
    convenienceFee:   parseInt(b.convenienceFee) || 20,
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
    res.render('admin/dashboard', {
      title: 'Admin — NightPass',
      events,
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

// ── GET /admin/events/new ── Create form
exports.getNewEvent = (req, res) => {
  res.render('admin/event-form', {
    title: 'New Event — Admin',
    event: null,
    error: null,
  });
};

// ── POST /admin/events ── Create event (JSON body from fetch)
exports.postCreateEvent = async (req, res) => {
  try {
    const b = req.body;
    const eventData = parseEventBody(b);
    const event = await Event.create(eventData);
    console.log('✅ Event created:', event.name, '| Tiers:', event.ticketTypes.length);
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
  } catch (err) {
    res.redirect('/admin');
  }
};

// ── POST /admin/events/:id ── Update event (JSON body from fetch)
exports.postUpdateEvent = async (req, res) => {
  try {
    const b = req.body;
    const eventData = parseEventBody(b);
    await Event.findByIdAndUpdate(req.params.id, eventData, { new: true });
    console.log('✅ Event updated:', req.params.id);
    return res.redirect('/admin?success=Event+updated');
  } catch (err) {
    console.error('postUpdateEvent error:', err);
    const event = await Event.findById(req.params.id).catch(() => null);
    return res.render('admin/event-form', { title: 'Edit Event', event, error: err.message });
  }
};


exports.deleteEvent = async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.redirect('/admin?success=Event deleted');
  } catch (err) {
    res.redirect('/admin');
  }
};

// ── POST /admin/events/:id/toggle ── Toggle active
exports.toggleEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (event) { event.isActive = !event.isActive; await event.save(); }
    res.redirect('/admin');
  } catch (err) {
    res.redirect('/admin');
  }
};

// ── GET /admin/bookings ── All bookings
exports.getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ paymentStatus: 'paid' })
      .populate('user', 'firstName lastName phone email')
      .populate('event', 'name date')
      .sort({ createdAt: -1 })
      .limit(200);
    res.render('admin/bookings', { title: 'Bookings — Admin', bookings });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
};
