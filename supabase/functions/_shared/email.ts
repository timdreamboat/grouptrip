// Sends one email through whichever provider is configured (function secrets):
//   RESEND_API_KEY  — Resend (needs a verified domain to email other people)
//   BREVO_API_KEY   — Brevo (a single verified sender address is enough)
//   EMAIL_FROM      — the sender, e.g. "GroupTrip <trips@example.com>" or "you@gmail.com"
// Returns false when no provider is set up.

export const emailConfigured = () => Boolean(Deno.env.get('RESEND_API_KEY') || Deno.env.get('BREVO_API_KEY'));

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const from = Deno.env.get('EMAIL_FROM') ?? '';
  const resend = Deno.env.get('RESEND_API_KEY');
  const brevo = Deno.env.get('BREVO_API_KEY');
  if (resend) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    return res.ok;
  }
  if (brevo) {
    const address = from.match(/<([^>]+)>/)?.[1] ?? from;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevo, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: address, name: 'GroupTrip' }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    return res.ok;
  }
  return false;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// A simple, good-looking email that works in every mail app.
export function emailHtml({ heading, body, button, url, footer }: { heading: string; body: string; button: string; url: string; footer: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#16151a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:20px;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#ff9f43,#ff5a2e,#ff3d7f);padding:22px 24px;color:#fff;font-weight:700;font-size:18px">✈︎ GroupTrip</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25">${esc(heading)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4a4850">${esc(body)}</p>
        <a href="${esc(url)}" style="display:inline-block;background:#16151a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">${esc(button)}</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#8a8790">${esc(footer)}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
