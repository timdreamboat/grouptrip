// Builds the URLs for partner sites we embed or link to. Tested embeddability
// is recorded in docs/API-RESEARCH.md — only use embed URLs from that list.

// Ticket airline codes (IATA, "UA") → codes flight trackers use (ICAO, "UAL").
const AIRLINES = {
  AA: 'AAL', UA: 'UAL', DL: 'DAL', WN: 'SWA', AS: 'ASA', B6: 'JBU', NK: 'NKS', F9: 'FFT',
  G4: 'AAY', HA: 'HAL', SY: 'SCX', MX: 'MXY', XP: 'CXP', QX: 'QXE', OO: 'SKW', YX: 'RPA',
  MQ: 'ENY', '9E': 'EDV', OH: 'JIA', YV: 'ASH', PT: 'PDT', ZW: 'AWI', C5: 'UCA', G7: 'GJS',
  AC: 'ACA', WS: 'WJA', PD: 'POE', TS: 'TSC', AM: 'AMX', Y4: 'VOI', VB: 'VIV',
  BA: 'BAW', VS: 'VIR', AF: 'AFR', KL: 'KLM', LH: 'DLH', LX: 'SWR', OS: 'AUA', SN: 'BEL',
  IB: 'IBE', EI: 'EIN', AY: 'FIN', SK: 'SAS', TP: 'TAP', AZ: 'ITY', U2: 'EZY', FR: 'RYR',
  EK: 'UAE', QR: 'QTR', EY: 'ETD', TK: 'THY', QF: 'QFA', NZ: 'ANZ', SQ: 'SIA', CX: 'CPA',
  JL: 'JAL', NH: 'ANA', KE: 'KAL', OZ: 'AAR', LA: 'LAN', AV: 'AVA', CM: 'CMP',
};

// "UA 1234" / "ua1234" / "UAL1234" → { iata: "UA1234", callsign: "UAL1234" }
export function parseFlight(text) {
  const m = String(text).toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9]{2,3}?)(\d{1,4}[A-Z]?)$/);
  if (!m) return null;
  const [, code, num] = m;
  if (code.length === 3) return { iata: code + num, callsign: code + num };
  return { iata: code + num, callsign: (AIRLINES[code] ?? code) + num };
}

// Live flight map (embeds). Shows the plane only while it's in the air.
export const liveFlightMap = (callsign) => `https://globe.adsb.fi/?callsign=${encodeURIComponent(callsign)}`;

// FlightAware status page (blocks embedding — open in a new tab).
export const flightAwareLink = (callsign) => `https://www.flightaware.com/live/flight/${encodeURIComponent(callsign)}`;

// Google Maps search embed (no key needed).
export const mapEmbed = (query) => `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;

// OpenTable's own booking screen (embeds), pre-filled with party size and time.
export function openTableEmbed(rid, { covers, day, time } = {}) {
  const p = new URLSearchParams({ rid, restref: rid, lang: 'en-US' });
  if (covers) p.set('covers', covers);
  if (day) p.set('datetime', `${day}T${time || '19:00'}`);
  return `https://www.opentable.com/restref/client/?${p}`;
}

// Pulls the OpenTable restaurant ID out of a pasted link or number.
// Links like opentable.com/r/some-name don't contain it — those stay a plain link.
export function openTableRid(text) {
  const s = String(text).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/[?&]rid=(\d+)/) || s.match(/opentable\.[a-z.]+\/restaurant\/profile\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export const openTableSearch = (destination) =>
  `https://www.opentable.com/s?term=${encodeURIComponent(destination || '')}`;

// Venmo pay link (opens their app or a new tab). With the recipient's
// username it goes straight to them; without, Venmo asks who to pay.
export function venmoLink(amountCents, note, recipient) {
  const p = new URLSearchParams({ txn: 'pay', amount: (amountCents / 100).toFixed(2), note });
  if (recipient) p.set('recipients', recipient);
  return `https://venmo.com/?${p}`;
}
