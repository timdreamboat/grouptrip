// Passkeys (Face ID / fingerprint / phone passcode) — optional, on top of the
// username's PIN. The `passkey` Edge Function makes the challenges and checks
// the answers; the face or fingerprint never leaves the device.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const passkeySupported = () => Boolean(window.PublicKeyCredential && navigator.credentials?.create);
// Built-in Face ID / Touch ID / fingerprint / Windows Hello on this device.
export async function passkeyOnThisDevice() {
  if (!passkeySupported()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const withIds = (list = []) => list.map((c) => ({ ...c, id: dec(c.id) }));

async function call(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/passkey`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const r = await res.json().catch(() => null);
  if (!res.ok) throw new Error(r?.error || "Passkeys aren't working right now — use your PIN");
  return r;
}

// The person closed the Face ID / passkey prompt: not an error worth showing.
export const cancelled = (err) => err?.name === 'NotAllowedError' || err?.name === 'AbortError';

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'This device';
}

// Save a passkey for the username (this device already has its key).
export async function createPasskey(username, deviceKey) {
  const { challengeId, options } = await call({ action: 'register-options', username, deviceKey });
  const cred = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: dec(options.challenge),
      user: { ...options.user, id: dec(options.user.id) },
      excludeCredentials: withIds(options.excludeCredentials),
    },
  });
  await call({
    action: 'register-verify', username, deviceKey, challengeId, device: deviceLabel(),
    response: {
      id: cred.id, rawId: enc(cred.rawId), type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        clientDataJSON: enc(cred.response.clientDataJSON),
        attestationObject: enc(cred.response.attestationObject),
        transports: cred.response.getTransports?.() ?? [],
      },
    },
  });
}

// Sign in with a passkey (for one username, or any GroupTripIt passkey on the
// device when none is given). Resolves { username, deviceKey }.
export async function usePasskey(username = null) {
  const { challengeId, options } = await call({ action: 'login-options', username });
  const cred = await navigator.credentials.get({
    publicKey: { ...options, challenge: dec(options.challenge), allowCredentials: withIds(options.allowCredentials) },
  });
  return call({
    action: 'login-verify', challengeId,
    response: {
      id: cred.id, rawId: enc(cred.rawId), type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        clientDataJSON: enc(cred.response.clientDataJSON),
        authenticatorData: enc(cred.response.authenticatorData),
        signature: enc(cred.response.signature),
        userHandle: cred.response.userHandle ? enc(cred.response.userHandle) : undefined,
      },
    },
  });
}
