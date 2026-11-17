// "Delete my username and data".
// POST { action: 'delete', username, pin } → { ok, trips, seats } or { ok:false, error }
// The database function checks the PIN and removes the person's data (see
// _delete_account in schema.sql); this function then deletes their files from
// storage: the whole folder of each trip they organized, and their own photos
// and receipts on trips they had joined. The service-role key never leaves here.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'trip-photos';
const auth = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const removeFiles = (paths: string[]) => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
  method: 'DELETE', headers: auth, body: JSON.stringify({ prefixes: paths }),
});

async function purgeFolder(folder: string) {
  for (let round = 0; round < 50; round++) { // 5,000 files max; stops if a delete fails
    const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: auth, body: JSON.stringify({ prefix: `${folder}/`, limit: 100 }),
    }).then((r) => r.json());
    if (!Array.isArray(list) || !list.length) break;
    const res = await removeFiles(list.map((f: { name: string }) => `${folder}/${f.name}`));
    if (!res.ok) break;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { action, username, pin } = await req.json().catch(() => ({}));
  if (action !== 'delete' || typeof username !== 'string' || typeof pin !== 'string') return json({ error: 'Missing details' }, 400);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_delete_account`, {
    method: 'POST', headers: auth, body: JSON.stringify({ p_username: username, p_pin: pin }),
  });
  const r = await res.json().catch(() => null);
  if (!res.ok) return json({ ok: false, error: r?.message || "Couldn't delete right now — please try again" }, 400);
  if (!r?.ok) return json({ ok: false, error: r?.error || 'Wrong PIN' });

  // The data is gone; now the files. Best effort — nothing lists a leftover
  // file any more (only someone holding its direct link could still open it),
  // and a failure here must not look like the deletion didn't happen.
  try {
    for (const folder of (r.folders ?? []) as string[]) await purgeFolder(folder);
    const files = (r.files ?? []) as string[];
    for (let i = 0; i < files.length; i += 100) await removeFiles(files.slice(i, i + 100));
  } catch (err) { console.error('storage cleanup failed', err); }

  return json({ ok: true, trips: r.trips, seats: r.seats });
});
