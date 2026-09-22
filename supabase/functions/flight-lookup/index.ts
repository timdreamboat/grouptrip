// Looks up a flight's scheduled departure/arrival from AeroDataBox.
// Owner-approved exception to the embed-only rule (see CLAUDE.md).
// Secret needed: AERODATABOX_KEY (a RapidAPI key subscribed to AeroDataBox).
//
// GET /functions/v1/flight-lookup?number=UA1234&date=2026-10-09
// → { depAirport, depTime, arrAirport, arrTime, arrDate }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// "2026-10-09 08:10-07:00" → { date: "2026-10-09", time: "08:10" }
function splitLocal(s?: string) {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const number = (url.searchParams.get('number') ?? '').toUpperCase().replace(/\s+/g, '');
  const date = url.searchParams.get('date') ?? '';
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Need a flight number like UA1234 and a date' }, 400);
  }

  const key = Deno.env.get('AERODATABOX_KEY');
  if (!key) return json({ error: 'Flight lookup is not set up yet' }, 503);

  const res = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${number}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`,
    { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } },
  );
  if (res.status === 204 || res.status === 404) return json({ error: 'No flight found for that number and date' }, 404);
  if (!res.ok) return json({ error: `Flight lookup failed (${res.status})` }, 502);

  const flights = await res.json();
  const f = Array.isArray(flights) ? flights[0] : null;
  if (!f) return json({ error: 'No flight found for that number and date' }, 404);

  const dep = splitLocal(f.departure?.scheduledTime?.local);
  const arr = splitLocal(f.arrival?.scheduledTime?.local);
  return json({
    depAirport: f.departure?.airport?.iata ?? '',
    depTime: dep.time,
    arrAirport: f.arrival?.airport?.iata ?? '',
    arrTime: arr.time,
    arrDate: arr.date && arr.date !== dep.date ? arr.date : '',
  });
});
