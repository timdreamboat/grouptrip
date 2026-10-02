---
name: uat
description: User-acceptance review of GroupTripIt — walks the live app as every role (organizer, guest, invited-not-joined, private-trip attendee) through every tab on phone and desktop, judges the experience against the design direction, and reports a consistency scorecard with ranked findings. Use when the owner asks for a UAT, an experience review, "go through each role", or before a release.
---

# User-acceptance review (UAT)

Walk the app the way real people will, one role at a time, and report how
it *feels*: seamless, consistent across roles and tabs, no dead ends. This
is a review, not a bug hunt — bugs you meet go in the report too, but the
point is the experience. Read `CLAUDE.md` → Design direction first:
organizer home = planning dashboard; guest home = RSVP, to-dos, balance,
next up; references Partiful/Luma, Flighty, Splitwise, Wanderlog.

## Roles and where to see them (demo data, read-only)
All demo usernames have PIN `246810`. Sign in with
`store.signedIn(await store.unlockWithPin('<username>', '246810'))` in the
preview (or through the real sheet). **Do not add, edit, delete or RSVP on
demo trips.** Anything that writes happens on a throwaway `ZZ …` trip with a
`zz-…` username, deleted afterwards (see the `qa` skill for setup/cleanup).

| Role | Use |
|---|---|
| Organizer, friends trip (in progress → Today screen) | `demo-guest` is a guest there; organizer is `@timd` — **don't** sign in as timd; organizer views come from a ZZ trip you create |
| Guest, friends trip | `demo-guest` on Lake Tahoe, or Tim's view via a ZZ trip |
| Guest who owes money / hasn't added flight | `demo-guest`-style data: Nashville (organizer `demo-marcus`) |
| Family trip (shares) | Orlando (`demo-guest`), Thanksgiving (`demo-rose` organizer) |
| Business, group privacy | Dreamforce (`demo-elena`-style), re:Invent |
| Business, PRIVATE — attendee sees only own things | Summit / Gala: any `demo-hopeN` or `demo-olivia.p` |
| Business organizer | `demo-priya` (Gala), `demo-elena` (re:Invent) |
| Invited, not joined (invite page) | Cabo invite link in `docs/HANDOFF.md` — look, don't tap a name |
| Brand-new person | Fresh preview profile: landing page → "Enter username" → create |

Share codes for every demo trip are in `docs/HANDOFF.md`.

## The walk
For **each role**, on **phone** (`resize_window` mobile) then **desktop**:
1. Landing / My trips (what's first, is the next step obvious, cards).
2. Open the trip: Home (hero, Today if in progress, readiness/RSVP, next up,
   balance, polls, photos strip, install/notifications card).
3. Calendar (day timeline, map, "Showing" picker, add/edit plan if allowed).
4. Travel (stays + flights; who's where; boarding pass cards).
5. Money (balances framed around *you*, add expense, settle up, history;
   business: reimbursables, report).
6. Group: Polls, Photos, Lists, People (pill row on phone).
7. Your settings (tap your picture / @username): name, Venmo, notifications,
   username/PIN/passkeys; organizer: Edit trip details, Good to know.
8. Dark mode once per role (`colorScheme: 'dark'`).
Take one screenshot per tab per role on phone; save the ones that show a
finding.

## What to judge (score 1–5 each, per role)
- **Orientation**: do I know where I am, what trip, who I am, what to do next?
- **Role fit**: organizer sees a planning dashboard; guest sees their own
  to-dos/balance; attendee on a private trip sees only their own things —
  and never a control they can't use (dead buttons, greyed mysteries).
- **Consistency**: same patterns everywhere — sheets for add/edit, ✎ and 🗑
  together, same toast style, same empty states, bottom bar labels match
  tab headings, wording follows the trip type (`words(trip)`), dates/times/
  money formatted the same way on every tab.
- **Flow**: fewest steps, forms pre-filled sensibly (dates default to the
  trip, end date follows start), errors shown in place, nothing requires
  a page reload or guessing.
- **Polish**: hierarchy, spacing, truncation, loading skeletons, dark mode,
  no overlap at 375px, nothing jumps.
- **Trust**: outside links say where they go ("Book on …", "Venmo @handle"),
  private things stay private, money adds up.

## Report
Write `docs/reviews/UAT-<YYYY-MM-DD>.md` (create the folder if needed) with:
1. **Verdict** in two sentences.
2. **Scorecard**: a table of roles × criteria (1–5) and a roles × tabs table
   marking ✅ fine / ⚠️ rough / ❌ broken.
3. **Findings**, ranked by how much they hurt the experience, each as:
   what a person sees → why it's confusing or inconsistent → the fix in one
   line → which roles/tabs it affects. Reference screenshots by filename
   (`docs/reviews/img/…`) — only the ones that show something.
4. **Inconsistencies across roles/tabs** as their own short list (same thing
   named or placed differently in two places).
5. **What's already good** — three to five lines, so it's kept.
6. **Not covered** (phone-only: install, push, passkeys; Google key features).
Then tell the owner the verdict and the top three findings in plain English
and ask which to fix; link the report. Don't fix things during the walk —
note them, finish the walk, then propose. Clean up any ZZ data.
