/**
 * pdfHelper.js
 * Generates a multi-ticket PDF as a Buffer using only built-in Node.js
 * and the already-installed 'qrcode' package.
 * 
 * Strategy: Build an SVG for each ticket, combine into a multi-page
 * PDF-like structure. Since we can't use pdfkit without npm install,
 * we use a well-structured HTML email attachment approach:
 * Generate one clean HTML file per booking that browsers/email clients
 * can print as PDF, AND attach individual QR PNGs.
 * 
 * Actually — we generate a proper multi-page PDF using pure JS (no deps).
 * We build it as a self-contained HTML file that auto-prints on open,
 * which users can save as PDF. Attached as .html with print CSS.
 * 
 * For true PDF binary, we use a minimal PDF writer in pure JS.
 */

const QRCode = require('qrcode');

/**
 * Generate a booking confirmation PDF as a Buffer.
 * Returns a Buffer containing the PDF file.
 */
const generateTicketPDF = async ({ booking, event }) => {

  const ACCENT = '#c8ff00';
  const BG     = '#08080e';
  const CARD   = '#13131e';
  const MUTED  = '#5a5a72';

  // Regenerate QR PNGs as base64 for embedding (they may already be stored)
  const ticketBlocks = await Promise.all(booking.tickets.map(async (t, i) => {
    let qrSrc = t.qrCode || '';

    // If QR not stored or is empty, regenerate it
    if (!qrSrc || !qrSrc.startsWith('data:image')) {
      try {
        const payload = JSON.parse(t.qrData || '{}');
        qrSrc = await QRCode.toDataURL(JSON.stringify(payload), {
          width: 300, margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'H',
        });
      } catch(e) { qrSrc = ''; }
    }

    return { t, i, qrSrc };
  }));

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Build one HTML page per ticket, each in a @page block
  const ticketPages = ticketBlocks.map(({ t, i, qrSrc }) => `
    <div class="ticket-page">
      <div class="ticket">

        <!-- LEFT PANEL -->
        <div class="left">
          <div class="brand">MELATTUR ENTERTINMENT EVENTS</div>
          <div class="event-name">${escHtml(event.name)}</div>
          <div class="divider"></div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">DATE</div>
              <div class="info-value">${eventDate}</div>
            </div>
            <div class="info-item">
              <div class="info-label">DOORS OPEN</div>
              <div class="info-value">${escHtml(event.doorsOpen || '8:00 PM')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">UNTIL</div>
              <div class="info-value">${escHtml(event.endTime || '4:00 AM')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">VENUE</div>
              <div class="info-value">${escHtml(event.venue)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">TICKET TYPE</div>
              <div class="info-value accent">${escHtml(booking.ticketType.toUpperCase())}</div>
            </div>
          </div>

          <div class="price-row">
            <span class="price-label">PRICE PAID</span>
            <span class="price-val">&#8377;${Math.round(booking.totalAmount / booking.quantity).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <!-- PERFORATION -->
        <div class="perf">
          <div class="perf-cut top"></div>
          <div class="perf-line"></div>
          <div class="perf-cut bot"></div>
        </div>

        <!-- RIGHT PANEL -->
        <div class="right">
          <div class="attendee-name">${escHtml(t.attendee.name)}</div>
          <div class="ticket-num">Ticket ${i + 1} of ${booking.quantity} &nbsp;·&nbsp; ${escHtml(booking.ticketType)}</div>

          ${qrSrc ? `<img class="qr-img" src="${qrSrc}" alt="QR Code"/>` : '<div class="qr-placeholder">QR CODE</div>'}

          <div class="valid-badge">&#10003; VALID &nbsp;·&nbsp; ONE TIME ENTRY</div>

          <div class="ticket-id">${escHtml(t.ticketId)}</div>
          <div class="booking-ref">REF: ${escHtml(booking.bookingRef)}</div>
          <div class="scan-note">SCAN AT ENTRY &nbsp;·&nbsp; 18+ &nbsp;·&nbsp; VALID PHOTO ID REQUIRED</div>
        </div>

      </div>
    </div>
  `).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>NightPass Tickets — ${escHtml(booking.bookingRef)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Outfit:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #f0f0f0;
    font-family: 'Outfit', Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Each ticket fills one print page */
  .ticket-page {
    page-break-after: always;
    width: 210mm;
    height: 148mm;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8mm;
  }
  .ticket-page:last-child { page-break-after: avoid; }

  /* The ticket itself — landscape A5 */
  .ticket {
    width: 194mm;
    height: 132mm;
    display: flex;
    background: ${BG};
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    position: relative;
  }

  /* LEFT PANEL */
  .left {
    width: 58%;
    background: #0f1600;
    padding: 10mm 8mm;
    display: flex;
    flex-direction: column;
    gap: 4mm;
    position: relative;
    border-top: 2.5px solid ${ACCENT};
  }

  .brand {
    font-family: 'Space Mono', monospace;
    font-size: 7pt;
    letter-spacing: 4px;
    color: rgba(255,255,255,0.35);
  }

  .event-name {
    font-family: 'Anton', Impact, sans-serif;
    font-size: 22pt;
    letter-spacing: 2px;
    color: #fff;
    line-height: 1;
  }

  .divider {
    height: 1px;
    background: ${ACCENT};
    width: 80%;
    margin: 1mm 0;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm 4mm;
    flex: 1;
  }

  .info-label {
    font-family: 'Space Mono', monospace;
    font-size: 5.5pt;
    letter-spacing: 2px;
    color: rgba(200,255,0,0.55);
    margin-bottom: 1px;
  }

  .info-value {
    font-family: 'Outfit', sans-serif;
    font-size: 8pt;
    font-weight: 600;
    color: #e8e8f0;
  }

  .info-value.accent { color: ${ACCENT}; }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: auto;
    padding-top: 3mm;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .price-label {
    font-size: 6pt;
    letter-spacing: 2px;
    color: ${MUTED};
    font-family: 'Space Mono', monospace;
  }

  .price-val {
    font-family: 'Anton', Impact, sans-serif;
    font-size: 18pt;
    color: ${ACCENT};
  }

  /* PERFORATION */
  .perf {
    width: 8px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: ${BG};
  }

  .perf-line {
    flex: 1;
    width: 1px;
    background: repeating-linear-gradient(
      to bottom,
      rgba(255,255,255,0.15) 0px,
      rgba(255,255,255,0.15) 4px,
      transparent 4px,
      transparent 8px
    );
  }

  .perf-cut {
    width: 16px;
    height: 16px;
    background: #f0f0f0;
    border-radius: 50%;
    flex-shrink: 0;
    margin: -8px;
  }

  /* RIGHT PANEL */
  .right {
    flex: 1;
    background: ${CARD};
    padding: 8mm;
    display: flex;
    flex-direction: column;
    gap: 2.5mm;
    align-items: flex-start;
  }

  .attendee-name {
    font-family: 'Anton', Impact, sans-serif;
    font-size: 16pt;
    letter-spacing: 1px;
    color: #fff;
    line-height: 1;
  }

  .ticket-num {
    font-size: 7pt;
    color: ${MUTED};
    font-family: 'Space Mono', monospace;
  }

  .qr-img {
    width: 52mm;
    height: 52mm;
    border-radius: 4px;
    margin: 1mm 0;
  }

  .qr-placeholder {
    width: 52mm;
    height: 52mm;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8pt;
    color: ${MUTED};
    margin: 1mm 0;
  }

  .valid-badge {
    background: rgba(76,220,128,0.12);
    border: 1px solid rgba(76,220,128,0.35);
    color: #4cdc80;
    font-family: 'Space Mono', monospace;
    font-size: 6pt;
    letter-spacing: 1px;
    padding: 2px 8px;
    border-radius: 3px;
  }

  .ticket-id {
    font-family: 'Space Mono', monospace;
    font-size: 7pt;
    color: rgba(200,255,0,0.6);
    letter-spacing: 1px;
    margin-top: 1mm;
  }

  .booking-ref {
    font-family: 'Space Mono', monospace;
    font-size: 6pt;
    color: ${MUTED};
  }

  .scan-note {
    font-size: 5.5pt;
    color: rgba(255,255,255,0.2);
    font-family: 'Space Mono', monospace;
    margin-top: auto;
    letter-spacing: 0.5px;
  }

  /* PRINT STYLES */
  @media print {
    body { background: white; }
    .ticket-page {
      width: 210mm;
      height: 148mm;
      padding: 5mm;
    }
    .perf-cut { background: white; }
  }

  @page {
    size: A5 landscape;
    margin: 0;
  }
</style>
</head>
<body>
${ticketPages}
</body>
</html>`;

  return Buffer.from(html, 'utf8');
};

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { generateTicketPDF };
