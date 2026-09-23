// "Email me my link" — sends a person their private sign-in link for a trip.
// POST { action: 'send', code, token }     from the You screen (their saved email)
// POST { action: 'recover', code, email }  from the invite page, when locked out
// Recover always answers ok, so it never reveals who is on a trip.
// The link's address comes from the server (app_secrets.site_url), never the request.
import { sendEmail, emailHtml, emailConfigured } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { action, code, token, email } = await req.json().catch(() => ({}));
  if (!emailConfigured()) return json({ error: "Email isn't set up yet — ask the organizer." }, 503);
  if (typeof code !== 'string' || (action === 'send' ? typeof token !== 'string' : typeof email !== 'string')) {
    return json({ error: 'Missing details' }, 400);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/link_request`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code, p_token: action === 'send' ? token : null, p_email: action === 'send' ? null : email }),
  });
  const who = res.ok ? await res.json() : null;

  if (who) {
    await sendEmail(who.email, `Your link to ${who.tripName}`,
      emailHtml({
        heading: `Here's your link to ${who.tripName}`,
        body: `Open it on any phone or computer to get back into the trip as ${who.name}.`,
        button: `Open ${who.tripName}`, url: who.link,
        footer: "This link signs you in as you — keep it private and don't forward this email. If you didn't ask for it, you can ignore it.",
      }),
      `Your link to ${who.tripName}: ${who.link}\n\nIt signs you in as ${who.name} — keep it private.`);
  } else if (action === 'send') {
    return json({ error: 'Add your email first, or wait a couple of minutes before asking again.' }, 400);
  }
  return json({ ok: true });
});
