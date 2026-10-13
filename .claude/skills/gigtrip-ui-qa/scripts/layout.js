// GigTrip UI/UX layout harness. Paste into the preview browser's JavaScript tool
// with the mock open (local server, not file://), once per viewport width.
// Returns { ok, findings: ["role · page · theme · what looks wrong (where)"], checked }.
// It measures what a person notices but the functional harness can't: empty gaps,
// a control wrapped alone onto its own row, things overlapping, text cut off,
// empty cards, tap targets too small for a thumb, pictures that didn't load.
// Every check must hold on every page when the app is healthy, so a finding
// always means something to change (fix the page, or the check if it was wrong).
(async () => {
  const findings = new Set(), wait = ms => new Promise(r => setTimeout(r, ms));
  const main = document.querySelector('#main');
  const render = k => { S.page = k; main.innerHTML = V[k](); const h1 = main.querySelector('.head h1'); if (h1 && HELP[k]) h1.outerHTML = `<div class="titlerow">${h1.outerHTML}${helpBtn(k)}</div>`; };
  const rect = e => e.getBoundingClientRect();
  // Visible = laid out, not inside a closed accordion (its contents report stale boxes), not screen-reader-only.
  const vis = e => { if (e.offsetParent === null || getComputedStyle(e).visibility === 'hidden' || e.classList.contains('sr')) return false; const d = e.closest('details:not([open])'); if (d && !(e.matches('summary') || e.closest('summary')) ) return false; const r = rect(e); return r.width > 0 && r.height > 0; };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const phone = innerWidth < 760;
  const startTheme = THEME, startRole = S.role, startArtist = S.artistId;
  DB = seed(); try { save(); } catch {}
  let checked = 0;

  const inspect = (tag) => {
    const add = m => findings.add(`${tag} · ${m}`);
    // 1. Wider than the screen.
    if (main.scrollWidth > main.clientWidth + 1) add('page is wider than the screen');
    // 2. Empty vertical gaps between neighbours (not a deliberate section break).
    const walk = el => {
      const kids = [...el.children].filter(c => vis(c) && getComputedStyle(c).position !== 'absolute' && getComputedStyle(c).position !== 'fixed');
      for (let i = 1; i < kids.length; i++) { const g = rect(kids[i]).top - rect(kids[i - 1]).bottom; if (g > 56) add(`${Math.round(g)}px empty gap between "${name(kids[i - 1])}" and "${name(kids[i])}"`); }
      kids.forEach(walk);
    };
    walk(main);
    // 3. A wrapping row whose last line holds only a small control (an orphaned pencil, a lone chip).
    for (const box of main.querySelectorAll('*')) {
      const cs = getComputedStyle(box); if (cs.display !== 'flex' || cs.flexWrap !== 'wrap' || !vis(box)) continue;
      const items = [...box.children].filter(c => vis(c) && rect(c).width > 0); if (items.length < 2) continue;
      // Items share a row when they overlap vertically (bottom-aligned rows count as one row).
      const rows = []; for (const it of items) { const r = rect(it); const row = rows.find(x => r.top < x.bottom - 2 && r.bottom > x.top + 2); if (row) { row.items.push(it); row.w += r.width; row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom, items: [it], w: r.width }); }
      if (rows.length < 2) continue;
      const last = rows[rows.length - 1], bw = rect(box).width;
      // An icon-sized control (a pencil, a ×) alone on the last row is the tell-tale of a note or label pushing it off its row.
      if (last.items.length === 1 && last.w < 48 && last.w < bw * .2 && last.items[0].matches('button, a')) add(`"${name(last.items[0])}" wrapped alone onto its own row in "${(box.className || box.tagName).toString().slice(0, 30)}"`);
    }
    // 4. Controls on top of other controls.
    const ctl = [...main.querySelectorAll('button, a, input, select, textarea, summary')].filter(vis).map(e => ({ e, r: rect(e) })).filter(x => x.r.width > 0 && x.r.height > 0);
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i], b = ctl[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 4 && oy > 4) add(`"${name(a.e)}" overlaps "${name(b.e)}"`);
    }
    // 5. Text cut off without an ellipsis.
    for (const e of main.querySelectorAll('h1, h2, h3, b, p, span, td, th, div')) {
      if (!vis(e) || e.children.length) continue; const cs = getComputedStyle(e);
      if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim()) add(`text cut off: "${name(e)}"`);
    }
    // 6. Cards or sections with nothing in them.
    for (const e of main.querySelectorAll('.card, section, article')) if (vis(e) && rect(e).height > 40 && !e.textContent.trim() && !e.querySelector('img, svg, iframe')) add(`empty box: ${(e.className || e.tagName).toString().slice(0, 30)}`);
    // 7. Tap targets a thumb can't hit (phone only; inline text links excepted).
    // A checkbox's target is its label (the whole row), so measure that.
    const target = e => { if (e.matches('input[type=checkbox]')) { const l = e.closest('label') || (e.id && main.querySelector(`label[for="${CSS.escape(e.id)}"]`)); if (l) { const a = rect(e), b = rect(l); return { width: Math.max(a.right, b.right) - Math.min(a.left, b.left), height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) }; } } return rect(e); };
    if (phone) for (const e of main.querySelectorAll('button, [role=button], input[type=checkbox], summary')) { if (!vis(e) || e.disabled) continue; const r = target(e); if (r.height < 28 || r.width < 28) add(`tap target ${Math.round(r.width)}×${Math.round(r.height)} too small: "${name(e)}"`); }
    // 8. Pictures that didn't load.
    for (const i of main.querySelectorAll('img')) if (i.complete && i.naturalWidth === 0 && i.src) add(`picture did not load: ${i.getAttribute('src').slice(0, 60)}`);
    // 9. Two columns where one is much taller than the other (leaves a block of empty space on desktop).
    if (!phone) for (const g of main.querySelectorAll('.grid2')) { const [l, r] = [...g.children].map(c => c && rect(c).height); if (l && r && Math.max(l, r) > 600 && Math.max(l, r) > 1.8 * Math.min(l, r)) add(`columns unbalanced (${Math.round(l)}px vs ${Math.round(r)}px) — a block of empty space under the short one`); }
    // 10. Something sits under the phone tab bar at the end of the page.
    if (phone) { main.scrollTop = main.scrollHeight; const bar = document.querySelector('.tabbar'); const last = [...main.children].filter(vis).pop(); if (bar && last && rect(last).bottom > rect(bar).top + 2) add('last element hides under the tab bar'); main.scrollTop = 0; }
    checked++;
  };

  const contexts = ['all', 'jv'];
  for (const theme of ['dark', 'light']) {
    setTheme(theme); await wait(30);
    for (const r of Object.keys(ME)) {
      S.role = r;
      for (const a of contexts) {
        S.artistId = a; S.showId = 'nyc'; S.showTab = ''; S.tourId = 't1'; S.seasonView = 'list';
        const pages = navFor().map(n => n[0]).filter(k => k !== 'more');
        for (const k of pages) { try { render(k); inspect(`${r} · ${a} · ${k} · ${theme}`); } catch (e) { findings.add(`${r} · ${a} · ${k} · ${theme} · crashed: ${e.message}`); } }
        if (pages.includes('show')) for (const t of showTabs()) { S.showTab = t[0]; try { render('show'); inspect(`${r} · ${a} · show›${t[0]} · ${theme}`); } catch (e) { findings.add(`${r} · ${a} · show›${t[0]} · ${theme} · crashed: ${e.message}`); } }
      }
    }
  }
  setTheme(startTheme); S.role = startRole; S.artistId = startArtist; S.showTab = ''; DB = seed(); try { save(); } catch {} route();
  // One line per distinct problem (first place it was seen + how many places), so the report stays readable.
  const byMsg = new Map(); for (const f of findings) { const i = f.lastIndexOf(' · '); const msg = f.slice(i + 3).replace(/\d+px/g, 'Npx'); const cur = byMsg.get(msg); if (cur) cur.places++; else byMsg.set(msg, { first: f, places: 1 }); }
  const list = [...byMsg.values()].sort((a, b) => b.places - a.places).map(x => `${x.first}${x.places > 1 ? ` (+${x.places - 1} more places)` : ''}`);
  return { ok: list.length === 0, viewport: `${innerWidth}×${innerHeight}`, checked, distinct: list.length, findings: list.slice(0, 60) };
})();
