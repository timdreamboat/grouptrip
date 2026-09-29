// Passkeys (Face ID / fingerprint / phone passcode) for usernames — optional,
// on top of the username's PIN (v13).
//
// POST { action: 'register-options', username, deviceKey }         → { challengeId, options }
// POST { action: 'register-verify', username, deviceKey, challengeId, response, device } → { ok }
//   Adding a passkey needs this device's key (it already entered the PIN).
// POST { action: 'login-options', username? }                       → { challengeId, options }
// POST { action: 'login-verify', challengeId, response }            → { username, deviceKey }
//   No username = the phone offers any GroupTrip passkey it has.
//
// Passkeys are tied to the site's address (rpID), so only our own origins are
// allowed. The service-role key never leaves this function.
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@13';
import { isoBase64URL } from 'npm:@simplewebauthn/server@13/helpers';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS: Record<string, string> = {
  'https://timdreamboat.github.io': 'timdreamboat.github.io',
  'http://localhost:8080': 'localhost',
  'http://localhost:8081': 'localhost',
};
const CHALLENGE_MINUTES = 5;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class Refused extends Error {}

// Database access with the service key (tables are locked to everyone else).
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || 'Database error');
  return body;
}
const rpc = (fn: string, args: Record<string, unknown>) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const q = encodeURIComponent;

const cleanUsername = (u: unknown) => String(u ?? '').trim().toLowerCase().replace(/^@/, '');

async function saveChallenge(kind: string, challenge: string, username: string | null) {
  await db(`passkey_challenges?created_at=lt.${q(new Date(Date.now() - CHALLENGE_MINUTES * 60000).toISOString())}`, { method: 'DELETE' });
  const [row] = await db('passkey_challenges', { method: 'POST', body: JSON.stringify({ kind, challenge, username }) });
  return row.id as string;
}
// Each challenge works once, for a few minutes.
async function takeChallenge(id: string, kind: string) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new Refused('That took too long — please try again');
  const [row] = await db(`passkey_challenges?id=eq.${q(id)}&kind=eq.${kind}`, { method: 'DELETE' });
  if (!row || Date.now() - new Date(row.created_at).getTime() > CHALLENGE_MINUTES * 60000) {
    throw new Refused('That took too long — please try again');
  }
  return row as { challenge: string; username: string | null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const origin = req.headers.get('Origin') ?? '';
  const rpID = ORIGINS[origin];
  if (!rpID) return json({ error: 'Passkeys only work on the GroupTrip site' }, 403);

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'register-options' || action === 'register-verify') {
      const username = cleanUsername(body.username);
      if (!(await rpc('_device_ok', { u: username, k: String(body.deviceKey ?? '') }))) {
        throw new Refused('Enter your PIN on this device first');
      }
      if (action === 'register-options') {
        const existing = await db(`passkeys?username=eq.${q(username)}&select=credential_id,transports`);
        const options = await generateRegistrationOptions({
          rpName: 'GroupTrip', rpID, userName: username, userDisplayName: `@${username}`,
          attestationType: 'none',
          excludeCredentials: existing.map((c: { credential_id: string; transports: string[] }) =>
            ({ id: c.credential_id, transports: c.transports })),
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        });
        return json({ challengeId: await saveChallenge('register', options.challenge, username), options });
      }
      const ch = await takeChallenge(body.challengeId, 'register');
      if (ch.username !== username) throw new Refused('That took too long — please try again');
      const v = await verifyRegistrationResponse({
        response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!v.verified || !v.registrationInfo) throw new Refused("That passkey didn't check out — please try again");
      const { credential } = v.registrationInfo;
      await db('passkeys', {
        method: 'POST',
        body: JSON.stringify({
          username, credential_id: credential.id, public_key: isoBase64URL.fromBuffer(credential.publicKey),
          counter: credential.counter, transports: credential.transports ?? [],
          device: String(body.device ?? '').slice(0, 40) || null,
        }),
      });
      return json({ ok: true });
    }

    if (action === 'login-options') {
      const username = body.username ? cleanUsername(body.username) : null;
      const allow = username ? await db(`passkeys?username=eq.${q(username)}&select=credential_id,transports`) : [];
      if (username && !allow.length) throw new Refused(`@${username} doesn't have a passkey yet — use the PIN`);
      const options = await generateAuthenticationOptions({
        rpID, userVerification: 'required',
        allowCredentials: allow.map((c: { credential_id: string; transports: string[] }) =>
          ({ id: c.credential_id, transports: c.transports })),
      });
      return json({ challengeId: await saveChallenge('login', options.challenge, username), options });
    }

    if (action === 'login-verify') {
      const ch = await takeChallenge(body.challengeId, 'login');
      const credId = String(body.response?.id ?? '');
      const [pk] = await db(`passkeys?credential_id=eq.${q(credId)}&select=*`);
      if (!pk) throw new Refused("This passkey isn't linked to a GroupTrip username any more. Use your PIN.");
      if (ch.username && ch.username !== pk.username) throw new Refused("That passkey is for a different username");
      const v = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: pk.credential_id, publicKey: isoBase64URL.toBuffer(pk.public_key), counter: Number(pk.counter), transports: pk.transports },
      });
      if (!v.verified) throw new Refused("That passkey didn't check out — please try again");
      await db(`passkeys?id=eq.${q(pk.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }),
      });
      const deviceKey = await rpc('_issue_device', { u: pk.username, p_via: 'passkey' });
      return json({ username: pk.username, deviceKey });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    if (err instanceof Refused) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: "Passkey sign-in didn't work — please try again or use your PIN" }, 500);
  }
});
