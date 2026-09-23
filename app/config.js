// Supabase connection for shared trips. The public (anon) key is safe to put
// here — the database only allows access through the share-link functions.
// Everything the app shows comes from this one database.
export const SUPABASE_URL = 'https://fnedxcktddvioxseogng.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZWR4Y2t0ZGR2aW94c2VvZ25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMDQ0MTYsImV4cCI6MjEwNTY4MDQxNn0.kVwfVuX0nW9ZeUasXnQztVbxoE8uSl-Gu1aU7vp82qY';

// Google Maps (optional). With a browser key (restricted to this site in
// Google Cloud), the Calendar map shows every plan as a numbered pin and
// Google finds the places. Without one, it uses Google's free embedded map,
// one place at a time. Map ID: create one under Google Maps Platform →
// Map management (free); 'DEMO_MAP_ID' works for testing.
export const GOOGLE_MAPS_KEY = '';
export const GOOGLE_MAP_ID = 'DEMO_MAP_ID';

// Public half of the key used to send phone/desktop notifications (the
// private half lives only in the database's server-only settings).
export const PUSH_PUBLIC_KEY = 'BLvMhsoo5jSQOMMxx6LEatOOScH-mChqPU64c0f0HjXv-tiaF50Kz3j7bgockfzWZo2fNjj8tvY2cNrtJ9nseyw';
