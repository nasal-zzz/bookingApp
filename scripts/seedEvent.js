/**
 * Seed Script — creates the Eclipse Dark Night event in MongoDB
 * Run: node scripts/seedEvent.js
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const connectDB = require('../config/db');

const seedEvent = async () => {
  await connectDB();

  // Delete existing active event (fresh seed)
  await Event.deleteMany({});
  console.log('🗑  Cleared existing events.');

  const event = await Event.create({
    name: 'Eclipse Dark Night',
    tagline: 'One Night. One Frequency. Total Eclipse.',
    description: 'Kochi\'s most anticipated underground night returns. Expect world-class DJ sets, laser shows, and a crowd that knows how to move.',
    date: new Date('2026-03-15T21:00:00'),
    doorsOpen: '8:30 PM',
    endTime: '4:00 AM',
    venue: 'Club Axis, MG Road',
    venueAddress: 'MG Road, Ernakulam, Kochi, Kerala 682016',
    dressCode: 'All Black',
    ageLimit: 18,
    convenienceFee: 20,
    isActive: true,
    ticketTypes: [
      {
        name: 'General',
        price: 999,
        totalSeats: 300,
        bookedSeats: 0,
        includes: [
          'Entry Pass (9 PM – 4 AM)',
          'Welcome Drink',
          'Photo Booth Access',
          'Full Night Access',
        ],
        isActive: true,
      },
      {
        name: 'VIP',
        price: 1999,
        totalSeats: 50,
        bookedSeats: 50, // sold out by default for demo
        includes: [
          'Priority Entry (Fast Lane)',
          'Reserved Table',
          '3 Premium Drinks',
          'Photo Booth Access',
          'Full Night Access',
        ],
        isActive: true,
      },
    ],
  });

  console.log('✅ Event seeded:', event.name, '| ID:', event._id);
  console.log('🎟  General seats:', event.ticketTypes[0].totalSeats);
  console.log('💎  VIP seats:', event.ticketTypes[1].totalSeats, '(sold out)');
  mongoose.disconnect();
};

seedEvent().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
