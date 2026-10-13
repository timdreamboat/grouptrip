---
name: gigtrip-ui-qa
description: Visual and usability check of the GigTrip mock (gigtrip/mock/index.html) — empty gaps, controls wrapped alone onto a row, overlapping or cut-off elements, empty cards, tap targets too small for a thumb, unbalanced columns, broken pictures — for every role on phone, tablet, desktop and wide screens, light and dark. Run it with gigtrip-qa after every major change to GigTrip and before publishing, and whenever the owner says something "looks off", mentions white space, gaps, alignment, overlap, "not looking right", or asks for a UI/UX check. Not for GroupTrip (separate app).
---

# GigTrip UI/UX QA — does it look right everywhere?

`gigtrip-qa` proves the app works. This proves it looks the way a designer
meant it to, at every size a manager or crew member will open it at. The
owner has found layout problems by eye that the functional harness passed
(flight cards squeezed side by side on desktop; a note pushing the edit
pencil onto an empty row). This skill measures those things so they are
caught before the owner is.

The order for every major change to GigTrip is: `gigtrip-qa` (works) →
`gigtrip-ui-qa` (looks right) → code review of the diff (`/code-review`, or
read the diff yourself against the conventions in CLAUDE.md) → publish.

## 1. Measure (layout harness)

1. Start the local server: `preview_start` with name `gigtrip` (from
   `.claude/launch.json`) and open
   `http://localhost:8082/gigtrip/mock/index.html`. Use the server, not
   `file://`, so the sample pictures load and navigation works.
2. Run the harness at **four widths**, in this order, using `resize_window`
   then `javascript_tool`:
   - phone: preset `mobile` (375)
   - tablet: 820 × 1100
   - desktop: 1280 × 900
   - wide: 1600 × 1000
   The harness lives at `.claude/skills/gigtrip-ui-qa/scripts/layout.js`.
   Load it from the server so you never paste 10 KB into the tool:
   ```js
   const src = await (await fetch('/.claude/skills/gigtrip-ui-qa/scripts/layout.js?r=' + Date.now())).text(); await eval(src)
   ```
   It renders every page for every role (both artist contexts, light and
   dark) and returns `{ ok, findings: [...] }` — one line per distinct
   problem with the first place it was seen and how many more places share
   it. The run takes a few seconds per width.
3. Reset: `resize_window` preset `desktop`.

What it measures, so a pass means something:
- nothing wider than the screen
- no empty vertical gap over 56px between neighbours
- no icon-sized control (edit pencil, ×) wrapped alone onto the last row of
  a wrapping flex row — the tell-tale of a note or label pushing it off
- no two controls overlapping
- no text clipped without an ellipsis
- no empty card or section
- on phone, every button, checkbox (with its label) and summary at least
  28 px each way
- no picture that failed to load
- no grid or flex column stretched more than 48px past its own content (rows
  pulled apart into gaps because a neighbour is taller)
- on desktop, no two-column grid where one column is 1.8× taller than the
  other (a block of empty space under the short one)
- on phone, nothing hidden under the tab bar at the end of the page

A finding is a thing to change — in the page, or in the check if the check
was wrong (say which, and why, in the commit). Don't loosen a threshold to
make a real problem pass.

## 2. Look (the eye test the numbers miss)

Screenshots, after each fix and before publishing. Take them at the width
the owner reported if they reported one; otherwise phone (dark) and desktop
1280 (light), of:
- the page you changed, scrolled to the top and to the bottom
- Travel (manager, artist Juniper Vale) — the boarding passes and hotel
  cards are the densest layout in the app
- the manager's Artists page and one tour page — the pictures and covers
- the show page's Day sheet (tour manager)

Then ask, for each shot:
- **Empty space**: is there a band of background where content should be
  (a short column beside a tall one, a row with one orphaned control, a
  card with padding but nothing in it)?
- **Alignment**: do card edges, numbers and buttons line up along a column?
- **Hierarchy**: is the main action the most visible thing; is the title
  the biggest text; does nothing shout that shouldn't?
- **Truncation**: are names, cities and amounts whole, or cut off mid-word?
- **Theme**: in light mode, is any "dark" element still dark (a button,
  a pill, an icon background)? Screenshots can catch the colour transition
  — wait a second after `setTheme` before shooting.

Note: the preview pane scales large viewports down to fit; a region that
looks blank right after a scroll in a screenshot is usually the pane
painting late, not the app. Scroll with `main.scrollTop = …` in
`javascript_tool`, wait, then shoot; or set a tall viewport (e.g.
1280 × 1500) so the whole page fits without scrolling.

## 3. Report

Say what the harness found at each width (or "clean at all four widths"),
what you changed, and attach the before/after screenshot of anything you
fixed. If a finding is left on purpose, say so and why. Never report
"looks fine" without having run the harness at all four widths.
