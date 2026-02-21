const Event   = require('../models/Event');
const Booking = require('../models/Booking');
const User    = require('../models/User');

// ── GET /admin ── Dashboard
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

    // Parse ticket tiers from hidden JSON field (set by browser JS before submit)
    let rawTiers = [];
    try {
      rawTiers = JSON.parse(b.ticketTypesJson || '[]');
    } catch(e) {
      console.error('❌ ticketTypesJson parse error:', e.message, '| raw:', b.ticketTypesJson);
    }
    console.log('📋 Create — ticketTypesJson raw:', b.ticketTypesJson);
    console.log('📋 Create — parsed tiers:', rawTiers.length, JSON.stringify(rawTiers));

    const ticketTypes = rawTiers.map(t => ({
      name:        (t.name || '').trim(),
      category:    t.category || 'standard',
      price:       parseInt(t.price)       || 0,
      totalSeats:  parseInt(t.totalSeats)  || 0,
      bookedSeats: parseInt(t.bookedSeats) || 0,
      includes:    Array.isArray(t.includes) ? t.includes : [],
      isActive:    true,
    }));

    const event = await Event.create({
      name:           b.name,
      tagline:        b.tagline        || '',
      description:    b.description   || '',
      date:           new Date(b.date),
      doorsOpen:      b.doorsOpen      || '8:00 PM',
      endTime:        b.endTime        || '4:00 AM',
      venue:          b.venue,
      venueAddress:   b.venueAddress   || '',
      dressCode:      b.dressCode      || 'All Black',
      ageLimit:       parseInt(b.ageLimit)       || 18,
      convenienceFee: parseInt(b.convenienceFee) || 20,
      poster:         b.poster         || '🎶',
      genre:          b.genre          || 'Electronic',
      ticketTypes,
      isActive:   b.isActive   === true || b.isActive === 'on',
      isFeatured: b.isFeatured === true || b.isFeatured === 'on',
    });

    console.log('✅ Event created:', event.name, '| Tiers:', event.ticketTypes.length);
    res.redirect('/admin?success=Event+created');
  } catch (err) {
    console.error('❌ Create event error:', err.message);
    res.render('admin/event-form', { title: 'New Event — Admin', event: null, error: err.message });
  }
};

// ── GET /admin/events/:id/edit ── Edit form
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

    // Parse ticket tiers from hidden JSON field
    let rawTiers2 = [];
    try {
      rawTiers2 = JSON.parse(b.ticketTypesJson || '[]');
    } catch(e) {
      console.error('❌ ticketTypesJson parse error:', e.message, '| raw:', b.ticketTypesJson);
    }
    console.log('📋 Update — ticketTypesJson raw:', b.ticketTypesJson);
    console.log('📋 Update — parsed tiers:', rawTiers2.length, JSON.stringify(rawTiers2));

    const ticketTypes = rawTiers2.map(t => ({
      name:        (t.name || '').trim(),
      category:    t.category || 'standard',
      price:       parseInt(t.price)       || 0,
      totalSeats:  parseInt(t.totalSeats)  || 0,
      bookedSeats: parseInt(t.bookedSeats) || 0,
      includes:    Array.isArray(t.includes) ? t.includes : [],
      isActive:    true,
    }));

    await Event.findByIdAndUpdate(req.params.id, {
      name:           b.name,
      tagline:        b.tagline        || '',
      description:    b.description   || '',
      date:           new Date(b.date),
      doorsOpen:      b.doorsOpen      || '8:00 PM',
      endTime:        b.endTime        || '4:00 AM',
      venue:          b.venue,
      venueAddress:   b.venueAddress   || '',
      dressCode:      b.dressCode      || 'All Black',
      ageLimit:       parseInt(b.ageLimit)       || 18,
      convenienceFee: parseInt(b.convenienceFee) || 20,
      poster:         b.poster         || '🎶',
      genre:          b.genre          || 'Electronic',
      ticketTypes,
      isActive:   b.isActive   === true || b.isActive   === 'on',
      isFeatured: b.isFeatured === true || b.isFeatured === 'on',
    });

    console.log('✅ Event updated | Tiers:', ticketTypes.length);
    res.redirect('/admin?success=Event+updated');
  } catch (err) {
    console.error('❌ Update event error:', err.message);
    const event = await Event.findById(req.params.id).catch(()=>null);
    res.render('admin/event-form', { title: 'Edit Event — Admin', event, error: err.message });
  }
};

// ── POST /admin/events/:id/delete ── Delete
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
