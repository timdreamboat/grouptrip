---
name: gigtrip-uat
description: User-acceptance walkthrough of the GigTrip mock as each kind of user (management, tour manager, artist, band & crew, venue), on a phone, to find what is confusing, missing, out of place or exposed to the wrong person — and say what to adjust. Use it whenever the owner asks to "go through each role", "user test", "see what needs adjusting", "is this seamless", "what would a manager/artist/crew think", or after a round of changes before showing GigTrip to real testers. Also use it to turn feedback from real user testing into a prioritised fix list. Not for "does it still work" (that is gigtrip-qa) and not for GroupTrip, a separate app.
---

# GigTrip UAT — is it right for each person?

QA asks whether the app works. This asks whether a real tour manager, artist
or venue would find it obvious, complete and trustworthy. You do that by
becoming each of them for a few minutes, doing their real tasks, and writing
down every moment of friction as something concrete to change.

Read `references/personas.md` first: it says who each role is, what they come
to do, and what "seamless" means for them. Everything below assumes it.

## How to run a pass

1. Start the local server (`preview_start` with name `gigtrip`, from
   `.claude/launch.json`) and open `http://localhost:8082/gigtrip/mock/index.html`
   — use this, not the `file://` preview, so taps on tabs and links navigate
   like the real site. `resize_window` preset `mobile`, dark mode on
   (`setTheme('dark')`) — phones in the dark are the hard case; check light
   mode only where something looks off. Reset to `desktop` and stop the
   server at the end. Screenshots can lag a tap by a frame: add a short
   `wait` before each one, and trust `get_page_text` for what is on screen.
2. Fresh sample data: in `javascript_tool`, `DB = seed(); route();`.
3. For each persona, in this order — Juniper (artist), Nico (crew), Greg
   (venue), Dana (tour manager), Rae (management): set `S.role`, go to the
   logo's home, and do each of their "comes to" tasks the way they would: by
   tapping what's on screen (`find` + `computer` click, or `data-act`
   buttons), not by calling functions. Take a screenshot at each task's end.
   Read the page text (`get_page_text`) to catch words they wouldn't use.
4. At every step ask the four questions:
   - **Would they know what to tap?** (label, placement, is the main action
     the obvious one)
   - **Does the screen answer what they came for?** (or is the answer one
     level down)
   - **Is anything here not theirs?** (money, other people's data, controls
     they can't use)
   - **If they tap the wrong thing, can they get back?**
5. Also do the two cross-role moments that break most often: management sets
   something (a photo, an item to bring, an access change) → switch role →
   does it show up where that person expects, worded for them? And a show
   day: `NOW` is Apr 12, 2027 — Today must be first for everyone on the road.

Don't skip a persona because the last one went well; the artist and venue
views are where leaks happen, and they're the ones a management company will
show to its talent.

## What to write down

Each finding is one line a non-technical owner can act on, with:
- **Who** (persona) and **where** (page, element)
- **What happens** vs **what they'd expect**
- **Severity**: Blocker (can't do their task / sees what they mustn't),
  Friction (can do it, but would hesitate or ask), Polish (wording, spacing)
- **Suggested change** — specific enough to build

Group findings by persona, blockers first. Then a short list of what is
already good (so it doesn't get "fixed" away).

## Report

Save it as `gigtrip/uat/<YYYY-MM-DD>-uat.md` (so the next pass can see what
was found before) and give the owner the summary in chat:

```
UAT pass — 5 personas, phone, dark mode
Blockers: 1 · Friction: 4 · Polish: 3

Juniper (artist)
- Blocker — Show page shows "Hold 2" chip; she doesn't know what that means
  and it's not hers to care about → hide status for artists, show date + venue
- Friction — ...
Nico (crew)
- ...
Already good: Today's day sheet is the first screen on a show day; ...

Want me to fix the blockers and friction now, then re-run QA?
```

Then, if the owner says yes (or asked for fixes up front): make the changes
in `gigtrip/mock/index.html`, add a QA harness check for anything that was a
blocker (so it can't come back), run the `gigtrip-qa` skill, publish and push.

## Turning real tester feedback into findings

When the owner brings notes from a real session ("the header moved", "where
is import"), treat each note as a finding: reproduce it as that persona on a
phone, work out the underlying cause (often a layout or scope rule, not the
thing they named), and write it up in the same format with the fix. Then
check whether the same cause shows up for the other personas before fixing.
