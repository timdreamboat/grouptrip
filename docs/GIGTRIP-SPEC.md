# GigTrip — product spec (V1 mock, 2026-09-23)

GigTrip is GroupTrip's "next level" for **music artist managers and their
touring party**: plan single concerts, festival slots and whole tours in one
place, instead of Excel for dates/money and ClickUp for advancing tasks.
It is a separate site with its own name and look, built on GroupTrip's code
and backend, and linked both ways ("Made by GroupTrip").

Status: **clickable mock only** (`gigtrip/mock/index.html`, fake data, no
database). Nothing here is built for real until managers have given feedback
and the owner approves the build.

---

## 1. Who it's for

| Person | Where they work | What they need from GigTrip |
|---|---|---|
| **Artist manager** (organizer) | Desk, laptop | Every date for every artist at a glance (pencil / hold / confirmed), offers coming in, each show's deal, advancing progress, tour budget vs actual |
| **Tour manager (TM)** | Road, phone | Advance each show, publish the day sheet, run guest list, settle with the promoter at night, track per diems and expenses |
| **Band + crew** | Road, phone | Today's day sheet, where to be when, my flight / my room / the van, request guest list spots. **No money** unless given it |
| **Agent, promoter, venue** (later) | Anywhere | Read-only day sheet or advance link — no sign-in, like GroupTrip's invite link |

Both desk and road matter equally: manager screens are desktop-first,
touring-party screens are phone-first.

## 2. What they use today and what GigTrip replaces
- **Excel**: the "dates" sheet (city, venue, cap, deal, status, deposit),
  tour budget, settlement sheets. → Season board, show deal, settlement,
  tour budget.
- **ClickUp**: one list per show with advancing tasks, assignees, due dates,
  attachments. → Advance checklist per show + Docs.
- **Group texts / email PDFs**: day sheets, flight details, guest lists. →
  Today (day sheet), Travel, Guest list, calendar subscription.

## 3. How GigTrip maps onto GroupTrip (reuse first)

| GroupTrip (today) | GigTrip | What's new |
|---|---|---|
| Trip (`trips`) | **Tour**. A one-off concert or festival slot is a tour with one show | `status` per show: pencil → hold (1/2/3) → confirmed → cancelled; artist on the tour |
| Plans by day (`views/plan.js`) | **Show day + day sheet** | Fixed slots: lobby call, load-in, line check, soundcheck, dinner, doors, support, set, curfew, settlement, load-out, bus call |
| Today (`views/today.js`) | **Today = day sheet** | Same "next up + rest of today", plus venue, hotel, contacts, Wi-Fi, parking, next bus call |
| Stays + flights (`views/stays.js`, `views/flights.js`) | **Travel** | Ground legs (van/bus) with drive time; room sharing |
| People + organizer/guest (`views/people.js`) | **Touring party with roles** | Roles: artist, band, TM, FOH, LD, backline, merch, manager, agent. Role decides what's visible |
| Lists (`views/lists.js`) | **Advance checklist** | Per-show items from a template, owner, due date, done; % advanced shows on every show card |
| Photos (`views/photos.js`) | **Docs** | Rider, tech rider, input list, stage plot, contract, insurance, credentials. Files, not an album |
| Polls (`views/polls.js`) | **Offers & holds** | Offer card (promoter, venue, cap, fee, deal, radius clause) → Accept / Counter / Decline; accept makes a hold on the season board |
| Business expenses + report (`views/bizexpenses.js`, `views/bizreport.js`) | **Expenses + per diems** | Per-diem rate per person per day; company card; printable report |
| Money math (`app/money.js`) | **Deals, settlement, budget** | Deal types, settlement sheet, budget vs actual (see §5) |
| Calendar .ics feed (`calendar` Edge Function) | Same | One feed per person with only their shows/travel |
| Map (`views/tripmap.js`) | **Routing map** | All shows in order, drive time between cities |
| Invite page (`views/invite.js`) | Crew join link | Guest list requests per show |
| Usernames (`views/username.js`) | Same username works on both sites | — |

The **embed, don't rebuild** rule still holds: venue sites, ticketing pages
(Ticketmaster, AXS, Dice), Bandsintown/Songkick, Google Maps and weather are
embeds or "open in new tab" buttons. GigTrip never scrapes ticket counts.

## 4. Screens (all in the mock)

**Manager**
1. **Season board** — every date for every artist on the roster, grouped by
   month; status chips (Confirmed / Hold / Pencil / Offer / Cancelled);
   filter by artist and status. Replaces the Excel dates sheet.
2. **Offers** — incoming offers as cards; Accept → becomes a Hold on the
   board, Counter, Decline.
3. **Tour overview** — routing map, list of shows with readiness (advance %,
   contract signed, deposit received), money summary.
4. **Show page** — deal, advance checklist, docs, contacts, guest list,
   day-sheet preview. Same page the TM uses.
5. **Tour budget** — income (show fees, merch) vs costs by category (crew,
   travel, hotels, per diems, production, commissions), budget vs actual,
   projected net.

**Tour manager** (also sees everything the band sees)
6. **Settlement** — night-of sheet: tickets sold × price, fees, promoter
   expenses, guarantee vs %, deposit, amount due tonight. Live recalculation
   when the TM types the real count.
7. **Guest list approvals**.

**Band + crew**
8. **Today / day sheet** — big, phone-first times; venue, hotel, contacts,
   Wi-Fi, parking, next bus call.
9. **Travel** — my flights (boarding-pass cards), my room, van legs.
10. **Guest list** — request a spot (+1), see status.
11. **Party** — who's on the road, role, phone.

## 5. Money (needs owner approval as in-app processing exception #6)
All amounts in integer cents, like `app/money.js`.

- **Deal types**: Flat guarantee · Guarantee **vs** % of net (artist gets
  whichever is higher) · Guarantee **plus** % after split point · Door deal
  (% of gross) · Festival flat fee.
- **Settlement** (per show):
  gross = tickets sold × ticket price → minus ticketing/facility fees = net box
  office → minus promoter's agreed show expenses = net after expenses →
  artist % of that → artist earns max(guarantee, %) for a "vs" deal → minus
  deposit already paid (and any withholding tax) = **due tonight**.
- **Tour budget**: budget and actual per category; commissions calculated
  from show fees (agent %, manager %); per diems = rate × people × days.
- Mock example (NYC show): 1,262 × $38 = $47,956 gross; − $3,786 fees =
  $44,170 net; − $18,450 expenses = $25,720; 85% = $21,862 > $9,000
  guarantee → artist earns $21,862; − $4,500 deposit = **$17,362 due**.

## 6. Data model sketch (Supabase, same project as GroupTrip)
New tables, all locked behind `SECURITY DEFINER` functions like GroupTrip:

- `artists` (id, name, roster owner)
- `tours` → reuse `trips` with `kind = 'tour'` and `artist_id`
- `shows` (trip_id, date, city, venue, capacity, status, hold_rank, lat/lon,
  ticket_url, venue_url)
- `show_slots` (show_id, label, time, who) — the day sheet
- `deals` (show_id, type, guarantee_cents, pct, split_point_cents,
  deposit_cents, deposit_paid_at, currency)
- `settlements` (show_id, tickets_sold, price_cents, fees_cents,
  expenses_json, withholding_cents, settled_at, signed_by)
- `advance_items` (show_id, label, owner_member_id, due, done_at) +
  `advance_templates`
- `members.role` (artist / band / tm / foh / ld / backline / merch / manager / agent)
- `guest_list` (show_id, requested_by, name, plus_ones, status)
- `docs` (show_id or trip_id, kind, file path, version) — in the trip's
  storage folder, like receipts
- `offers` (artist_id, promoter, venue, city, date, capacity, deal fields,
  radius clause, status)
- `budget_lines` (trip_id, category, budget_cents); actuals come from
  expenses + per diems + settlements

## 7. Roles and who sees what (owner, 2026-09-23)
Roles: **management team, tour manager, artist, crew, venue/promoter**. Each
person sees only what they need or what management allows. Management sets
everything: who is on each tour, their role, and per-role or per-person access.

Money is split into three levels so costs and profit can be hidden separately:
**My money** (own pay, per diems, expenses) · **Show costs** (deals, venue
expenses, settlement, tour spending) · **Profit** (net per show/tour,
commissions, budget vs actual).

Proposed defaults ("optional" = off unless management switches it on):

| Area | Management | Tour manager | Artist | Crew | Venue / promoter |
|---|---|---|---|---|---|
| Season board, offers, holds | Full | — | Optional | — | — |
| Day sheet, schedule | Full | Edit | View | View | Their show |
| Advance checklist, docs | Full | Edit | — | Tech items | Their show |
| Travel | Full | Edit | Own | Own | — |
| Guest list | Approve | Approve | Request | Request | Final list |
| My money | Full | Own | Own | Own | — |
| Show costs + settlement | Full | Edit (settles) | Optional | — | Their show |
| Profit + tour budget | Full | Optional | Optional | — | — |
| Invite people, set roles/access | Full | — | — | — | — |

Data: `members.role` plus an `access` override per member (JSON of area →
none/view/edit), checked in `_get_trip_all` so hidden money never reaches the
device. Open questions on roles live in the follow-up doc.

### Who brings what (owner, 2026-09-23)
Management sets, for every person (and the venue), what they're expected to
supply — e.g. the venue provides stage, PA, lighting rig and LED wall; the VJ
brings the media server, HDMI→SDI converter and cables to connect to it.
- Shows on the person's card in Party (tap to expand) and on their Today
  screen as "You're bringing" / "Venue provides", where they tick each item
  confirmed.
- The show page has a "Who brings what" tab: venue provides vs tour brings,
  with confirmed / not yet — the gear side of advancing.
- Data: `supply_items` (trip_id, member_id, show_id nullable = every show,
  label, confirmed_at), set by management.

In the mock, "View as" covers Manager, Tour manager, Artist, Band & crew
(Nico, the VJ) and Venue (Greg, production manager). Management changes role
defaults on the **Access** screen and one person's access on their card;
menus follow what each viewer is allowed to see.

## V1 mock scope (2026-09-23) — the pitch version
Management can add, edit and delete everything; other roles edit only what
their access allows. Every form is one shared dialog (`openForm`) — the real
build reuses GroupTrip's "add form doubles as edit form" pattern.
- **Roster**: artists (press photo upload), tours per artist.
- **Season**: list + sortable table, search, filters, bulk status change,
  **Import from Excel/CSV** (paste or file) and **Export** (copy CSV).
- **Offers**: log/edit; accept creates a hold with template advance tasks.
- **Show**: edit all details + deal (currency, deposit due/received);
  advance **tasks** with owner, due date, status and **comments**; docs with
  **uploads** (drag-drop or tap, image preview); contacts; day sheet with
  add/edit and "use template"; who brings what.
- **Settlement** for any show: editable show expenses, withholding line,
  deal types vs / flat / door / festival, "mark as settled".
- **Money**: deposits due (overdue / due soon / received), commission
  statement per artist (agent % + management %), tour budget lines.
- **Activity**: needs-attention feed (overdue tasks, deposits, expiring
  offers, guest requests) + change log; bell badge in the top bar.
- **Settings**: advance template, day-sheet template, per diem and
  commission rates, reset sample data.
- Travel, guests, people, supply lists, expenses with receipt upload — all
  editable. Mock data object `DB` mirrors the tables in §6 plus `tours`,
  `artists`, `slots`, `tasks` (+ `comments`), `docs`, `contacts`, `supply`,
  `travel`, `budget`, `showExp`, `sheets`, `myexp`, `templates`, `settings`,
  `access`, `activity`.

### Artist home + switcher (owner, 2026-09-23)
Managers and tour managers can work with 10+ artists. **Artists** is the
home page: search, sort (next show / needs attention / A–Z), a card per
artist (show today, next show, confirmed/holds, alert count) and an "All
artists" option. Picking one sets the artist for every screen (season,
tours, shows, settlement, guests, money, travel, party); an artist chip in
the top bar switches back. Managers land on the artist's page; tour managers
land on Today. A tour manager only sees the artists they're assigned to
(`members.artists`). Roles with one artist (artist, crew, venue) skip home.

**Artist profile picture** (owner, 2026-09-23): management sets it by tapping
the picture on the artist page or in the artist form (with preview and
"Remove picture"). The device crops it to a square and shrinks it to 320px
before upload, as GroupTrip does for photos; it shows on the artist home
cards, the top-bar switcher and the artist page. Real build: `artists.photo_path`
in the org's storage folder.

## Build plan: mock → live site
Day 1 (live on GitHub Pages under `/gigtrip/`, same Supabase project):
usernames (reuse), artists/tours/shows, tasks + comments, docs upload
(reuse `photos` Edge Function + storage), day sheet, supply lists, people +
roles/access (checked server-side in the trip builder), guest list, travel,
push notifications (reuse `notify`). Day 2: deals, settlement, deposits,
commissions, budget (needs owner approval as exception #6), CSV import/export,
activity feed. Screens port 1:1 from the mock's views.

## 8. Where it lives (real build)
- Same repo, new folder `gigtrip/` that imports shared modules from `app/`
  (`store.js`, `ui.js`, `money.js`, `style.css` tokens) and adds GigTrip
  views + its own theme (gaffer-yellow accent, condensed display type).
- Published on GitHub Pages at its own path (later its own domain), same
  Supabase project, so one username works on both sites. Free tier.

## 9. Roadmap
- **v0 — mock** (now): clickable prototype + this spec; show managers.
- **v1 — shows & day sheets**: tours of shows, day-sheet slots, Today,
  travel, party roles, advance checklist, docs, calendar feed.
- **v2 — money**: deals, settlement sheet (printable), per diems, tour budget.
- **v3 — booking**: season board across artists, offers & holds, agent /
  promoter read-only links, guest list.
- Later: merch counts, import from Excel/CSV, ClickUp import.

## 10. Questions for managers
Tracked in the follow-up doc (answers, status):
https://claude.ai/code/artifact/2a7d6d1a-a745-42c3-838a-98c4fc68f470
- Multiple artists / roster view — **yes** (2026-09-23)
- Band/crew see money — **partially**, details TBD
- Excel columns + ClickUp lists — TBD
- Who settles, currency, withholding — TBD
- Agent/promoter/venue login vs shared link — TBD
