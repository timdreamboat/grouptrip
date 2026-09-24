// Accounts (Supabase Auth). Organizers must sign in; invited people may join as
// a guest instead. Ways in: a passkey, Google, Apple, or a 6-digit code sent to
// any email. After signing in, people can add a passkey for next time.
//
// Uses Supabase's own sign-in library, loaded only when needed from the CDN, so
// the app still opens offline. What's known about the session is mirrored in
// localStorage so the rest of the app can check it without loading anything.
import { SUPABASE_URL, SUPABASE_KEY, SIGN_IN } from './config.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';
const MIRROR = 'grouptrip.user';
const RETURN = 'grouptrip.return';

let client;
async function sb() {
  client ??= import(LIB).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: false, storageKey: 'grouptrip.auth',
      experimental: { passkey: true },
    },
  })).catch((err) => { client = null; throw err; });
  return client;
}

const read = () => { try { return JSON.parse(localStorage.getItem(MIRROR)); } catch { return null; } };
function mirror(session) {
  const u = session?.user;
  const next = u ? { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || '' } : null;
  try { next ? localStorage.setItem(MIRROR, JSON.stringify(next)) : localStorage.removeItem(MIRROR); } catch { /* ignore */ }
  return next;
}
export const user = () => read();
export const signedIn = () => Boolean(read());

// The access token for database calls (refreshed as needed), or null.
export async function accessToken() {
  if (!signedIn()) return null;
  try {
    const { data } = await (await sb()).auth.getSession();
    if (!data.session) { mirror(null); return null; }
    return data.session.access_token;
  } catch { return null; } // offline and the library isn't cached: act signed out
}

function friendly(error) {
  const msg = error?.message || String(error || '');
  const code = error?.code || '';
  if (code === 'otp_expired' || /token has expired|invalid/i.test(msg)) return "That code didn't work. Check it, or send a new one.";
  if (/rate limit|security purposes/i.test(msg)) return 'Please wait a minute before asking for another code.';
  if (code === 'passkey_disabled') return "Passkeys aren't switched on yet.";
  if (code === 'webauthn_credential_not_found') return "This passkey isn't linked to an account. Sign in with your email and add it again.";
  if (/NotAllowedError|cancel|abort/i.test(msg + (error?.name || ''))) return 'Cancelled';
  return msg || 'Something went wrong. Please try again.';
}
const check = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };

// ---------- email code (any email) ----------
export async function sendCode(email) {
  check(await (await sb()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
}
export async function verifyCode(email, code) {
  const data = check(await (await sb()).auth.verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'email' }));
  mirror(data.session);
}

// ---------- Google / Apple (leave the page, come back signed in) ----------
export async function signInWith(provider, returnHash = location.hash) {
  try { sessionStorage.setItem(RETURN, returnHash || '#/'); } catch { /* ignore */ }
  check(await (await sb()).auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}${location.pathname}` } }));
}
// On page load: finish a Google/Apple sign-in if we just came back from one.
// Returns true when that happened.
export async function finishRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error_description')) return false;
  let back = '#/';
  try { back = sessionStorage.getItem(RETURN) || '#/'; sessionStorage.removeItem(RETURN); } catch { /* ignore */ }
  const err = q.get('error_description');
  const code = q.get('code');
  history.replaceState(null, '', `${location.pathname}${back}`);
  if (err) throw new Error(err);
  const data = check(await (await sb()).auth.exchangeCodeForSession(code));
  return Boolean(mirror(data.session));
}

// ---------- passkeys ----------
export const passkeysSupported = () => SIGN_IN.passkeys && Boolean(window.PublicKeyCredential);
export async function signInWithPasskey() {
  const data = check(await (await sb()).auth.signInWithPasskey());
  mirror(data.session);
}
export async function addPasskey() {
  return check(await (await sb()).auth.registerPasskey());
}
export async function listPasskeys() {
  return check(await (await sb()).auth.passkey.list()) ?? [];
}

export async function signOut() {
  mirror(null);
  try { await (await sb()).auth.signOut({ scope: 'local' }); } catch { /* offline: local copy is gone anyway */ }
}
