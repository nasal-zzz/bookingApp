// ── NightPass Full-Page Language System ──
// Translates entire page content between English and Malayalam

const NP_TRANSLATIONS = {

  // ── COMMON ──
  'Details': 'വിശദാംശങ്ങൾ',
  'Lineup': 'ലൈനപ്പ്',
  'Tickets': 'ടിക്കറ്റുകൾ',
  'Login': 'ലോഗിൻ',
  'Get Tickets': 'ടിക്കറ്റ് നേടുക',
  'My Profile': 'എന്റെ പ്രൊഫൈൽ',
  'Book Tickets': 'ടിക്കറ്റ് ബുക്ക് ചെയ്യുക',
  'My Bookings': 'എന്റെ ബുക്കിംഗുകൾ',
  'Sign Out': 'സൈൻ ഔട്ട്',
  'Home': 'ഹോം',
  'Event Details': 'ഇവന്റ് വിശദാംശങ്ങൾ',
  'Sign Up': 'സൈൻ അപ്പ്',

  // ── INDEX PAGE ──
  'Book tickets for Kochi\'s most electrifying underground parties. Verified entry. QR passes. No queues.':
    'കൊച്ചിയിലെ ഏറ്റവും ആവേശകരമായ പാർട്ടികൾക്ക് ടിക്കറ്റ് ബുക്ക് ചെയ്യൂ. QR പാസ്. ക്യൂ ഇല്ല.',
  'Browse Events': 'ഇവന്റുകൾ കാണുക',
  'Create Account': 'അക്കൗണ്ട് ഉണ്ടാക്കുക',
  'NEXT EVENT IN': 'അടുത്ത ഇവന്റ്',
  'Days': 'ദിവസം',
  'Hours': 'മണിക്കൂർ',
  'Minutes': 'മിനിറ്റ്',
  'Seconds': 'സെക്കൻഡ്',
  '// upcoming events': '// വരാനിരിക്കുന്ന ഇവന്റുകൾ',
  'EVENTS': 'ഇവന്റുകൾ',
  'FEATURED': 'ഫീച്ചേർഡ്',
  'SOLD OUT': 'സോൾഡ് ഔട്ട്',
  'Sold Out': 'സോൾഡ് ഔട്ട്',
  'onwards': 'മുതൽ',
  'Book Now': 'ഇപ്പോൾ ബുക്ക് ചെയ്യുക',
  'NO EVENTS YET': 'ഇനിയും ഇവന്റുകൾ ഇല്ല',
  'Check back soon — something big is coming.': 'ഉടൻ വരുന്നു — ഭീകരൻ!',
  '© 2026 NightPass · Kochi · All rights reserved.': '© 2026 NightPass · കൊച്ചി · എല്ലാ അവകാശങ്ങളും നിക്ഷിപ്തം.',

  // ── LOGIN PAGE ──
  'Log in to book your entry pass. New here?': 'ബുക്ക് ചെയ്യാൻ ലോഗിൻ ചെയ്യൂ. പുതിയ ആളാണോ?',
  'Create an account': 'അക്കൗണ്ട് ഉണ്ടാക്കൂ',
  'Phone Number': 'ഫോൺ നമ്പർ',
  "We'll send a 6-digit OTP to verify your number": 'നമ്പർ സ്ഥിരീകരിക്കാൻ 6 അക്ക OTP അയക്കും',
  'Send OTP': 'OTP അയക്കുക',
  "Don't have an account?": 'അക്കൗണ്ട് ഇല്ലേ?',
  'Sign up for free': 'സൗജന്യമായി സൈൻ അപ്പ് ചെയ്യൂ',
  'Sending...': 'അയക്കുന്നു...',
  'Phone number must be 10 digits.': 'ഫോൺ നമ്പർ 10 അക്കം ആകണം.',

  // ── SIGNUP PAGE ──
  '// create account': '// അക്കൗണ്ട് ഉണ്ടാക്കുക',
  'Already have an account?': 'ഇതിനകം അക്കൗണ്ട് ഉണ്ടോ?',
  'Log in': 'ലോഗിൻ',
  'Sign up with Google': 'Google ഉപയോഗിച്ച് സൈൻ അപ്പ് ചെയ്യുക',
  'First Name *': 'പേരിന്റെ ആദ്യഭാഗം *',
  'First Name': 'പേരിന്റെ ആദ്യഭാഗം',
  'Last Name': 'പേരിന്റെ അവസാനഭാഗം',
  'Email Address': 'ഇമെയിൽ വിലാസം',
  'Phone Number *': 'ഫോൺ നമ്പർ *',
  'Create Account & Send OTP': 'അക്കൗണ്ട് ഉണ്ടാക്കി OTP അയക്കുക',
  'First name is required': 'ആദ്യ നാമം ആവശ്യമാണ്',
  'Sending OTP...': 'OTP അയക്കുന്നു...',

  // ── OTP PAGE ──
  '// verify': '// സ്ഥിരീകരിക്കുക',
  'VERIFY': 'സ്ഥിരീകരിക്കുക',
  'WHATSAPP OTP SENT TO': 'WhatsApp OTP അയച്ചു',
  'Enter the 6-digit OTP sent to your WhatsApp': 'WhatsApp-ൽ ലഭിച്ച 6 അക്ക OTP നൽകുക',
  'Check your WhatsApp messages': 'നിങ്ങളുടെ WhatsApp സന്ദേശങ്ങൾ പരിശോധിക്കുക',
  'Verify & Continue': 'സ്ഥിരീകരിച്ച് തുടരുക',
  'Verifying...': 'സ്ഥിരീകരിക്കുന്നു...',
  'Resend in': 'ഇനി അയക്കാൻ',
  'Resend OTP': 'OTP വീണ്ടും അയക്കുക',
  'Please enter all 6 digits.': 'എല്ലാ 6 അക്കങ്ങളും നൽകുക.',
  'New OTP sent to your WhatsApp!': 'പുതിയ OTP WhatsApp-ൽ അയച്ചു!',

  // ── BOOKING PAGE ──
  'SELECT TICKETS': 'ടിക്കറ്റ് തിരഞ്ഞെടുക്കുക',
  'ATTENDEE DETAILS': 'പങ്കെടുക്കുന്നവരുടെ വിവരങ്ങൾ',
  'ORDER SUMMARY': 'ഓർഡർ സംഗ്രഹം',
  'Ticket Type': 'ടിക്കറ്റ് തരം',
  'Number of Tickets': 'ടിക്കറ്റുകളുടെ എണ്ണം',
  'Max 5 tickets per booking': 'ഒരു ബുക്കിംഗിൽ പരമാവധി 5 ടിക്കറ്റ്',
  "Each ticket requires the attendee's name": 'ഓരോ ടിക്കറ്റിനും പേര് ആവശ്യം',
  'Full Name': 'പൂർണ്ണ നാമം',
  'Age': 'പ്രായം',
  'Special Requirement': 'പ്രത്യേക ആവശ്യം',
  'Add special requirement': 'പ്രത്യേക ആവശ്യം ചേർക്കുക',
  'Price Each': 'ഒന്നിന്റെ വില',
  'Quantity': 'എണ്ണം',
  'Subtotal': 'ഉപ-ആകെ',
  'Discount': 'കിഴിവ്',
  'Convenience Fee': 'സൗകര്യ ഫീസ്',
  'TOTAL': 'ആകെ',
  'Coupon code': 'കൂപ്പൺ കോഡ്',
  'APPLY': 'ബാധകമാക്കുക',
  'seats left!': 'സീറ്റുകൾ ബാക്കി!',
  'Proceed to Payment': 'പേയ്മെന്റിലേക്ക്',
  'Secure': 'സുരക്ഷിതം',
  'Refundable': 'തിരിച്ചടവ്',
  'Instant QR': 'തൽക്ഷണ QR',
  'YOU': 'നിങ്ങൾ',
  'Attendee': 'പങ്കെടുക്കുന്നയാൾ',
  '/person': '/ആൾ',
  'Only': 'മാത്രം',

  // ── TICKET PAGE ──
  'BOOKING CONFIRMED': 'ബുക്കിംഗ് സ്ഥിരീകരിച്ചു',
  'TICKETS BOOKED': 'ടിക്കറ്റ് ബുക്ക് ചെയ്തു',
  'Download All as 1 PDF': 'എല്ലാം ഒരു PDF-ൽ ഡൗൺലോഡ് ചെയ്യുക',
  'Share': 'പങ്കിടുക',
  'VALID · ONE TIME ENTRY': 'സാധുവാണ് · ഒറ്റ പ്രവേശനം',
  'SCAN AT ENTRY · 18+ · VALID PHOTO ID REQUIRED': 'പ്രവേശന കവാടത്തിൽ സ്കാൻ · 18+ · ഫോട്ടോ ID ആവശ്യം',
  'VIEW MY TICKETS ONLINE': 'ടിക്കറ്റ് ഓൺലൈൻ കാണുക',
  'Booking Ref': 'ബുക്കിംഗ് റഫറൻസ്',
  'YOUR TICKETS': 'നിങ്ങളുടെ ടിക്കറ്റുകൾ',

  // ── MY BOOKINGS ──
  "You haven't booked any tickets yet.": 'ഇതുവരെ ടിക്കറ്റ് ബുക്ക് ചെയ്തിട്ടില്ല.',
  'View Ticket': 'ടിക്കറ്റ് കാണുക',
  'MY BOOKINGS': 'എന്റെ ബുക്കിംഗുകൾ',
  'No bookings yet': 'ബുക്കിംഗ് ഒന്നും ഇല്ല',

  // ── PROFILE PAGE ──
  'Edit Profile': 'പ്രൊഫൈൽ എഡിറ്റ് ചെയ്യുക',
  'Phone (cannot change)': 'ഫോൺ (മാറ്റാൻ കഴിയില്ല)',
  'Save Changes': 'മാറ്റങ്ങൾ സേവ് ചെയ്യുക',
  'Saving...': 'സേവ് ചെയ്യുന്നു...',
  'Email Address': 'ഇമെയിൽ വിലാസം',
  'MY PROFILE': 'എന്റെ പ്രൊഫൈൽ',
  'RECENT ACTIVITY': 'സമീപകാല പ്രവർത്തനം',
  'Joined NightPass · Phone verified': 'NightPass-ൽ ചേർന്നു · ഫോൺ സ്ഥിരീകരിച്ചു',

  // ── ADMIN ──
  'Dashboard': 'ഡാഷ്ബോർഡ്',
  'Events': 'ഇവന്റുകൾ',
  'Bookings': 'ബുക്കിംഗുകൾ',

  // ── FOOTER / COMMON ──
  'NightPass · This is an automated email. Do not reply.': 'NightPass · ഇത് ഒരു യാന്ത്രിക ഇമെയിൽ ആണ്. മറുപടി അയക്കരുത്.',
};

// ── Reverse map for ML→EN ──
const NP_TRANS_REVERSE = {};
Object.entries(NP_TRANSLATIONS).forEach(([en, ml]) => { NP_TRANS_REVERSE[ml] = en; });

// ── Get/set language ──
function npGetLang() { return localStorage.getItem('np_lang') || 'en'; }

function npSetLang(lang) {
  localStorage.setItem('np_lang', lang);
  npApplyLang(lang);
  document.querySelectorAll('.np-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

// ── Walk all text nodes and translate ──
function npApplyLang(lang) {
  const toML  = lang === 'ml';
  const map   = toML ? NP_TRANSLATIONS : NP_TRANS_REVERSE;

  // Walk every text node in the page
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Skip scripts, styles, inputs, textareas, code
        const tag = parent.tagName;
        if (['SCRIPT','STYLE','INPUT','TEXTAREA','CODE','PRE'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip hidden elements
        if (parent.offsetParent === null && parent.tagName !== 'BODY') {
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const original = node.textContent;
    const trimmed  = original.trim();
    if (!trimmed) return;

    // Try exact match first
    if (map[trimmed]) {
      node.textContent = original.replace(trimmed, map[trimmed]);
      return;
    }

    // Try partial matches (for text mixed with dynamic values)
    let replaced = original;
    Object.entries(map).forEach(([from, to]) => {
      if (replaced.includes(from)) {
        replaced = replaced.split(from).join(to);
      }
    });
    if (replaced !== original) node.textContent = replaced;
  });

  // Translate placeholders
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    const ph = el.getAttribute('placeholder');
    if (!ph) return;
    const translated = map[ph];
    if (translated) el.setAttribute('placeholder', translated);
  });

  // Set html lang
  document.documentElement.lang = lang === 'ml' ? 'ml' : 'en';
}

// ── Auto-apply on page load ──
document.addEventListener('DOMContentLoaded', () => {
  const lang = npGetLang();
  // Only apply if Malayalam is selected (EN is default/native)
  if (lang === 'ml') npApplyLang('ml');

  document.querySelectorAll('.np-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
});
