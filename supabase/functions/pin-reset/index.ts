// "Forgot PIN?" — emails a 6-digit reset code to the username's recovery
// email (the only thing that address is ever used for).
// POST { username } → { ok: true } always (never says whether an email exists),
// or 503 when no email provider is configured (secrets: BREVO_API_KEY or
// RESEND_API_KEY, plus EMAIL_FROM). The code itself is checked by the
// reset_pin_with_code database function, straight from the app.
// Same providers as _shared/email.ts (kept inline so the function deploys on its own).
const emailConfigured = () => Boolean(Deno.env.get('RESEND_API_KEY') || Deno.env.get('BREVO_API_KEY'));
async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const from = Deno.env.get('EMAIL_FROM') ?? '';
  const resend = Deno.env.get('RESEND_API_KEY');
  const brevo = Deno.env.get('BREVO_API_KEY');
  if (resend) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    return res.ok;
  }
  if (brevo) {
    const address = from.match(/<([^>]+)>/)?.[1] ?? from;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': brevo, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: address, name: 'GroupTripIt' }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    return res.ok;
  }
  return false;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function codeEmail(username: string, code: string) {
  const digits = code.split('').join(' ');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#16151a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:20px;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#ff9f43,#ff5a2e,#ff3d7f);padding:22px 24px;color:#fff;font-weight:700;font-size:18px">✈︎ GroupTripIt</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25">Reset your PIN</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#4a4850">Here's the code for <b>@${username}</b>. Enter it in GroupTripIt, then pick a new PIN. It works for 15 minutes.</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:.3em;text-align:center;padding:16px;border-radius:14px;background:#f5f4f0">${digits}</div>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#8a8790">Resetting signs out every other phone and laptop. If you didn't ask for this, ignore it — nothing changes without the code.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = `Your GroupTripIt PIN reset code for @${username} is ${code}. It works for 15 minutes. If you didn't ask for this, ignore it.`;
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!emailConfigured()) return json({ error: "Email isn't set up yet, so codes can't be sent. Ask the person who runs GroupTripIt." }, 503);
  const { username } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || !username.trim()) return json({ error: 'Missing username' }, 400);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_pin_reset_begin`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: username }),
  });
  const r = res.ok ? await res.json() : null;
  if (r?.code && r?.email) {
    const { html, text } = codeEmail(username.trim().toLowerCase().replace(/^@/, ''), r.code);
    await sendEmail(r.email, 'Your GroupTripIt PIN reset code', html, text);
  }
  // Same answer whether or not a recovery email exists, or one was just sent.
  return json({ ok: true });
});
