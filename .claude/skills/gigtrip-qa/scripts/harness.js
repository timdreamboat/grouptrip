// GigTrip QA harness. Paste the whole file into the preview browser's JavaScript
// tool with the mock (gigtrip/mock/index.html) open. It returns a report object:
//   { ok, passed, failed: ["role · page · what went wrong", ...], notes }
// It only uses the mock's own globals (DB, S, V, navFor, ME, E, settle, ...).
// Keep checks fast and deterministic: every check must be true for every role
// whenever the app is healthy, so a failure always means something to fix.
(async () => {
  const failed = [], notes = [];
  const check = (cond, msg) => { if (!cond) failed.push(msg); return !!cond; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const main = document.querySelector('#main');
  const render = k => { S.page = k; main.innerHTML = V[k](); const h1 = main.querySelector('.head h1'); if (h1 && HELP[k]) h1.outerHTML = `<div class="titlerow">${h1.outerHTML}${helpBtn(k)}</div>`; };
  const fits = () => document.documentElement.scrollWidth <= innerWidth + 1 && main.scrollWidth <= main.clientWidth + 1;
  const txt = () => main.innerText;
  const roles = Object.keys(ME);
  const startTheme = THEME;

  // Fresh sample data, so results don't depend on what a tester clicked earlier.
  DB = seed(); try { save(); } catch {}
  S.sel.clear(); S.open.clear();

  // 1. Every page renders for every role, in every artist context, and fits the screen.
  const contexts = ['all', 'jv', 'kes', 'co'];
  for (const r of roles) {
    S.role = r;
    for (const a of contexts) {
      S.artistId = a; S.showId = null; S.showTab = ''; S.seasonView = 'list';
      for (const [k] of navFor().concat([['more', 'More']])) {
        try { render(k); check(fits(), `${r} · ${a} · ${k}: wider than the screen`); }
        catch (e) { failed.push(`${r} · ${a} · ${k}: crashed — ${e.message}`); }
      }
      if (navFor().some(n => n[0] === 'show')) for (const t of showTabs()) { S.showTab = t[0]; try { render('show'); check(fits(), `${r} · ${a} · show › ${t[1]}: wider than the screen`); } catch (e) { failed.push(`${r} · ${a} · show › ${t[1]}: crashed — ${e.message}`); } }
      if (navFor().some(n => n[0] === 'board')) { S.seasonView = 'table'; try { render('board'); } catch (e) { failed.push(`${r} · ${a} · season table: crashed — ${e.message}`); } S.seasonView = 'list'; }
      if (navFor().some(n => n[0] === 'money')) for (const m of ['deposits', 'commission', 'budget']) { S.moneyTab = m; try { render('money'); } catch (e) { failed.push(`${r} · ${a} · money › ${m}: crashed — ${e.message}`); } }
    }
  }

  // 2. Each role sees what it should and nothing it shouldn't.
  const nav = r => { S.role = r; S.artistId = 'jv'; return navFor().map(n => n[0]); };
  const mgr = nav('manager'), tm = nav('tm'), art = nav('artist'), crew = nav('crew'), venue = nav('venue');
  check(mgr.join() === tm.join(), 'Tour manager menu differs from management (they should match)');
  S.role = 'tm'; check(myArtists().length < DB.artists.length, 'Tour manager sees the whole roster (should be only assigned artists)');
  for (const [r, list] of [['artist', art], ['crew', crew], ['venue', venue]]) {
    for (const k of ['board', 'money', 'access', 'settings', 'imports', 'offers', 'activity']) check(!list.includes(k), `${r} can open ${k}`);
  }
  check(art[0] === 'myhome' && crew[0] === 'myhome', 'Artist/crew do not land on Home');
  check(mgr[0] === 'home' && tm[0] === 'home', 'Management/tour manager do not land on Artists');
  check(venue[0] === 'today', 'Venue does not land on Today');
  check(!venue.includes('travel') && !venue.includes('mymoney'), 'Venue can see travel or my money');
  S.role = 'artist'; S.showId = 'nyc'; S.showTab = '';
  check(showTabs().map(t => t[0]).join() === 'sheet,contacts', `Artist show tabs are ${showTabs().map(t => t[1]).join(', ')} (should be Day sheet, Contacts)`);
  S.role = 'crew'; check(!showTabs().some(t => t[0] === 'deal'), 'Crew can see the Deal tab');
  S.role = 'venue'; check(!showTabs().some(t => t[0] === 'deal' || t[0] === 'advance'), 'Venue can see the Deal tab or the Advance checklist');
  S.role = 'venue'; S.showId = 'nyc'; S.showTab = 'docs'; render('show'); check(!/Contract|Settlement sheet/.test(txt()), 'Venue can see the contract or settlement documents');
  for (const r of ['manager', 'tm']) { S.role = r; S.artistId = 'jv'; const list = navFor().map(n => n[0]); check(list.includes('today'), `${r} has no Today page`); check(list[1] === 'today', `${r}: Today is not first after Artists on a show day`); }
  S.role = 'artist'; S.artistId = 'jv'; render('myhome'); check(!/Hold \d|Pencil/.test(txt()), 'Artist Home shows booking jargon (Hold / Pencil)');
  S.role = 'tm'; render('home'); check(!/Getting started/.test(txt()), 'Tour manager sees the company Getting started card');
  S.role = 'venue'; S.showId = 'nyc'; S.showTab = 'sheet'; render('show'); check(!/Lobby call|Settlement/.test(txt()), 'Venue day sheet shows tour-only lines (lobby call, settlement)');
  S.role = 'artist'; S.artistId = 'jv'; S.tourId = 't1'; render('tour'); check(!/Real build|Mock clock|mock clock/.test(txt()), 'Artist sees prototype notes on the tour page');
  render('today'); check(!/mock clock/i.test(txt()), 'Artist sees the mock clock on Today');
  S.role = 'crew'; render('travel'); check(!/Real build/.test(txt()) && !/Hotel[\s\S]*Done/.test(txt()), 'Crew travel shows a prototype note or "Done" on a hotel');
  S.role = 'manager'; S.artistId = 'all'; S.status = 'all'; render('board'); const allRows = main.querySelectorAll('.li').length; ACT.statusFilter('hold'); render('board');
  check(S.status === 'hold' && main.querySelectorAll('.li').length < allRows && [...main.querySelectorAll('.li .chip:not(.plain)')].every(c => /Hold/.test(c.textContent)), 'Tapping the Holds card did not filter the Season board to holds');
  check(main.querySelector('.statbtn[aria-pressed="true"]')?.textContent.includes('Holds'), 'The Holds card is not shown as pressed while filtering');
  ACT.statusFilter('hold'); render('board'); check(S.status === 'all' && main.querySelectorAll('.li').length === allRows, 'Tapping the Holds card again did not clear the filter');
  S.moneyTab = 'deposits'; S.depFilter = ''; render('money'); const depRows = main.querySelectorAll('tbody tr').length; ACT.depFilter('received'); render('money'); check(main.querySelectorAll('tbody tr').length < depRows && [...main.querySelectorAll('tbody .chip')].every(c => c.textContent === 'Received'), 'Tapping the Received card did not filter the deposits table'); S.depFilter = '';
  S.role = 'venue'; S.showId = 'tor'; render('show'); check(S.showId === 'nyc', 'Venue can open a show that is not theirs');
  S.role = 'artist'; S.artistId = 'jv'; S.tourId = 't1'; render('tour'); check(!/Show fees|Deposits received/.test(txt()), 'Artist tour page shows money');
  render('myhome'); check(!/You.re bringing/.test(txt()), "Artist Home shows 'You're bringing' without a show in view");
  render('today'); check(/You.re bringing/.test(txt()), "Artist Today is missing 'You're bringing'");
  S.role = 'manager'; S.artistId = 'jv'; S.showId = 'nyc'; S.showTab = 'deal'; render('show'); check(/Guarantee/.test(txt()), 'Manager show page is missing the deal');
  // Times (2026-10-26): the device decides the format; shows and airports carry a zone; the clock is live in the venue's zone.
  check(fmtTime('18:00') === new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, 18, 0)).replace(/\u202f/g, ' '), 'Time format does not follow the device');
  check(showTz(show('nyc')) === 'America/New_York' && tzFor('Vancouver, BC') === 'America/Vancouver' && airportTz('YYZ') === 'America/Toronto', 'Show or airport time zone lookup is wrong');
  check(fromWall('2027-04-12', '18:00', 'America/New_York').toISOString() === '2027-04-12T22:00:00.000Z', 'Venue-local time does not convert to the right instant');
  check(/your time/.test(clockText('Pacific/Kiritimati')), 'Today clock does not show the device time when the venue is in another zone');
  check(!/your time/.test(clockText(DEVICE_TZ)), 'Today clock shows "your time" when the venue is in the device zone');
  S.role = 'tm'; S.artistId = 'jv'; render('today'); check(!/mock clock/i.test(txt()) && /show day/i.test(txt()), 'Today still shows a mock clock');
  // Demo pictures (2026-10-13): every seeded artist and tour has a sample photo that actually loads from demo/img/.
  S.role = 'manager'; S.artistId = null; render('home');
  check(DB.artists.every(a => photoUrl(a)) && DB.tours.every(t => t.cover), 'A seeded artist or tour has no sample picture');
  { const imgs = [...main.querySelectorAll('img.aph')]; await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))); check(imgs.length >= 12 && imgs.every(i => i.naturalWidth > 0), 'An artist picture on the Artists page did not load (wrong demo/img path?)'); }
  { const ok = await new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = DB.tours[0].cover; }); check(ok, `Tour cover did not load: ${DB.tours[0].cover}`); }

  // UAT 2026-11-17 blockers and friction, so they can't come back.
  S.role = 'crew'; S.artistId = 'jv'; render('travel'); check(/Room 616/.test(txt()) && !/Room 614|Room 610|Juniper/.test(main.querySelector('.hotel')?.innerText || ''), 'Crew can see other people’s hotel rooms');
  S.role = 'artist'; render('travel'); check(/Room 614/.test(txt()) && !/Room 610|Room 616/.test(txt()), 'Artist can see other people’s hotel rooms');
  S.role = 'crew'; S.showId = 'nyc'; S.showTab = 'advance'; render('show'); check(!/Contract signed|Deposit received/.test(txt()) && /Tech rider sent/.test(txt()), 'Crew see the office’s contract and deposit tasks');
  S.role = 'venue'; S.showTab = 'sheet'; render('show'); check(!/Reserve on OpenTable/.test(txt()), 'Venue sees the tour’s dinner booking button');
  render('about'); check(!/Prototype|Demo as|Excel/i.test(txt()), 'Venue sees the company pitch on the help page');
  S.role = 'manager'; S.artistId = 'co'; const coShow = DB.shows.find(x => x.artist === 'co' && x.date >= NOW.date); S.showId = coShow.id; S.showTab = 'supply'; render('show'); check(!/Greg Ho|Canal Street|Theo Marsh/.test(main.querySelector('.card.stack')?.innerText.replace(/^[\s\S]*?Contacts/, '') || ''), 'Another show lists the New York venue’s people or another artist’s band under Who brings what');
  S.tourId = 't2'; render('tour'); check(!/Add cities we recognise/.test(txt()) && DB.shows.every(x => x.ll), 'A sample tour has no route (a city without coordinates)');
  S.role = 'tm'; S.artistId = 'jv'; render('today'); check(!/ E[SD]T · [\s\S]*\(E[SD]T\)/.test(txt()) || (txt().match(/E[SD]T/g) || []).every((z, i, a) => z === a[0]), 'Today shows two different time-zone names for the same venue');
  S.role = 'manager'; S.artistId = 'jv';
  // 3. The logo goes to each role's own home; every page has help.
  for (const r of roles) { S.role = r; S.artistId = 'jv'; const home = navFor()[0][0]; check(['home', 'myhome', 'today'].includes(home), `${r}: logo home is ${home}`); for (const [k] of navFor()) if (k !== 'more') check(!!HELP[k] || k === 'about', `${r}: no help text for ${k}`); }

  // 4. Money math: the sample settlement must come out exactly (cents, no floats).
  S.role = 'manager'; const r = settle(show('nyc'));
  check(r.gross === 4795600 && r.net === 4417000 && r.earns === 2186200 && r.due === 1736200, `New York settlement is off: due ${r.due} (expected 1736200)`);
  check(DB.shows.every(s => Number.isInteger(s.deal.g) && Number.isInteger(s.deal.dep)), 'A deal has a non-integer cents amount');

  // 5. Every add/edit form opens, saves and deletes (management).
  const d = document.querySelector('#dlg');
  const submit = async () => { d.querySelector('form').requestSubmit(); await wait(60); };
  const open = (fn, label) => { try { fn(); return check(d.open, `${label}: form did not open`); } catch (e) { failed.push(`${label}: form crashed — ${e.message}`); return false; } };
  const set = (name, v) => { const el = d.querySelector(`[name="${name}"]`); if (el) el.value = v; };
  S.role = 'manager'; S.artistId = 'jv'; S.showId = 'nyc'; S.tourId = 't1';
  const n0 = { artists: DB.artists.length, tours: DB.tours.length, shows: DB.shows.length, tasks: DB.tasks.length, people: Object.keys(DB.people).length, travel: DB.travel.length, guests: DB.guests.length, supply: DB.supply.length, budget: DB.budget.length, contacts: DB.contacts.length, slots: DB.slots.length, offers: DB.offers.length };
  if (open(() => E.artist(null), 'Add artist')) { set('name', 'QA Artist'); await submit(); check(DB.artists.length === n0.artists + 1, 'Add artist did not save'); }
  if (open(() => E.tour(null, { artist: 'jv' }), 'Add tour')) { set('name', 'QA Run'); set('start', '2027-12-01'); d.querySelector('[name=start]').dispatchEvent(new Event('input', { bubbles: true })); check(d.querySelector('[name=end]').value === '2027-12-02', 'Tour end date did not follow the start date'); await submit(); check(DB.tours.length === n0.tours + 1, 'Add tour did not save'); }
  const qaTour = DB.tours.find(t => t.name === 'QA Run');
  if (open(() => E.show(null, { tour: qaTour?.id, artist: 'jv' }), 'Add show')) { set('city', 'QA City, QC'); set('venue', 'QA Hall'); await submit(); check(DB.shows.length === n0.shows + 1, 'Add show did not save'); check(DB.tasks.length === n0.tasks + DB.templates.advance.length, 'New show did not get advance tasks from the template'); }
  const qaShow = DB.shows.find(s => s.venue === 'QA Hall');
  if (open(() => E.task(null, { show: 'nyc' }), 'Add task')) { set('label', 'QA task'); await submit(); check(DB.tasks.some(t => t.label === 'QA task'), 'Add task did not save'); }
  if (open(() => E.slot(null, { show: 'nyc' }), 'Add day-sheet time')) { set('time', '14:15'); set('label', 'QA check'); await submit(); check(DB.slots.length === n0.slots + 1, 'Add day-sheet time did not save'); }
  if (open(() => E.contact(null, { show: 'nyc' }), 'Add contact')) { set('name', 'QA Contact'); await submit(); check(DB.contacts.length === n0.contacts + 1, 'Add contact did not save'); }
  if (open(() => E.person(null), 'Add person')) { set('name', 'QA Person'); await submit(); check(Object.keys(DB.people).length === n0.people + 1, 'Add person did not save'); }
  if (open(() => E.guest(null, { show: 'nyc' }), 'Add guest')) { set('name', 'QA Guest'); await submit(); check(DB.guests.length === n0.guests + 1, 'Add guest did not save'); }
  if (open(() => E.travel(null), 'Add travel')) { set('label', 'QA → QA'); await submit(); check(DB.travel.length === n0.travel + 1, 'Add travel did not save'); }
  // Flights, hotels and OpenTable (2026-10-08): boarding passes, hotel cards with rooms, "Find my flight", linked dates, Reserve embed.
  if (open(() => E.flight(null), 'Add flight')) { set('flight', 'AC 8783'); d.querySelector('[data-lookup]').click(); check(d.querySelector('[name=from]').value === 'DCA' && d.querySelector('[name=arr]').value === '12:15', 'Find my flight did not fill the times'); await submit(); check(DB.travel.some(x => x.flight === 'AC 8783' && x.label === 'DCA → YYZ' && x.date === NOW.date), 'Add flight did not save with a route'); }
  if (open(() => E.hotel(null), 'Add hotel')) { set('name', 'QA Inn'); set('start', '2027-12-01'); d.querySelector('[name=start]').dispatchEvent(new Event('input', { bubbles: true })); check(d.querySelector('[name=end]').value === '2027-12-02', 'Hotel check-out did not follow check-in'); await submit(); const h = DB.travel.find(x => x.name === 'QA Inn'); check(h && h.checkIn === '2027-12-01' && h.checkOut === '2027-12-02' && h.type === 'hotel', 'Add hotel did not save check-in/out'); }
  if (open(() => E.slot(null, { show: 'nyc' }), 'Add dinner with OpenTable')) { set('time', '17:45'); set('label', 'QA dinner'); set('ot', 'https://www.opentable.com/restref/client/?rid=1779'); await submit(); const sl = DB.slots.find(x => x.label === 'QA dinner'); check(sl && sl.ot === '1779', 'OpenTable link did not become a restaurant ID'); if (sl) { ACT.reserve(sl.id); check(d.open && /opentable\.com\/restref/.test(d.querySelector('iframe')?.src || ''), 'Reserve did not open the OpenTable embed'); d.close(); } }
  S.role = 'manager'; render('travel'); check(main.querySelectorAll('.pass').length >= 4 && main.querySelectorAll('.hotel').length >= 2, 'Travel page is missing boarding passes or hotel cards');
  check(/Room 612 · Theo, Sam/.test(txt()), 'Hotel card does not show who shares a room');
  { const pass = main.querySelector('.pass'); check(pass && pass.querySelector('.pass-route').offsetTop > pass.querySelector('.pass-top').offsetTop + 20 && getComputedStyle(pass).display !== 'grid', 'Boarding pass rows sit side by side instead of stacked (a leftover .pass grid rule?)'); }
  S.role = 'crew'; render('travel'); check(main.querySelectorAll('.pass').length >= 1 && !main.querySelector('[data-act="flight"],[data-act="hotel"]'), 'Crew travel has no flights or shows edit buttons');
  render('today'); check(/Hotel[\s\S]*Your room 616/.test(txt()), 'Crew Today is missing the hotel with their room');
  S.role = 'tm'; S.showId = 'nyc'; S.showTab = 'sheet'; render('show'); check(/Reserve on OpenTable/.test(txt()), 'Day sheet is missing the OpenTable button on the dinner line');
  S.role = 'manager';
  if (open(() => E.supply(null, { person: 'nico' }), 'Add item to bring')) { set('label', 'QA cable'); await submit(); check(DB.supply.length === n0.supply + 1, 'Add item to bring did not save'); }
  if (open(() => E.budget(null, { tour: 't1' }), 'Add budget line')) { set('cat', 'QA line'); set('budget', '100'); await submit(); check(DB.budget.length === n0.budget + 1, 'Add budget line did not save'); }
  if (open(() => E.offer(null), 'Log offer')) { set('city', 'QA Town'); set('venue', 'QA Club'); await submit(); check(DB.offers.length === n0.offers + 1, 'Log offer did not save'); }
  const qaOffer = DB.offers.find(o => o.venue === 'QA Club'); if (qaOffer) { ACT.acceptOffer(qaOffer.id); check(DB.shows.some(s => s.venue === 'QA Club' && s.status === 'hold'), 'Accepting an offer did not create a hold'); }
  if (qaShow && open(() => E.show(qaShow.id), 'Edit show')) { const del = d.querySelector('[data-del]'); del.click(); del.click(); await wait(60); check(!DB.shows.some(s => s.id === qaShow.id), 'Delete show did not remove it'); check(!DB.tasks.some(t => t.show === qaShow.id), 'Deleting a show left its tasks behind'); }
  if (d.open) d.close();

  // 5b. Custom views (2026-11-17): saved views, own columns, custom fields, home cards, company branding.
  S.role = 'manager'; S.artistId = 'all'; S.status = 'all'; S.seasonView = 'list'; S.q = ''; delete pref().cols; delete pref().home;
  ACT.view('vw_holds'); render('board');
  check(S.status === 'hold' && S.seasonView === 'table' && [...main.querySelectorAll('thead th button.sort')].map(b => b.textContent.replace(/[ ↑↓]/g, '')).join() === 'Date,Artist,City,Venue,Status,Guarantee', 'Saved view did not apply its filter and columns');
  check(main.querySelector('.viewchip[aria-pressed="true"]')?.textContent === 'Holds to chase' && !main.querySelector('[data-act="saveView"]'), 'The active saved view is not marked');
  ACT.statusFilter('hold'); render('board'); check(!main.querySelector('.viewchip[aria-pressed="true"]') && !!main.querySelector('[data-act="saveView"]'), 'Changing a filter did not offer "Save this view"');
  if (open(() => ACT.saveView(), 'Save view')) { set('name', 'QA view'); await submit(); check(myViews().some(v => v.name === 'QA view' && v.status === 'all'), 'Save this view did not save'); }
  if (open(() => ACT.cols(), 'Columns')) { d.querySelectorAll('.arr li').forEach(li => { li.querySelector('input').checked = ['date', 'city'].includes(li.dataset.w); }); await submit(); S.seasonView = 'table'; render('board'); check(main.querySelectorAll('thead th button.sort').length === 2, 'Column picker did not change the table'); }
  delete pref().cols; S.seasonView = 'list'; S.status = 'all';
  const f0 = DB.fields.length;
  if (open(() => E.field(null), 'Add field')) { set('label', 'QA field'); await submit(); check(DB.fields.length === f0 + 1, 'Add custom field did not save'); }
  const qf = DB.fields.find(f => f.label === 'QA field');
  if (qf && open(() => E.show('nyc'), 'Edit show with custom field')) { set('cf.' + qf.id, 'QA value'); await submit(); check(show('nyc').cf?.[qf.id] === 'QA value', 'Custom field value did not save on the show'); check(boardCols().some(c => c.k === 'cf:' + qf.id), 'Custom field is not offered as a table column'); }
  S.artistId = 'jv'; S.showId = 'nyc'; S.showTab = 'deal'; render('show'); check(/QA field/.test(txt()) && /Support act: Hollow Pines/.test(txt()), 'Show page does not show custom fields');
  S.role = 'crew'; S.showTab = 'sheet'; render('show'); check(/Support act: Hollow Pines/.test(txt()) && !/On-sale date|QA field/.test(txt()), 'Crew see a management-only field, or miss an everyone field');
  S.role = 'venue'; render('show'); check(!/Support act/.test(txt()), 'Venue sees tour custom fields');
  S.role = 'manager'; if (qf && open(() => E.field(qf.id), 'Delete field')) { const del = d.querySelector('[data-del]'); del.click(); del.click(); await wait(60); check(!DB.fields.includes(qf) && !(qf.id in (show('nyc').cf || {})), 'Deleting a field left its values behind'); }
  S.artistId = null; render('home'); check(/Shows today/.test(txt()) && !!main.querySelector('[data-act="customHome"]'), 'Manager home is missing its cards or Customize');
  if (open(() => ACT.customHome(), 'Customize home')) { d.querySelectorAll('.arr li').forEach(li => { li.querySelector('input').checked = ['money', 'artists'].includes(li.dataset.w); }); await submit(); render('home'); check(/Deposits to chase/.test(txt()) && !/Shows today/.test(txt()) && !main.querySelector('.acard[data-id="all"]'), 'Customize home did not change the home page'); }
  delete pref().home;
  S.role = 'artist'; S.artistId = 'jv'; render('myhome'); check(/Next show/.test(txt()) && !!main.querySelector('[data-act="customHome"]') && main.querySelectorAll('.tcard').length >= 3, 'Artist home is missing Next show, Customize or the tours');
  S.role = 'manager'; DB.settings.org.name = 'QA Co'; S.artistId = 'all'; render('board'); check(/QA Co/i.test(txt()), 'Company name does not show on the Season board');
  ACT.accent('mint'); check(document.documentElement.dataset.accent === 'mint' && getComputedStyle(document.documentElement).getPropertyValue('--tape').includes('--brand') || getComputedStyle(document.querySelector('.logo')).backgroundColor !== 'rgb(255, 204, 26)', 'Accent colour did not apply');
  ACT.accent('tape'); check(!document.documentElement.dataset.accent, 'Accent colour did not reset');

  // 6. Non-management cannot reach management forms through the UI.
  S.role = 'crew'; S.artistId = 'jv'; render('party'); check(!main.querySelector('[data-act="person"]'), 'Crew can edit people');
  render('travel'); check(!main.querySelector('[data-act="newTravel"],[data-act="newFlight"],[data-act="newHotel"]'), 'Crew can add travel for everyone');
  S.role = 'artist'; S.tourId = 't1'; render('tour'); check(!main.querySelector('[data-act="tour"],[data-act="newShowTour"],.coveredit'), 'Artist can edit the tour or its photo');

  // 7. Import from a spreadsheet, then undo it, leaves no trace.
  S.role = 'manager'; S.artistId = 'all';
  const before = { shows: DB.shows.length, tasks: DB.tasks.length, artists: DB.artists.length };
  try {
    openImportWizard(); W.source = 'excel'; W.step = 1; renderWizard();
    const csv = 'Artist,Show Date,City,Venue,Cap,Status,Guarantee,Deposit\nQA Import Act,5/14/28,"Chicago, IL",The Foundry,1500,Confirmed,"$10,000","$5,000"\nQA Import Act,5/16/28,"Nashville, TN",Brightwater Hall,900,Hold 2,"$8,000",';
    await takeFile(new File([csv], 'qa.csv', { type: 'text/csv' })); prepSheet();
    check(W.kind === 'shows', `Import detected "${W.kind}" instead of shows`); check(W.map.date != null && W.map.city != null && W.map.g != null, 'Import did not match the date, city or guarantee columns');
    const pv = buildImport(true); check(pv.counts.shows === 2 && pv.counts.artists === 1, `Import preview counted ${pv.counts.shows} shows / ${pv.counts.artists} artists (expected 2 / 1)`);
    W.result = buildImport(false); d.close();
    check(DB.shows.length === before.shows + 2 && DB.imports.length === 1, 'Import did not create the shows');
    check(show(DB.imports[0].ids.shows[0]).deal.g === 1000000, 'Imported guarantee is not $10,000');
    render('board'); check(main.querySelectorAll('.st-imported').length >= 2, 'Imported shows are not tagged on the Season board');
    undoImport(DB.imports[0].id);
    check(DB.shows.length === before.shows && DB.tasks.length === before.tasks && DB.artists.length === before.artists && DB.imports.length === 0, 'Undo import left data behind');
    // Travel rows from a spreadsheet get the fields the boarding pass needs.
    openImportWizard(); W.source = 'excel'; W.step = 1; renderWizard();
    const tcsv = 'Type,Date,Route,Time,Details,Who\nflight,4/20/27,YYZ → LAX,09:10,"AC 791 · arrives 11:35 · conf ZZ12AB",road\nhotel,4/20/27,Sunset Tower LA,,Apr 20 – 22,road';
    await takeFile(new File([tcsv], 'travel.csv', { type: 'text/csv' })); prepSheet();
    check(W.kind === 'travel', `Travel import detected "${W.kind}"`);
    W.result = buildImport(false); d.close();
    const imp = DB.travel.find(x => x.label === 'YYZ → LAX');
    check(imp && imp.from === 'YYZ' && imp.to === 'LAX' && imp.flight === 'AC 791' && imp.arr === '11:35' && imp.conf === 'ZZ12AB', 'Imported flight is missing its route, number, arrival or confirmation');
    S.role = 'manager'; S.artistId = 'jv'; render('travel'); check(fits(), 'Travel page with imported rows is wider than the screen');
    undoImport(DB.imports[0].id);
  } catch (e) { failed.push(`Import: crashed — ${e.message}`); if (d.open) d.close(); }

  // 7b. Switching from Master Tour and RoadOps (2026-11-17): several export files in one go, previewed on a copy, undoable.
  // The files in gigtrip/demo/switch/ are our own examples in a typical layout — not real exports (see its README).
  for (const [src, art, want] of [['mastertour', 'co', { shows: 6, people: 6, lines: 5, travel: 6, slots: 30 }], ['roadops', 'kes', { shows: 4, people: 4, guests: 3, rooms: 4, travel: 5, slots: 7 }]]) {
    try {
      S.role = 'manager'; S.artistId = 'all';
      const snap = () => JSON.stringify([DB.shows.length, Object.keys(DB.people).length, DB.travel.length, DB.slots.length, DB.guests.length, DB.showExp.length, DB.tasks.length, DB.imports.length]);
      const before = snap();
      openImportWizard({ source: src }); W.step = 1; W.defaultArtist = art; renderWizard(); await loadSamples();
      check(W.batch.length === SWITCH[src].samples.length, `${src}: read ${W.batch.length} of ${SWITCH[src].samples.length} example files`);
      check(W.batch.every(it => IMPORT_KINDS[it.kind].fields.filter(f => f[3]).every(f => it.map[f[0]] != null)), `${src}: a file's needed columns were not recognised (${W.batch.map(it => it.file.name + '→' + it.kind).join(', ')})`);
      if (src === 'roadops') { const ds = parseDaySheet(SWITCH.roadops.paste); check(ds && ds.data.length === 7 && ds.dsDate === '2027-07-13', 'Pasted day sheet was not read'); if (ds) W.batch.push(ds); }
      renderWizard(); check(!d.querySelector('[data-w="next"]').disabled, `${src}: Next is disabled with every file recognised`);
      const pv = runBatch(true);
      check(snap() === before, `${src}: the preview changed real data`);
      for (const [k, n] of Object.entries(want)) check(pv.counts[k] === n, `${src}: preview counted ${pv.counts[k]} ${k} (expected ${n})`);
      const res = runBatch(false); d.close();
      const mine = DB.shows.filter(x => x.src && x.artist === art);
      check(mine.length === want.shows && mine.every(x => x.status === 'confirmed' && /, [A-Z]{2}$/.test(x.city)), `${src}: shows did not come in as confirmed with "City, ST"`);
      check(Object.values(DB.people).filter(x => x.src).length === want.people && Object.values(DB.people).filter(x => x.src).every(x => x.kind === 'crew' && x.artists[0] === art), `${src}: team did not come in as crew on the chosen artist`);
      if (src === 'mastertour') {
        const vic = mine.find(x => /Victoria/.test(x.city));
        check(vic && DB.showExp.filter(e => e.show === vic.id).length === 5 && DB.showExp.filter(e => e.show === vic.id).reduce((a, e) => a + e.cents, 0) === 838000, 'Master Tour line items did not land on the right show in cents');
        check(vic && DB.slots.filter(x => x.show === vic.id).length === 5 && DB.travel.some(x => x.type === 'hotel' && x.name === 'Harbourview Inn' && x.checkIn === '2027-07-09'), 'Master Tour day-sheet times or hotel did not come in');
      } else {
        const wpg = mine.find(x => /Winnipeg/.test(x.city));
        const fl = DB.travel.find(x => x.type === 'flight' && x.src && x.conf === 'H2MZXD');
        check(fl && fl.from === 'YUL' && fl.to === 'YWG' && fl.dep === '09:40' && fl.arr === '11:35' && fl.flight === 'WS 579' && P(fl.who).name === 'Corinne Abel', 'RoadOps flight did not come in with route, times, confirmation and passenger');
        check(Object.values(DB.people).find(x => x.name === 'Ines Marchetti')?.room === '804' && DB.travel.some(x => x.type === 'hotel' && x.name === 'The Fort Garry Hotel' && x.checkOut === '2027-07-14'), 'RoadOps rooming list did not set rooms or the hotel');
        check(wpg && DB.slots.filter(x => x.show === wpg.id).length === 7 && DB.guests.filter(x => x.show === wpg.id).length === 3, 'RoadOps day sheet or guest list did not land on the Winnipeg show');
      }
      S.role = 'manager'; S.artistId = art; render('travel'); check(fits(), `${src}: Travel page with imported rows is wider than the screen`); render('party'); check(fits(), `${src}: Party page with imported people is wider than the screen`);
      while (DB.imports.length) undoImport(DB.imports[0].id);
      check(snap() === before, `${src}: undoing every import left data behind`);
    } catch (e) { failed.push(`${src} switch: crashed — ${e.message}`); if (d.open) d.close(); }
  }

  // 8. Export has every show for the current artist context, as spreadsheet rows.
  try { openExport('shows'); const rows = document.querySelector('#f-export').value.trim().split('\n'); check(rows.length === curShows().length + 1, `Export has ${rows.length - 1} rows (expected ${curShows().length})`); d.close(); } catch (e) { failed.push(`Export: crashed — ${e.message}`); if (d.open) d.close(); }

  // 9. Light and dark: text must be readable on its background on the busiest pages.
  // Browsers report colour-mix() backgrounds as `color(srgb r g b)` with 0–1 parts; plain colours as `rgb(0–255 …)`.
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return null; const scale = /^color\(/.test(c) ? 1 : 255; const [r, g, b] = m.slice(0, 3).map(Number).map(v => { v /= scale; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  // A mostly see-through tint (like the 'Now' row) isn't the real background: keep walking up to what's behind it.
  const alphaOf = bg => { const m = bg.match(/\/\s*([\d.]+)\s*\)$/) || bg.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/); return m ? +m[1] : 1; };
  const bgOf = el => { let e = el; while (e && e !== document.documentElement) { const bg = getComputedStyle(e).backgroundColor; if (bg && bg !== 'transparent' && alphaOf(bg) >= .5) return bg; e = e.parentElement; } return getComputedStyle(document.body).backgroundColor; };
  const contrast = el => { const L1 = lum(getComputedStyle(el).color), L2 = lum(bgOf(el)); if (L1 == null || L2 == null) return 21; const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1]; return (a + .05) / (b + .05); };
  for (const theme of ['light', 'dark']) {
    setTheme(theme); await wait(50);
    for (const [role, page] of [['manager', 'home'], ['manager', 'board'], ['artist', 'myhome'], ['tm', 'today'], ['manager', 'access'], ['manager', 'travel'], ['crew', 'travel'], ['crew', 'today']]) {
      S.role = role; S.artistId = 'jv'; render(page);
      const els = [...main.querySelectorAll('h1,h2,b,.muted,.small,.chip,.eyebrow,.btn,.note,td,th,label')].filter(e => e.offsetParent && e.textContent.trim());
      let low = 0; for (const e of els.slice(0, 160)) if (contrast(e) < 3) low++;
      check(low === 0, `${theme} mode · ${role} · ${page}: ${low} text element(s) hard to read against the background`);
    }
  }
  setTheme(startTheme);

  // 10. Theme toggle and storage are not relied on for the page to work.
  setTheme('dark'); check(document.documentElement.dataset.theme === 'dark', 'Dark mode did not apply'); setTheme(startTheme);

  // Back to a clean state for the person reading the screen.
  DB = seed(); try { save(); } catch {} S.role = 'manager'; S.artistId = null; S.showId = 'nyc'; S.showTab = ''; route();
  notes.push(`viewport ${innerWidth}×${innerHeight}`, `${roles.length} roles × ${contexts.length} artist contexts`);
  return { ok: failed.length === 0, passed: `${failed.length ? 'some checks failed' : 'all checks passed'}`, failed, notes };
})();
