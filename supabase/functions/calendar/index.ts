// Subscribable calendar feed for a trip (iCalendar / .ics).
// GET /functions/v1/calendar?trip=<share_code>
//
// Calendar apps (Apple, Google, Outlook) poll this URL, so it can't send an
// auth header — it's deployed with verify_jwt off. Access is the same as the
// invite link: knowing the share code. Only trip-wide data is included
// (never private packing lists, tokens or money).
//
// Times are "floating" (no time zone): flight times are local to each
// airport and plans are local to the destination, which is what people expect
// to see when they're there.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type Trip = {
  id: string; name: string; destination?: string; startDate?: string; endDate?: string;
  members: { id: string; name: string }[];
  flights: { id: string; memberId: string; flightNumber: string; date: string; depAirport?: string; depTime?: string; arrAirport?: string; arrTime?: string; arrDate?: string }[];
  itinerary: { id: string; day?: string; time?: string; title: string; notes?: string; place?: string }[];
  stays: { id: string; name: string; address?: string; checkIn?: string; checkInTime?: string; checkOut?: string; checkOutTime?: string; confirmation?: string; notes?: string }[];
};

const esc = (s?: string | null) => (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (iso: string) => iso.replaceAll('-', '');
const at = (iso: string, hhmm: string) => `${day(iso)}T${hhmm.replace(':', '')}00`;
function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function plusMinutes(iso: string, hhmm: string, mins: number) {
  const d = new Date(`${iso}T${hhmm}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return `${day(d.toISOString().slice(0, 10))}T${d.toISOString().slice(11, 16).replace(':', '')}00`;
}

// Lines longer than 75 octets must be folded.
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function event(uid: string, fields: Record<string, string | undefined>) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@grouptrip`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  for (const [k, v] of Object.entries(fields)) if (v) lines.push(`${k}${k.includes(';') || k.endsWith(':') ? '' : ':'}${v}`);
  lines.push('END:VEVENT');
  return lines;
}

function build(trip: Trip) {
  const who = (id: string) => trip.members.find((m) => m.id === id)?.name ?? 'Someone';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GroupTrip//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(trip.name)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  if (trip.startDate) {
    lines.push(...event(`trip-${trip.id}`, {
      'DTSTART;VALUE=DATE:': day(trip.startDate),
      'DTEND;VALUE=DATE:': day(nextDay(trip.endDate || trip.startDate)),
      SUMMARY: esc(`✈︎ ${trip.name}`), LOCATION: esc(trip.destination), TRANSP: 'TRANSPARENT',
    }));
  }

  for (const f of trip.flights) {
    const route = [f.depAirport, f.arrAirport].filter(Boolean).join(' → ');
    const summary = esc(`${who(f.memberId)} · ${f.flightNumber}${route ? ` ${route}` : ''}`);
    const desc = esc(`Times are local to each airport.\nTrack it: https://www.flightaware.com/live/flight/${f.flightNumber}`);
    if (f.depTime) {
      const endDate = f.arrDate || f.date;
      let end = f.arrTime ? at(endDate, f.arrTime) : plusMinutes(f.date, f.depTime, 120);
      if (end <= at(f.date, f.depTime)) end = plusMinutes(f.date, f.depTime, 60); // time zones can make "lands" look earlier
      lines.push(...event(`flight-${f.id}`, { 'DTSTART:': at(f.date, f.depTime), 'DTEND:': end, SUMMARY: summary, LOCATION: esc(f.depAirport), DESCRIPTION: desc }));
    } else {
      lines.push(...event(`flight-${f.id}`, { 'DTSTART;VALUE=DATE:': day(f.date), 'DTEND;VALUE=DATE:': day(nextDay(f.date)), SUMMARY: summary, DESCRIPTION: desc, TRANSP: 'TRANSPARENT' }));
    }
  }

  for (const s of trip.stays) {
    const desc = esc([s.confirmation && `Confirmation: ${s.confirmation}`, s.notes].filter(Boolean).join('\n'));
    for (const [kind, d, t] of [['Check in', s.checkIn, s.checkInTime], ['Check out', s.checkOut, s.checkOutTime]] as const) {
      if (!d) continue;
      const fields = t
        ? { 'DTSTART:': at(d, t), 'DTEND:': plusMinutes(d, t, 30) }
        : { 'DTSTART;VALUE=DATE:': day(d), 'DTEND;VALUE=DATE:': day(nextDay(d)), TRANSP: 'TRANSPARENT' };
      lines.push(...event(`stay-${s.id}-${kind === 'Check in' ? 'in' : 'out'}`, {
        ...fields, SUMMARY: esc(`${kind} · ${s.name}`), LOCATION: esc(s.address), DESCRIPTION: desc,
      }));
    }
  }

  for (const i of trip.itinerary) {
    if (!i.day) continue;
    const fields = i.time
      ? { 'DTSTART:': at(i.day, i.time), 'DTEND:': plusMinutes(i.day, i.time, 90) }
      : { 'DTSTART;VALUE=DATE:': day(i.day), 'DTEND;VALUE=DATE:': day(nextDay(i.day)), TRANSP: 'TRANSPARENT' };
    lines.push(...event(`plan-${i.id}`, { ...fields, SUMMARY: esc(i.title), LOCATION: esc(i.place), DESCRIPTION: esc(i.notes) }));
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

Deno.serve(async (req) => {
  const code = new URL(req.url).searchParams.get('trip') ?? '';
  if (!/^[0-9a-f]{32}$/.test(code)) return new Response('Missing or invalid trip', { status: 400 });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_trip`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code }),
  });
  if (!res.ok) return new Response('Trip not found', { status: 404 });
  const trip = await res.json() as Trip;

  return new Response(build(trip), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="grouptrip.ics"`,
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
