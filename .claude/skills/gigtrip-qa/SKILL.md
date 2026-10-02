---
name: gigtrip-qa
description: Regression check of the GigTrip mock (gigtrip/mock/index.html) for every role — management, tour manager, artist, band & crew, venue — on phone and desktop, light and dark. Run it after ANY change to the GigTrip mock before publishing or pushing, whenever the owner asks "does everything still work", "check it", "run QA", "test each role", or reports something broken in GigTrip; also before handing the link to a tester. Not for GroupTrip (the trip app in app/), which is a separate application.
---

# GigTrip QA — does it still work for every role?

GigTrip is one file, `gigtrip/mock/index.html`, and five kinds of people use it:
management, tour manager, artist, band & crew, and the venue. A change for one
role often breaks another silently (a menu item appears for the wrong person, a
form stops saving, a page runs off the edge of a phone, dark mode hides a label).
This skill catches that before the owner or a tester does.

Two layers, both required. The static check takes seconds and needs no browser;
the harness runs inside the mock and exercises every role, page, form and flow.

## 1. Static check (no browser)

From the repo root:

```bash
sh .claude/skills/gigtrip-qa/scripts/static-check.sh
```

It confirms the script parses, there is exactly one `<style>` and `<script>`
(the Pages deploy wraps the file), every page in a menu has a view and help
text, no colour is hard-coded outside the theme tokens, and the live-site
workflow still publishes the mock. Fix anything it reports before going on.

## 2. Harness (in the preview browser)

1. Open the mock: `navigate` to `file:///<repo>/gigtrip/mock/index.html`.
   (The preview serves local files from a `data:` page, so `location.hash`
   does nothing and browser storage is off — the harness renders pages
   directly and does not rely on either. The console error "Not allowed to
   navigate top frame to data URL" is the harness environment, not the app.)
2. Phone first: `resize_window` preset `mobile`. Read
   `.claude/skills/gigtrip-qa/scripts/harness.js` and paste its entire
   contents into `javascript_tool`. It returns `{ ok, failed: [...] }`.
3. Desktop: `resize_window` to 1280×800 and run the harness again. Then
   `resize_window` preset `desktop` to reset.
4. Look once: take one screenshot per role on the phone in dark mode of the
   page each role lands on (set `S.role`, `setTheme('dark')`, `route()`).
   The harness checks contrast numerically; the screenshot is for things
   numbers miss — overlapping elements, truncated names, a button hiding
   under the tab bar.

What the harness covers, so you know what a pass means:
- every page renders for every role in every artist context (all / each
  artist), and nothing is wider than the screen
- each role's menu is right: tour manager = management; artist, crew and
  venue never see Season, Money, Access, Settings, Imports, Offers, Activity;
  venue only sees its own show; artist show page = Day sheet + Contacts
- the logo lands each role on its own home; every page has `?` help
- the sample settlement adds up exactly, in cents
- every add form opens and saves; deleting a show takes its tasks with it;
  accepting an offer creates a hold; the tour end date follows the start
- non-management can't reach management-only edit controls
- a spreadsheet import matches columns, previews the right counts, tags the
  rows, and undo removes everything it created
- export has one row per show
- text is readable against its background in light and dark on the busiest
  pages; the dark toggle applies

## 3. Report

Tell the owner in plain English, like this:

```
QA: 5 roles, phone + desktop, light + dark
Static check: ok
Phone: all checks passed
Desktop: 1 failed — crew · jv · travel: wider than the screen
Looked at: 5 landing screens in dark mode — fine
```

If anything failed, fix it in `gigtrip/mock/index.html`, re-run the static
check and the harness, and only then publish (Artifact tool, same file path)
and push. Never report "passed" for a run you didn't do; if the browser is
unavailable, say the harness didn't run and what the static check found.

## Keeping the harness honest

When a feature is added, add a check for it to `scripts/harness.js` in the
same change (a new page → it's covered by the page loop automatically; a new
form → add it to the forms section; a new role rule → add it to section 2).
A check should fail only when something is wrong — never because sample data
changed. The sample data is reset by the harness (`seed()`) at the start and
end, so it leaves the tester's screen clean.

For "is it right for the user" rather than "does it work", use the
`gigtrip-uat` skill.
