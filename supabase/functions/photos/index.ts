// Photo album uploads and deletes.
//
// POST { action: 'sign', code, token, count }  → [{ path, thumbPath, uploadUrl, thumbUploadUrl }]
//   Checks the person is on the trip, then issues one-time signed upload URLs
//   in the trip's folder of the public 'trip-photos' bucket. The browser
//   uploads the files itself, then records them with the add_photo function.
// POST { action: 'delete', code, token, id }
//   remove_photo checks who may delete (uploader or organizer) and returns the
//   file paths; this function then deletes the files.
// POST { action: 'purge', code, token }
//   Organizer only: deletes every photo file of the trip (before deleting it).
//
// The service-role key never leaves this function.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'trip-photos';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Call a share-code function as the person: their seat token plus their
// signed-in session (passed through), so an account's seat only works for them.
async function rpc(caller: string, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: caller || `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || 'Not allowed');
  return body;
}

async function signUpload(path: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || 'Could not prepare upload');
  return `${SUPABASE_URL}/storage/v1${body.url}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const caller = req.headers.get('Authorization') ?? '';
    const { action, code, token, count, id } = await req.json();

    if (action === 'sign') {
      const folder = await rpc(caller, 'photo_folder', { p_code: code, p_token: token });
      const n = Math.min(Math.max(Number(count) || 1, 1), 20);
      const out = [];
      for (let i = 0; i < n; i++) {
        const name = crypto.randomUUID();
        const path = `${folder}/${name}.jpg`;
        const thumbPath = `${folder}/${name}_thumb.jpg`;
        out.push({ path, thumbPath, uploadUrl: await signUpload(path), thumbUploadUrl: await signUpload(thumbPath) });
      }
      return json(out);
    }

    if (action === 'delete') {
      const files = await rpc(caller, 'remove_photo', { p_code: code, p_token: token, p_photo: id });
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [files.path, files.thumbPath] }),
      });
      return json({ ok: true });
    }

    if (action === 'purge') {
      const folder = await rpc(caller, 'photo_folder_to_purge', { p_code: code, p_token: token });
      const auth = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
      for (let round = 0; round < 50; round++) { // 5,000 files max; stops if a delete fails
        const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
          method: 'POST', headers: auth, body: JSON.stringify({ prefix: `${folder}/`, limit: 100 }),
        }).then((r) => r.json());
        if (!Array.isArray(list) || !list.length) break;
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
          method: 'DELETE', headers: auth, body: JSON.stringify({ prefixes: list.map((f: { name: string }) => `${folder}/${f.name}`) }),
        });
      }
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 403);
  }
});
