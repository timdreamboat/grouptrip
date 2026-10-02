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
  S.role = 'venue'; S.showId = 'tor'; render('show'); check(S.showId === 'nyc', 'Venue can open a show that is not theirs');
  S.role = 'artist'; S.artistId = 'jv'; S.tourId = 't1'; render('tour'); check(!/Show fees|Deposits received/.test(txt()), 'Artist tour page shows money');
  render('myhome'); check(!/You.re bringing/.test(txt()), "Artist Home shows 'You're bringing' without a show in view");
  render('today'); check(/You.re bringing/.test(txt()), "Artist Today is missing 'You're bringing'");
  S.role = 'manager'; S.artistId = 'jv'; S.showId = 'nyc'; S.showTab = 'deal'; render('show'); check(/Guarantee/.test(txt()), 'Manager show page is missing the deal');

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
  if (open(() => E.supply(null, { person: 'nico' }), 'Add item to bring')) { set('label', 'QA cable'); await submit(); check(DB.supply.length === n0.supply + 1, 'Add item to bring did not save'); }
  if (open(() => E.budget(null, { tour: 't1' }), 'Add budget line')) { set('cat', 'QA line'); set('budget', '100'); await submit(); check(DB.budget.length === n0.budget + 1, 'Add budget line did not save'); }
  if (open(() => E.offer(null), 'Log offer')) { set('city', 'QA Town'); set('venue', 'QA Club'); await submit(); check(DB.offers.length === n0.offers + 1, 'Log offer did not save'); }
  const qaOffer = DB.offers.find(o => o.venue === 'QA Club'); if (qaOffer) { ACT.acceptOffer(qaOffer.id); check(DB.shows.some(s => s.venue === 'QA Club' && s.status === 'hold'), 'Accepting an offer did not create a hold'); }
  if (qaShow && open(() => E.show(qaShow.id), 'Edit show')) { const del = d.querySelector('[data-del]'); del.click(); del.click(); await wait(60); check(!DB.shows.some(s => s.id === qaShow.id), 'Delete show did not remove it'); check(!DB.tasks.some(t => t.show === qaShow.id), 'Deleting a show left its tasks behind'); }
  if (d.open) d.close();

  // 6. Non-management cannot reach management forms through the UI.
  S.role = 'crew'; S.artistId = 'jv'; render('party'); check(!main.querySelector('[data-act="person"]'), 'Crew can edit people');
  render('travel'); check(!main.querySelector('[data-act="newTravel"]'), 'Crew can add travel for everyone');
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
  } catch (e) { failed.push(`Import: crashed — ${e.message}`); if (d.open) d.close(); }

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
    for (const [role, page] of [['manager', 'home'], ['manager', 'board'], ['artist', 'myhome'], ['tm', 'today'], ['manager', 'access']]) {
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
