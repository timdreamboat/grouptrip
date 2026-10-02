---
name: qa
description: QA pass for GroupTripIt after a change — run it before telling the owner something is done. Finds what changed, exercises it in the preview browser on a phone-sized and a desktop screen as each affected role, checks the server side, cleans up its test data, and reports plain-English results with screenshots. Use after any edit to app/ or supabase/, or when the owner says "check", "test" or "QA".
---

# QA a GroupTripIt change

The owner is non-technical and should never have to ask "did you test it?".
Run this after every change, before reporting. Report outcomes in plain
English, with proof (a screenshot or a concrete checked value), and say
plainly if anything failed or was skipped.

## 1. What changed
- `git pull` first (other sessions work in this repo), then `git status` and
  `git diff` (or `git diff <last QA'd commit>`) to list changed files.
- Map files to screens with `CLAUDE.md` → Architecture (`views/<name>.js` =
  one screen; `store.js` = every database call; `supabase/schema.sql` =
  server functions; `sw.js` = offline file list; `style.css` = design system).
- Write down, before testing: which flows changed, which roles see them
  (organizer / guest / invited / private-trip attendee), and what "correct"
  looks like for each.

## 2. Set up
- Preview: `preview_start` with `app-8081` (another session usually holds
  8080; 8081 is an allowed passkey origin). Never run servers with Bash.
- Fresh modules: `for (f of changedFiles) await fetch(f, {cache:'reload'})`
  then reload the page. A page already running keeps old modules. The
  preview browser caches modules and cannot run service workers, so
  install / offline / push are phone-only tests — say so instead of faking.
- Test identity: create a throwaway username, never a real or demo one:
  `const store = await import('/store.js');
   await store.signedIn(await store.createPin('zz-<thing>', '<6 digits, not easy>'));`
  For a second person, `store.forgetUsername()` then sign in again (or use a
  second tab). Demo usernames (`demo-guest`, `demo-marcus`…) all have PIN
  `246810` — use them **read-only** to look at real-looking data.
- Test data: trips named `ZZ …` only, created through `store.createTrip(...)`.
  Never add, edit or delete anything on the demo trips or `@timd`'s trips.
- Phone first: `resize_window` preset `mobile`, then also check `desktop`.
  Reset to `desktop` when done. Check dark mode if anything visual changed
  (`colorScheme`).

## 3. Exercise the change
For each changed flow, as each affected role:
- Happy path end to end, through the real screens (tap/type), not just the
  store function. Confirm the result where the person would see it (card,
  list, toast) AND on the server (`store.getTrip(code)` or SQL).
- Edit path: every add form doubles as its edit form — open the saved item
  with ✎ and save again; nothing should be lost.
- Wrong input: empty required fields, bad links, dates out of order, a
  PIN that's too easy. Errors must show where the person is looking, in
  plain English, not as a stuck button or a console-only failure.
- Permissions: a guest must not see organizer-only controls (edit/delete
  trip, itinerary, people); a server call as the wrong role must be refused.
  On private business trips, an attendee sees only their own things.
- Console: `read_console_messages onlyErrors` after the run. 400s you
  caused on purpose (wrong PIN, refused call) are fine — list them.
- Wording follows the trip type (`words(trip)` in `views/common.js`); no
  hard-coded "crew"/"Calendar"/"Money" where the type changes it.
- Money: balances still sum to exactly zero; amounts stay integer cents.
- Offline list: a new `app/` file must be in `SHELL` in `sw.js`, and the
  `CACHE` name bumped when files were added.
- Schema change: migration applied AND appended to `supabase/schema.sql`;
  internal `_functions` revoked from `anon`; try the new function from the
  API with a wrong/missing token or key and confirm it's refused.

## 4. Gotchas in this preview
- Suggestion dropdowns (`suggest()` in ui.js) pick on **pointerdown**:
  `el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))`, not
  `.click()`.
- Re-query form elements after a step change — the create flow redraws.
- Typing into a sheet right after it opens can land before the auto-focus:
  click the field first.
- Reloading a stylesheet by changing its `href` also breaks the Google Fonts
  link (harmless console error) — don't count it as a bug.
- Passkeys: do not tap "Set up passkey" in the preview — it opens a real
  Touch ID prompt on the owner's Mac. Passkey server logic is tested with
  the software-authenticator script pattern in `docs/HANDOFF.md`.
- Screenshots fail while the browser pane is hidden; use `read_page` /
  `javascript_tool` then.

## 5. Clean up
- Delete every `ZZ …` trip (`store.deleteTrip(code)` or
  `delete from trips where name like 'ZZ %'`) and every `zz-%` row in
  `usernames` (cascades devices and passkeys). Confirm the demo trip count
  is unchanged.
- `localStorage.clear()` in the preview, `resize_window` back to `desktop`,
  `preview_stop` the server.

## 6. Report
Two to six sentences, plain English, for the owner:
- What was checked, as whom, on which screens; the key proof (screenshot of
  the changed screen on a phone).
- Anything that failed (with what happened), anything that couldn't be
  tested here (phone-only) and how the owner can test it.
- Bugs found while testing that you fixed, in one line each.
Then update `docs/HANDOFF.md` if the change adds a lesson or a decision.
