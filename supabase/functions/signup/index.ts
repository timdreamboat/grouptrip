// Retired (2026-09-23): sign-up goes through Supabase Auth directly
// (email code, Google/Apple, passkeys). Kept as a stub so old calls fail cleanly.
Deno.serve(() => new Response(JSON.stringify({ error: 'Sign-up has moved — please refresh the page.' }), {
  status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
}));
