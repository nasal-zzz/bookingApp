const nodemailer = require('nodemailer');
const { generateTicketPDF } = require('./pdfHelper');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Send booking confirmation email with QR codes
const sendBookingConfirmation = async ({ to, name, booking, event }) => {
  if (!process.env.SMTP_USER) {
    console.log(`📧 [DEV] Skipping email to ${to} — SMTP not configured.`);
    return;
  }

  const ticketRows = booking.tickets.map((t, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${t.attendee.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${t.ticketId}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#08080e;color:#e8e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0a0a0f,#1a1f00);padding:30px;text-align:center;">
        <h1 style="font-size:2rem;letter-spacing:4px;color:#fff;margin:0;">NIGHT<span style="color:#c8ff00;">PASS</span></h1>
      </div>
      <div style="padding:30px;">
        <h2 style="color:#c8ff00;letter-spacing:2px;margin-bottom:8px;">BOOKING CONFIRMED! 🎉</h2>
        <p style="color:#aaa;">Hi ${name}, your tickets for <strong style="color:#fff;">${event.name}</strong> are confirmed.</p>

        <div style="background:#13131e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:20px;margin:20px 0;">
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Booking Ref:</span> <strong style="color:#c8ff00;">${booking.bookingRef}</strong></p>
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Event:</span> <strong style="color:#fff;">${event.name}</strong></p>
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Date:</span> <strong style="color:#fff;">${new Date(event.date).toDateString()}</strong></p>
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Venue:</span> <strong style="color:#fff;">${event.venue}</strong></p>
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Tickets:</span> <strong style="color:#fff;">${booking.quantity} × ${booking.ticketType}</strong></p>
          <p style="margin:4px 0;"><span style="color:#5a5a72;">Total Paid:</span> <strong style="color:#c8ff00;">₹${booking.totalAmount.toLocaleString('en-IN')}</strong></p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <thead>
            <tr style="background:#161620;">
              <th style="padding:8px;text-align:left;color:#5a5a72;font-size:11px;letter-spacing:1px;">#</th>
              <th style="padding:8px;text-align:left;color:#5a5a72;font-size:11px;letter-spacing:1px;">ATTENDEE</th>
              <th style="padding:8px;text-align:left;color:#5a5a72;font-size:11px;letter-spacing:1px;">TICKET ID</th>
            </tr>
          </thead>
          <tbody>${ticketRows}</tbody>
        </table>

        <div style="background:rgba(200,255,0,0.08);border:1px solid rgba(200,255,0,0.2);border-radius:8px;padding:16px;margin-top:20px;">
          <p style="margin:0;font-size:13px;color:#aaa;">
            <strong style="color:#c8ff00;">⚠ Important:</strong> Each QR code is for single-entry use only. 
            Carry a valid government ID. Dress code: <strong style="color:#fff;">${event.dressCode}</strong>. 
            Doors open at <strong style="color:#fff;">${event.doorsOpen}</strong>.
          </p>
        </div>

        <div style="background:rgba(200,255,0,0.06);border:1px solid rgba(200,255,0,0.2);border-radius:8px;padding:16px;margin-top:20px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:#c8ff00;font-weight:700;">📎 Your tickets are attached to this email</p>
          <p style="margin:0;font-size:12px;color:#aaa;">Open the attached file in your browser and press <strong style="color:#fff;">Ctrl+P → Save as PDF</strong> to save your QR tickets.</p>
        </div>

        <div style="text-align:center;margin-top:20px;">
          <a href="${process.env.APP_URL}/booking/ticket/${booking._id}" 
             style="background:#c8ff00;color:#000;padding:12px 30px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;">
            VIEW MY TICKETS ONLINE
          </a>
        </div>
      </div>
      <div style="background:#0f0f18;padding:16px;text-align:center;font-size:11px;color:#5a5a72;">
        NightPass · This is an automated email. Do not reply.
      </div>
    </div>`;

  // Generate ticket PDF buffer
  let pdfAttachment = null;
  try {
    const pdfBuffer = await generateTicketPDF({ booking, event });
    pdfAttachment = {
      filename: `NightPass_${booking.bookingRef}_Tickets.html`,
      content: pdfBuffer,
      contentType: 'text/html',
    };
    console.log('📄 Ticket PDF generated:', pdfBuffer.length, 'bytes');
  } catch (pdfErr) {
    console.error('⚠ PDF generation failed (email will send without attachment):', pdfErr.message);
  }

  const mailOptions = {
    from: `"NightPass" <${process.env.SMTP_USER}>`,
    to,
    subject: `🎟 Your Tickets — ${event.name} [${booking.bookingRef}]`,
    html,
    attachments: pdfAttachment ? [pdfAttachment] : [],
  };

  await transporter.sendMail(mailOptions);
  console.log(`📧 Confirmation email sent to ${to} ${pdfAttachment ? '(with ticket attachment)' : '(no attachment)'}`);
};

module.exports = { sendBookingConfirmation };
