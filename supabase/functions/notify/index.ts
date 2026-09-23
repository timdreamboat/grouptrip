// Delivers queued notifications (the `notifications` table) as phone/desktop
// push notifications, plus email for people who turned that on.
// Called by database triggers and every 15 minutes by pg_cron, with a shared
// secret header (so it's deployed with verify_jwt off).
import webpush from 'npm:web-push@3.6.7';
import { sendEmail, emailHtml, emailConfigured } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type Item = {
  id: string; title: string; body: string | null; url: string; tripName: string;
  subs: { endpoint: string; p256dh: string; auth: string }[];
  emails: { email: string; name: string; link: string }[];
};

Deno.serve(async (req) => {
  const secret = await rpc('app_secret', { p_key: 'notify_secret' });
  if (!secret || req.headers.get('x-notify-secret') !== secret) return new Response('Forbidden', { status: 403 });

  webpush.setVapidDetails('https://timdreamboat.github.io/grouptrip/',
    await rpc('app_secret', { p_key: 'vapid_public' }), await rpc('app_secret', { p_key: 'vapid_private' }));

  let pushed = 0, emailed = 0;
  const dead: string[] = [];
  for (let round = 0; round < 5; round++) {
    const items: Item[] = await rpc('claim_notifications');
    if (!items.length) break;
    for (const n of items) {
      const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: n.url, tag: n.id });
      await Promise.all(n.subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
          pushed++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint); // the device unsubscribed
        }
      }));
      if (emailConfigured()) {
        for (const e of n.emails) {
          const ok = await sendEmail(e.email, n.title,
            emailHtml({ heading: n.title, body: n.body ?? '', button: `Open ${n.tripName}`, url: e.link,
              footer: `You're getting this because you turned on email updates in GroupTrip. The button signs you in as ${e.name} — don't forward this email.` }),
            `${n.title}\n\n${n.body ?? ''}\n\nOpen ${n.tripName}: ${e.link}`).catch(() => false);
          if (ok) emailed++;
        }
      }
    }
  }
  if (dead.length) await rpc('drop_push_endpoints', { p_endpoints: dead });
  return Response.json({ pushed, emailed, removed: dead.length });
});
