(() => {
'use strict';

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const pct0 = (x) => Math.round(x * 100) + '%';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  if (!res.ok) throw { status: res.status, data: data || {} };
  return data;
}

const FLAG_SHORT = { early_accident: 'Early accident', recent_move: 'Recent move' };
const state = {
  schema: null, model: null, batch: null, sample: null,
  capacity: 0.10, showOutcomes: false, filter: 'All', query: '', shown: 100,
  decisions: new Map(), problems: null, notice: null, error: null, animate: false,
};
const bandOf = (share, c = state.capacity) => (share <= c ? 'High' : share <= 3 * c ? 'Medium' : 'Low');

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------- review capacity: what a review share should find ---------- */
function expectedCatch(c) {
  const pts = [{ share: 0, recall: 0, lo: 0, hi: 0 }, ...state.model.capacity_curve];
  for (let i = 1; i < pts.length; i++) {
    if (c <= pts[i].share) {
      const a = pts[i - 1], b = pts[i], t = (c - a.share) / (b.share - a.share);
      return { recall: a.recall + t * (b.recall - a.recall), lo: a.lo + t * (b.lo - a.lo), hi: a.hi + t * (b.hi - a.hi) };
    }
  }
  return pts[pts.length - 1];
}

/* ---------- router ---------- */
const PAGES = {
  queue: { title: 'Claims queue', render: renderQueue },
  assess: { title: 'Assess a claim', render: renderAssess },
  model: { title: 'Model and limits', render: renderModel },
  decisions: { title: 'Decisions', render: renderDecisions },
};
function route() {
  closeCase(true);
  const key = (location.hash || '#queue').slice(1);
  const page = PAGES[key] || PAGES.queue;
  const active = PAGES[key] ? key : 'queue';
  document.querySelectorAll('.spine-nav a').forEach((a) => {
    if (a.dataset.page === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = page.title + ' | Claim Triage';
  const view = $('#view');
  view.replaceChildren();
  page.render(view);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function pageHead(title, note) {
  return h('header', { class: 'head' }, h('h1', { text: title }), note ? h('p', { class: 'margin', text: note }) : null);
}

/* =====================================================================
   QUEUE
   ===================================================================== */
function renderQueue(root) {
  root.append(pageHead('Claims queue', 'The riskiest claims come first. A rank is a reason to look at a claim, not a finding about it.'));
  if (state.error) root.append(errorBanner(state.error));
  if (!state.batch) { root.append(startBlock()); return; }
  if (state.notice) root.append(state.notice);
  buildQueue(root);
}

function startBlock() {
  return h('section', { class: 'start' },
    h('p', { class: 'lead', text: 'Load a batch of claims and start at the top of the list.' }),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => $('#file').click(), text: 'Upload a CSV' }),
      h('button', { class: 'btn quiet', onclick: loadSample, text: 'Try 400 sample claims' }),
      h('a', { class: 'link', href: '/api/template.csv', text: 'Download the CSV template' })),
    h('p', { class: 'fine' },
      'Each claim gets a score, a rank, a band and the reasons behind it. The sample claims are historical ones the model never saw during training, so you can check the ranking against what really happened. You can also drop a CSV file anywhere on this page.'));
}

function errorBanner(err) {
  const d = err.data || {};
  const p = d.problems || {};
  let title = 'This file could not be used', body = d.message || 'Check the file and try again.';
  if (d.error === 'missing_columns') {
    title = 'Some columns are missing';
    body = `Add these columns and upload again: ${p.missing_columns.join(', ')}. The template shows the expected layout.`;
  } else if (d.error === 'no_valid_rows') {
    title = 'No claims could be scored';
    body = (p.skipped && p.skipped[0] ? p.skipped[0].reason : 'Every row has a missing or invalid value') + '. Fix the values and upload again.';
  }
  return h('div', { class: 'banner', role: 'alert' }, h('strong', { text: title }), h('span', { text: body }),
    ' ', h('a', { class: 'link', href: '/api/template.csv', text: 'Download template' }));
}

function problemNotice(problems) {
  if (!problems) return null;
  const parts = [];
  if (problems.skipped && problems.skipped.length) {
    const first = problems.skipped.slice(0, 3).map((x) => `${x.claim_id} (${x.reason})`).join('; ');
    parts.push(`${problems.skipped.length} claim${problems.skipped.length > 1 ? 's were' : ' was'} skipped: ${first}${problems.skipped.length > 3 ? ' and more' : ''}.`);
  }
  const uv = Object.entries(problems.unseen_values || {});
  if (uv.length) parts.push('Values the model has not seen before are scored with less certainty: ' + uv.map(([k, v]) => `${k} (${v.join(', ')})`).join('; ') + '.');
  if (!parts.length) return null;
  return h('div', { class: 'banner note', role: 'status' }, h('strong', { text: 'Check these before relying on the ranking' }), parts.join(' '));
}

async function loadSample() {
  try {
    state.error = null;
    const data = state.sample || (state.sample = await api('/api/sample'));
    adoptBatch(data);
  } catch (e) { state.error = e; route(); }
}
async function uploadFile(file) {
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    state.error = null;
    const data = await api('/api/batch', { method: 'POST', body: fd });
    adoptBatch(data);
  } catch (e) { state.error = e; state.batch = null; location.hash = '#queue'; route(); }
}
function adoptBatch(data) {
  state.batch = data; state.filter = 'All'; state.query = ''; state.shown = 100; state.animate = true;
  state.showOutcomes = false;
  state.notice = problemNotice(data.problems);
  location.hash = '#queue'; route();
}
$('#file').addEventListener('change', (e) => { uploadFile(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) uploadFile(f); });

/* ---- queue body ---- */
const q = {};
function buildQueue(root) {
  const claims = state.batch.claims;
  const n = claims.length;

  q.big = h('div', { class: 'fig-big' });
  q.cap = h('p', { class: 'fig-cap' });
  q.sub = h('p', { class: 'fig-sub' });
  q.canvas = h('canvas', { 'aria-label': 'Chart of every claim in the batch from highest to lowest score', role: 'img' });
  q.edgeH = h('div', { class: 'edge' });
  q.edgeM = h('div', { class: 'edge med' });
  q.handle = h('button', { class: 'handle', type: 'button', 'aria-label': 'Drag to change how many claims are High risk' });
  q.plot = h('div', { class: 'plot' }, q.canvas, q.edgeH, q.edgeM, q.handle);
  q.keyH = h('span', { class: 'h', text: 'High' }); q.keyM = h('span', { class: 'm', text: 'Medium' }); q.keyL = h('span', { class: 'l', text: 'Low' });
  q.bandkey = h('div', { class: 'bandkey' }, q.keyH, q.keyM, q.keyL);
  q.range = h('input', { type: 'range', id: 'cap', min: '5', max: '25', step: '1', value: String(Math.round(state.capacity * 100)) });
  q.out = h('output', { for: 'cap' });
  syncSlider(q.range.value);

  const hero = h('section', { class: 'hero', 'aria-label': 'Batch summary' },
    h('div', { class: 'figs' }, q.big, q.cap, q.sub),
    h('div', { class: 'spectrum' },
      h('h2', { text: 'Every claim in the batch, highest score first' }),
      q.plot, q.bandkey,
      h('div', { class: 'axis' }, h('span', { text: 'Highest score' }), h('span', { text: `${n.toLocaleString()} claims` }), h('span', { text: 'Lowest score' })),
      h('div', { class: 'capacity' },
        h('label', { for: 'cap', text: 'How many claims can your team review?' }),
        q.range, q.out)));
  root.append(hero);

  q.range.addEventListener('input', () => { syncSlider(q.range.value); setCapacity(q.range.value / 100); });
  bindHandle();

  // tools
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter by band' },
    ...['All', 'High', 'Medium', 'Low'].map((b) => h('button', { type: 'button', 'data-f': b, 'aria-pressed': String(state.filter === b), onclick: () => { state.filter = b; state.shown = 100; refreshTable(); syncTabs(); } }, b)));
  q.tabs = tabs;
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Find a claim ID', 'aria-label': 'Find a claim ID', value: state.query });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); state.shown = 100; refreshTable(); });
  const right = h('div', { class: 'right' }, search);
  if (state.batch.has_outcomes) {
    const cb = h('input', { type: 'checkbox', id: 'outcomes' });
    cb.checked = state.showOutcomes;
    cb.addEventListener('change', () => { state.showOutcomes = cb.checked; draw(1); refreshTable(); updateText(); });
    right.append(h('label', { class: 'check', for: 'outcomes' }, cb, 'Show known outcomes (demo data)'));
  }
  right.append(h('button', { class: 'link', type: 'button', onclick: exportRanked, text: 'Download ranked list' }));
  right.append(h('button', { class: 'link', type: 'button', onclick: () => $('#file').click(), text: 'Load another file' }));
  root.append(h('div', { class: 'tools' }, tabs, right));

  q.table = h('table', { class: 'q' });
  q.more = h('p', { class: 'more' });
  root.append(q.table, q.more);

  assignBands(); updateAll(true);
  addEventListener('resize', onResize);
}
function onResize() { if (q.canvas && q.canvas.isConnected) draw(1); }
function syncTabs() { q.tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === state.filter))); }

function assignBands() { for (const c of state.batch.claims) c.band = bandOf(c.top_share); }
function counts() {
  const k = { High: 0, Medium: 0, Low: 0 };
  for (const c of state.batch.claims) k[c.band]++;
  return k;
}
function syncSlider(val) {
  if (!q.range) return;
  const v = val != null ? val : q.range.value;
  q.range.style.setProperty('--control-value', v);
  q.range.style.setProperty('--attr-min', q.range.min || '5');
  q.range.style.setProperty('--attr-max', q.range.max || '25');
}
function setCapacity(c) {
  state.capacity = clamp(Math.round(c * 100) / 100, 0.05, 0.25);
  q.range.value = String(Math.round(state.capacity * 100));
  syncSlider(q.range.value);
  assignBands(); updateAll(false);
}
function updateAll(first) {
  updateText(); positionEdges(); draw(first && state.animate && !reduceMotion ? 0 : 1); refreshTable(); state.animate = false;
}
function updateText() {
  const n = state.batch.claims.length, k = counts(), c = state.capacity, e = expectedCatch(c);
  q.big.textContent = k.High.toLocaleString();
  q.cap.textContent = `claims in the High band, out of ${n.toLocaleString()}. Review these first.`;
  q.out.textContent = Math.round(c * 100) + '%';
  q.sub.replaceChildren(
    'Reviewing the top ', h('strong', { text: Math.round(c * 100) + '%' }), ' by score should find about ',
    h('strong', { text: pct0(e.recall) }), ` of all frauds (likely range ${pct0(e.lo)} to ${pct0(e.hi)}). Reviewing the same number at random would find ${Math.round(c * 100)}%.`);
  if (state.showOutcomes && state.batch.has_outcomes) {
    const fr = state.batch.claims.filter((x) => x.outcome === 'Yes');
    const inHigh = fr.filter((x) => x.band === 'High').length;
    q.sub.append(h('span', { text: ` In this sample, ${inHigh} of the ${fr.length} known frauds are in the High band.` }));
  }
}
function positionEdges() {
  const n = state.batch.claims.length, k = counts();
  const xh = (k.High / n) * 100, xm = ((k.High + k.Medium) / n) * 100;
  q.edgeH.style.left = xh + '%'; q.edgeM.style.left = xm + '%';
  q.handle.style.left = xh + '%';
  q.keyH.style.left = '0'; q.keyM.style.left = `calc(${xh}% + 8px)`; q.keyL.style.left = `calc(${xm}% + 8px)`;
  q.keyH.textContent = xh > 7 ? 'High' : 'High'; q.keyM.style.display = (xm - xh) > 9 ? '' : 'none'; q.keyL.style.display = (100 - xm) > 6 ? '' : 'none';
}
function bindHandle() {
  let drag = false;
  const move = (ev) => {
    if (!drag) return;
    const r = q.plot.getBoundingClientRect();
    const f = clamp((ev.clientX - r.left) / r.width, 0, 1), cl = state.batch.claims;
    const idx = Math.min(cl.length - 1, Math.round(f * cl.length));
    setCapacity(cl[idx].top_share);
  };
  q.handle.addEventListener('pointerdown', (ev) => { drag = true; q.handle.setPointerCapture(ev.pointerId); });
  q.handle.addEventListener('pointermove', move);
  q.handle.addEventListener('pointerup', () => { drag = false; });
  q.handle.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { setCapacity(state.capacity - 0.01); ev.preventDefault(); }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { setCapacity(state.capacity + 0.01); ev.preventDefault(); }
  });
}
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
let rafId;
function draw(progress) {
  cancelAnimationFrame(rafId);
  const cv = q.canvas, dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const cl = state.batch.claims, n = cl.length, max = cl[0].score || 1;
  const col = { High: cssVar('--high'), Medium: cssVar('--med'), Low: cssVar('--muted-tick') }, gold = cssVar('--gold');
  const bw = W / n;
  const paint = (t) => {
    ctx.clearRect(0, 0, W, H);
    const ease = 1 - Math.pow(1 - t, 3);
    for (let i = 0; i < n; i++) {
      const c = cl[i];
      const hh = Math.max(2, (c.score / max) * (H - 26)) * ease;
      ctx.fillStyle = col[c.band];
      const x = i * bw, w = bw > 3 ? bw - 1 : Math.max(bw, 1);
      ctx.fillRect(x, H - hh, w, hh);
    }
    if (state.showOutcomes && state.batch.has_outcomes && t >= 1) {
      ctx.fillStyle = gold;
      for (let i = 0; i < n; i++) {
        if (cl[i].outcome !== 'Yes') continue;
        const hh = Math.max(2, (cl[i].score / max) * (H - 26));
        const x = i * bw + bw / 2, y = H - hh - 9;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
      }
    }
  };
  if (progress >= 1) { paint(1); return; }
  const t0 = performance.now();
  const step = (now) => { const t = Math.min(1, (now - t0) / 700); paint(t); if (t < 1) rafId = requestAnimationFrame(step); };
  rafId = requestAnimationFrame(step);
}

function visibleClaims() {
  return state.batch.claims.filter((c) => (state.filter === 'All' || c.band === state.filter) && (!state.query || c.id.toLowerCase().includes(state.query)));
}
function refreshTable() {
  const list = visibleClaims(), show = list.slice(0, state.shown), demo = state.showOutcomes && state.batch.has_outcomes;
  const head = h('thead', {}, h('tr', {},
    h('th', { scope: 'col', text: 'Rank' }), h('th', { scope: 'col', text: 'Claim' }), h('th', { scope: 'col', text: 'Score' }),
    h('th', { scope: 'col', text: 'Band' }), h('th', { scope: 'col', text: 'Main reasons' }), h('th', { scope: 'col', text: 'Rule flags' }),
    demo ? h('th', { scope: 'col', text: 'Outcome' }) : null, h('th', { scope: 'col', text: 'Decision' })));
  const body = h('tbody');
  for (const c of show) {
    const why = c.reasons.filter((r) => r.direction === 'raises').slice(0, 2).map((r) => `${r.label}: ${r.value}`).join('; ');
    const dec = state.decisions.get(c.id);
    const tr = h('tr', { tabindex: '0', 'aria-label': `Claim ${c.id}, rank ${c.rank}, ${c.band} band. Open details.` },
      h('td', { class: 'rank', text: c.rank }), h('td', { class: 'id', text: c.id }), h('td', { class: 'score', text: pct(c.score) }),
      h('td', {}, h('span', { class: 'band ' + c.band }, h('i'), c.band)),
      h('td', { class: 'why', text: why || 'No single strong factor' }),
      h('td', { class: 'flags', text: c.flags.map((f) => FLAG_SHORT[f.id] || f.title).join(', ') }),
      demo ? h('td', { class: c.outcome === 'Yes' ? 'out-yes' : '', text: c.outcome === 'Yes' ? 'Fraud' : 'Not fraud' }) : null,
      h('td', { class: 'dec', text: dec ? dec.decision : '' }));
    tr.addEventListener('click', () => openCase(c.id, tr));
    tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openCase(c.id, tr); } });
    body.append(tr);
  }
  q.table.replaceChildren(head, body);
  q.more.replaceChildren();
  if (!list.length) q.more.append('No claims match this filter.');
  else if (list.length > show.length) q.more.append(h('button', { class: 'btn quiet', type: 'button', onclick: () => { state.shown += 200; refreshTable(); }, text: `Show more (${(list.length - show.length).toLocaleString()} left)` }));
}

function exportRanked() {
  const rows = [['rank', 'claim_id', 'score', 'band', 'main_reasons', 'rule_flags', 'decision']];
  for (const c of state.batch.claims) {
    const dec = state.decisions.get(c.id);
    rows.push([c.rank, c.id, c.score.toFixed(4), c.band, c.reasons.filter((r) => r.direction === 'raises').slice(0, 3).map((r) => `${r.label}: ${r.value}`).join('; '), c.flags.map((f) => f.title).join('; '), dec ? dec.decision : '']);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'ranked_claims.csv' });
  document.body.append(a); a.click(); a.remove();
  toast('Ranked list downloaded');
}

/* =====================================================================
   CASE PANEL
   ===================================================================== */
let lastOpener = null;
function openCase(id, opener) {
  lastOpener = opener || lastOpener;
  const list = state.batch.claims;
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return;
  const c = list[i], panel = $('#case');
  const dec = state.decisions.get(c.id);
  const note = h('textarea', { id: 'note', maxlength: '1000', placeholder: 'What did you check, and what did you find?' });
  note.value = dec ? dec.note || '' : '';
  const saved = h('span', { class: 'saved', 'aria-live': 'polite' });
  let choice = dec ? dec.decision : '';
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Decision' },
    ...['Under review', 'Cleared', 'Escalated'].map((d) => {
      const r = h('input', { type: 'radio', name: 'decision', value: d });
      r.checked = d === choice;
      r.addEventListener('change', () => { choice = d; });
      return h('label', {}, r, h('span', { text: d }));
    }));
  const save = h('button', { class: 'btn', type: 'button', text: 'Save decision', onclick: async () => {
    if (!choice) { toast('Pick a decision first'); return; }
    try {
      await api('/api/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim_id: c.id, decision: choice, note: note.value, score: c.score }) });
      state.decisions.set(c.id, { claim_id: c.id, decision: choice, note: note.value, score: c.score });
      saved.textContent = 'Saved'; if (q.table && q.table.isConnected) refreshTable();
    } catch (e) { toast((e.data && e.data.message) || 'Could not save. Try again.'); }
  } });
  const clear = dec ? h('button', { class: 'link', type: 'button', style: 'margin-left:14px', text: 'Remove decision', onclick: async () => {
    await api('/api/decisions/' + encodeURIComponent(c.id), { method: 'DELETE' });
    state.decisions.delete(c.id); if (q.table && q.table.isConnected) refreshTable(); openCase(c.id);
  } }) : null;

  const fields = h('dl', { class: 'fields' });
  for (const f of state.schema.schema) fields.append(h('dt', { text: f.label }), h('dd', { text: String(c.fields[f.name]) }));

  panel.replaceChildren(
    h('div', { class: 'top' },
      h('div', {}, h('h2', { id: 'case-title', tabindex: '-1', text: 'Claim ' + c.id }),
        h('p', { class: 'where', text: `Rank ${c.rank} of ${list.length.toLocaleString()}` })),
      h('div', { class: 'nav' },
        h('button', { class: 'link', type: 'button', disabled: i === 0, onclick: () => openCase(list[i - 1].id), text: 'Previous' }),
        h('button', { class: 'link', type: 'button', disabled: i === list.length - 1, onclick: () => openCase(list[i + 1].id), text: 'Next' }),
        h('button', { class: 'link', type: 'button', onclick: () => closeCase(), text: 'Close' }))),
    scoreSection(c), reasonsSection(c), flagsSection(c),
    state.showOutcomes && c.outcome ? h('p', { class: 'demo-out', text: `Historical outcome (demo data): ${c.outcome === 'Yes' ? 'this claim was fraud' : 'this claim was not fraud'}.` }) : null,
    h('section', { class: 'sect' }, h('h3', { text: 'Your decision' }), seg, note, h('p', { style: 'margin-top:14px' }, save, clear, saved)),
    h('section', { class: 'sect' }, h('details', {}, h('summary', { text: 'All claim details' }), fields)));
  panel.hidden = false; $('#scrim').hidden = false;
  panel.scrollTop = 0;
  $('#case-title').focus();
  document.body.style.overflow = 'hidden';
}
function closeCase(silent) {
  const p = $('#case');
  if (p.hidden) return;
  p.hidden = true; $('#scrim').hidden = true; document.body.style.overflow = '';
  if (!silent && lastOpener && lastOpener.isConnected) lastOpener.focus();
}
$('#scrim').addEventListener('click', () => closeCase());
addEventListener('keydown', (ev) => {
  const p = $('#case');
  if (p.hidden) return;
  if (ev.key === 'Escape') { closeCase(); return; }
  if (ev.key === 'Tab') {
    const f = [...p.querySelectorAll('button:not([disabled]), input, textarea, summary, a[href]')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === $('#case-title'))) { last.focus(); ev.preventDefault(); }
    else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
  }
});

/* ---- shared claim sections (case panel and assess page) ---- */
function scoreSection(c) {
  const band = bandOf(c.top_share), cap = state.capacity;
  const hi = cap * 100, med = cap * 200;
  const topText = c.top_share < 0.01 ? 'the top 1%' : `the top ${Math.max(1, Math.round(c.top_share * 100))}%`;
  return h('section', { class: 'sect' },
    h('div', { class: 'score-line' },
      h('div', { class: 'score-big', text: pct(c.score) }),
      h('span', { class: 'band ' + band }, h('i'), band + ' risk')),
    h('p', { class: 'score-note', text: `Among comparable past claims, the model expects about ${Math.max(1, Math.round(c.score * 100))} in 100 to have been fraud. The overall rate is ${pct0(state.schema.base_rate)}. This claim scores in ${topText} of past claims.` + (c.score > 0.25 ? ' Scores this high are rare, so trust the rank more than the exact figure.' : '') }),
    h('div', { class: 'meter', role: 'img', 'aria-label': `Position among past claims: ${topText}` },
      h('span', { class: 'mh', style: `width:${hi}%` }), h('span', { class: 'mm', style: `width:${med}%` }), h('span', { class: 'ml', style: `flex:1` }),
      h('b', { style: `left:${clamp(c.top_share * 100, 0.4, 99.6)}%` })),
    h('div', { class: 'meter-cap' }, h('span', { text: 'Riskiest past claims' }), h('span', { text: 'Least risky' })));
}
function reasonsSection(c) {
  const max = Math.max(0.01, ...c.reasons.map((r) => Math.abs(r.effect)));
  return h('section', { class: 'sect' },
    h('h3', { text: 'What drives this score' }),
    c.reasons.length ? h('ul', { class: 'reasons' }, ...c.reasons.map((r) =>
      h('li', {},
        h('div', { class: 't' }, `${r.label}: ${r.value}`, h('small', { text: r.direction === 'raises' ? 'Raises the score' : 'Lowers the score' })),
        h('div', { class: 'diverge', 'aria-hidden': 'true' }, h('i', { class: r.direction === 'raises' ? 'up' : 'down', style: `width:${(Math.abs(r.effect) / max) * 50}%` }))))) : h('p', { text: 'No single factor stands out for this claim.' }),
    h('p', { class: 'fine-print', text: 'These show what the model relied on. They are not proof of what caused a claim to be fraudulent.' }));
}
function flagsSection(c) {
  return h('section', { class: 'sect' },
    h('h3', { text: 'Simple checks' }),
    c.flags.length ? h('ul', { class: 'flag-list' }, ...c.flags.map((f) => h('li', {}, h('strong', { text: f.title }), `. Among ${f.claims.toLocaleString()} past claims like this, ${pct0(f.fraud_rate)} were fraud, against ${pct0(state.schema.base_rate)} overall.`)))
      : h('p', { text: 'None of the two plain checks apply to this claim. They cover only early accidents and recent address changes.' }));
}

/* =====================================================================
   ASSESS
   ===================================================================== */
const GROUPS = [
  ['Policy', ['PolicyType', 'BasePolicy', 'Deductible', 'PastNumberOfClaims', 'NumberOfCars', 'AgentType', 'Days:Policy-Accident', 'Days:Policy-Claim', 'AddressChange-Claim']],
  ['Vehicle', ['Make', 'VehicleCategory', 'VehiclePrice', 'AgeOfVehicle']],
  ['Accident', ['Month', 'WeekOfMonth', 'DayOfWeek', 'AccidentArea', 'PoliceReportFiled', 'WitnessPresent']],
  ['Reporting', ['MonthClaimed', 'WeekOfMonthClaimed', 'DayOfWeekClaimed']],
];
let assessTimer, assessSeq = 0;
function renderAssess(root) {
  root.append(pageHead('Assess a claim', 'Enter the details known when the claim arrives. The score updates as you change a value.'));
  const byName = Object.fromEntries(state.schema.schema.map((f) => [f.name, f]));
  const selects = {};
  const result = h('div', { class: 'result', 'aria-live': 'polite' }, h('p', { class: 'empty', text: 'Scoring…' }));
  const form = h('form', { onsubmit: (e) => e.preventDefault() });
  for (const [title, names] of GROUPS) {
    const grid = h('div', { class: 'grid2' });
    for (const nme of names) {
      const f = byName[nme];
      const sel = h('select', { id: 'f-' + nme }, ...f.options.map((o) => h('option', { value: String(o), text: String(o) })));
      sel.value = String(state.schema.defaults[nme]);
      sel.addEventListener('change', schedule);
      selects[nme] = sel;
      grid.append(h('div', { class: 'field' }, h('label', { for: 'f-' + nme, text: f.label }), sel));
    }
    form.append(h('fieldset', {}, h('legend', { text: title }), grid));
  }
  const fill = async () => {
    const data = state.sample || (state.sample = await api('/api/sample'));
    const top = data.claims[0].fields;
    for (const k of Object.keys(selects)) selects[k].value = String(top[k]);
    schedule();
  };
  const reset = () => { for (const k of Object.keys(selects)) selects[k].value = String(state.schema.defaults[k]); schedule(); };
  root.append(h('div', { class: 'row', style: 'margin:-14px 0 30px' },
    h('button', { class: 'btn quiet', type: 'button', onclick: fill, text: 'Fill with the highest-scoring sample claim' }),
    h('button', { class: 'link', type: 'button', onclick: reset, text: 'Reset to the most common values' })));
  root.append(h('div', { class: 'assess' }, form, result));

  function schedule() { clearTimeout(assessTimer); assessTimer = setTimeout(run, 220); }
  async function run() {
    const seq = ++assessSeq;
    const claim = { ClaimID: 'Entered claim' };
    for (const f of state.schema.schema) claim[f.name] = f.type === 'num' ? Number(selects[f.name].value) : selects[f.name].value;
    try {
      const data = await api('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim }) });
      if (seq !== assessSeq) return;
      const c = data.claim;
      result.replaceChildren(h('h2', { style: 'font:400 21px/1.3 var(--serif);color:var(--sov)', text: 'Assessment' }), scoreSection(c), reasonsSection(c), flagsSection(c));
    } catch (e) {
      result.replaceChildren(h('div', { class: 'banner', role: 'alert' }, h('strong', { text: 'Could not score this claim' }), (e.data && e.data.message) || 'Check the values and try again.'));
    }
  }
  run();
}

/* =====================================================================
   MODEL
   ===================================================================== */
function renderModel(root) {
  const m = state.model, ho = m.holdout, cv = m.cv;
  root.append(pageHead('How far to trust this', 'Built on public claims from 1994 to 1996. These figures show how the method behaves, not how it would perform at an insurer.'));
  const wrap = h('div', { class: 'model' });
  root.append(wrap);

  wrap.append(h('section', {},
    h('p', { class: 'big', text: 'The model ranks claims better than chance, but the signal is weak.' }),
    h('div', { class: 'kv' },
      h('div', {}, h('div', { class: 'n', text: pct0(ho.recall10) }), h('div', { class: 'l' }, `of frauds found in the top 10% of claims. Likely range ${pct0(ho.recall10_ci[0])} to ${pct0(ho.recall10_ci[1])}.`, h('small', { text: `Tested once on ${ho.claims.toLocaleString()} unseen claims. Random review finds 10%.` }))),
      h('div', {}, h('div', { class: 'n', text: cv.model.pr_auc.mean.toFixed(2) }), h('div', { class: 'l' }, 'PR-AUC in cross-validation.', h('small', { text: `Plus or minus ${cv.model.pr_auc.sd.toFixed(2)}. Random ranking scores ${m.base_rate.toFixed(2)}.` }))),
      h('div', {}, h('div', { class: 'n', text: cv.shuffled.pr_auc.mean.toFixed(2) }), h('div', { class: 'l' }, 'PR-AUC when fraud labels are shuffled.', h('small', { text: 'It falls to chance, so the result is not leaking the answer.' })))),
    h('p', { text: `Accuracy is not reported because about ${Math.round((1 - m.base_rate) * 100)}% of claims are honest, so calling every claim honest would already score that high and find no fraud.` })));

  wrap.append(h('section', {}, h('h2', { text: 'What reviewing more claims finds' }),
    h('p', { text: 'The curve shows the share of all frauds found as the team reviews more of the list, highest score first. The shaded band is the likely range and the dashed line is a random review. It uses cross-validated scores on the 12,336 training claims, so it can differ a little from the single test above.' }),
    capacityChart(m.capacity_curve)));

  wrap.append(h('section', {}, h('h2', { text: 'Are the scores honest numbers?' }),
    h('p', { text: 'Each point is a tenth of past claims, grouped by score. Points near the diagonal mean the score matches how often those claims were fraud. The model is well calibrated up to about 17%. Higher scores are too rare to check.' }),
    calibrationChart(m.calibration)));

  const fair = m.fairness;
  const rows = fair.map((f) => h('tr', { class: f.flag_rate > 0.15 ? 'hot' : '' },
    h('td', { text: f.attribute }), h('td', { text: f.group }), h('td', { class: 'num', text: f.claims.toLocaleString() }),
    h('td', { class: 'num', text: pct0(f.flag_rate) }), h('td', { class: 'num', text: pct0(f.fraud_rate) }), h('td', { class: 'num', text: pct0(f.false_flag_rate) })));
  wrap.append(h('section', {}, h('h2', { text: 'Who gets flagged' }),
    h('p', { text: 'Sex, age and marital status are not inputs. The table checks whether groups are still flagged unevenly. With the top 10% flagged, an even result would be about 10% in every group.' }),
    h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, ...['Attribute', 'Group', 'Claims', 'Flagged', 'Were fraud', 'Honest but flagged'].map((x) => h('th', { scope: 'col', text: x })))), h('tbody', {}, rows)),
    h('p', { text: 'Policyholders aged 16 to 17 are flagged about three and a half times as often as an even split would give, and those aged 26 to 30 about one and a half times, even though age is not an input. The model is probably picking this up through vehicle and policy details. Only 251 claims are in the 16 to 17 group, so the figure is rough. It should be investigated before any real use.' })));

  wrap.append(h('section', {}, h('h2', { text: 'Columns left out on purpose' }),
    h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Column' }), h('th', { scope: 'col', text: 'Why it is not used' }))),
      h('tbody', {}, m.excluded.map((x) => h('tr', {}, h('td', { text: x.column }), h('td', { text: x.reason })))))));

  wrap.append(h('section', {}, h('h2', { text: 'How a claim is scored' }),
    h('ol', { class: 'limits' },
      h('li', { text: 'A gradient boosting model trained on 12,336 past claims gives each claim a score.' }),
      h('li', { text: 'The score is placed among scores of past claims. The riskiest slice becomes High, the next slice Medium, the rest Low. You set the size of the High slice with the review-capacity control.' }),
      h('li', { text: 'SHAP breaks the score into the factors that raised or lowered it.' }),
      h('li', { text: 'Two plain checks are shown beside the score, each with how often it was fraud in past data.' }),
      h('li', { text: 'A person reviews the claim and records the decision.' }))));

  wrap.append(h('section', {}, h('h2', { text: 'Limits' }),
    h('ul', { class: 'limits' },
      h('li', { text: 'The data is from 1994 to 1996. Fraud patterns today may differ.' }),
      h('li', { text: 'Labels mark fraud that was found. Fraud that was missed counts as honest, so the model learns past investigators’ findings, not the full truth.' }),
      h('li', { text: 'There is no claim amount in this dataset, so amount-based checks are not possible.' }),
      h('li', { text: 'The source and license of the dataset are not confirmed. This is a student prototype.' }),
      h('li', { text: 'Results use one public dataset. They do not show how the method would perform on a real insurer’s claims.' }))));
}

function capacityChart(curve) {
  const W = 640, H = 330, L = 56, R = 16, T = 14, B = 52, pw = W - L - R, ph = H - T - B;
  const X = (v) => L + (v / 0.5) * pw, Y = (v) => T + (1 - v) * ph;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Share of frauds found against share of claims reviewed' });
  for (let v = 0; v <= 1.001; v += 0.2) { svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: cssVar('--rule') }), s('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end' }, Math.round(v * 100) + '%')); }
  for (let v = 0; v <= 0.5001; v += 0.1) svg.append(s('text', { x: X(v), y: H - B + 20, 'text-anchor': 'middle' }, Math.round(v * 100) + '%'));
  const pts = [{ share: 0, recall: 0, lo: 0, hi: 0 }, ...curve];
  const band = pts.map((p) => `${X(p.share)},${Y(p.hi)}`).concat(pts.slice().reverse().map((p) => `${X(p.share)},${Y(p.lo)}`)).join(' ');
  svg.append(s('polygon', { points: band, fill: cssVar('--sov'), opacity: '0.13' }));
  svg.append(s('line', { x1: X(0), y1: Y(0), x2: X(0.5), y2: Y(0.5), stroke: cssVar('--ink-3'), 'stroke-dasharray': '5 5' }));
  svg.append(s('polyline', { points: pts.map((p) => `${X(p.share)},${Y(p.recall)}`).join(' '), fill: 'none', stroke: cssVar('--sov'), 'stroke-width': '2.5' }));
  const p10 = curve.find((p) => p.share === 0.1), p20 = curve.find((p) => p.share === 0.2);
  for (const p of [p10, p20]) {
    svg.append(s('circle', { cx: X(p.share), cy: Y(p.recall), r: 4.5, fill: cssVar('--paper'), stroke: cssVar('--sov'), 'stroke-width': 2 }),
      s('text', { class: 't', x: X(p.share) + 9, y: Y(p.recall) + 16 }, `${pct0(p.recall)} found at ${pct0(p.share)} reviewed`));
  }
  svg.append(s('text', { x: X(0.36), y: Y(0.36) - 12, 'text-anchor': 'middle' }, 'Random review'));
  svg.append(s('text', { x: L + pw / 2, y: H - 8, 'text-anchor': 'middle' }, 'Share of claims reviewed, highest score first'));
  svg.append(s('text', { x: 14, y: T + ph / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${T + ph / 2})` }, 'Share of all frauds found'));
  return svg;
}
function calibrationChart(cal) {
  const S = 360, L = 52, B = 48, T = 12, R = 14, pw = S - L - R, ph = S - T - B, max = 0.2;
  const X = (v) => L + (v / max) * pw, Y = (v) => T + (1 - v / max) * ph;
  const svg = s('svg', { class: 'chart', style: 'max-width:420px', viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': 'Predicted score against observed fraud rate by score tenth' });
  for (let v = 0; v <= max + 1e-9; v += 0.05) {
    svg.append(s('line', { x1: L, x2: S - R, y1: Y(v), y2: Y(v), stroke: cssVar('--rule') }), s('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end' }, Math.round(v * 100) + '%'),
      s('text', { x: X(v), y: S - B + 20, 'text-anchor': 'middle' }, Math.round(v * 100) + '%'));
  }
  svg.append(s('line', { x1: X(0), y1: Y(0), x2: X(max), y2: Y(max), stroke: cssVar('--ink-3'), 'stroke-dasharray': '5 5' }));
  for (const p of cal) svg.append(s('circle', { cx: X(Math.min(p.predicted, max)), cy: Y(Math.min(p.observed, max)), r: 5, fill: cssVar('--sov') }));
  svg.append(s('text', { x: L + pw / 2, y: S - 8, 'text-anchor': 'middle' }, 'Score given by the model'));
  svg.append(s('text', { x: 14, y: T + ph / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${T + ph / 2})` }, 'How often those claims were fraud'));
  return svg;
}

/* =====================================================================
   DECISIONS
   ===================================================================== */
async function renderDecisions(root) {
  root.append(pageHead('Decisions', 'What reviewers decided about each claim. Decisions are saved on this computer.'));
  let rows = [];
  try { rows = await api('/api/decisions'); } catch (_) { /* leave empty */ }
  state.decisions = new Map(rows.map((r) => [r.claim_id, r]));
  if (!rows.length) {
    root.append(h('p', { class: 'loading', text: 'No decisions yet. Open a claim in the queue and record what you decide.' }),
      h('a', { class: 'btn', href: '#queue', text: 'Go to the queue' }));
    return;
  }
  const body = h('tbody', {}, rows.map((r) => h('tr', {},
    h('td', { class: 'id', style: 'font-weight:600;white-space:nowrap', text: r.claim_id }), h('td', { text: r.decision }),
    h('td', { text: r.note || '' }), h('td', { class: 'num', text: r.score != null ? pct(r.score) : '' }),
    h('td', { class: 'num', text: new Date(r.updated).toLocaleString() }),
    h('td', {}, h('button', { class: 'link', type: 'button', text: 'Remove', onclick: async () => { await api('/api/decisions/' + encodeURIComponent(r.claim_id), { method: 'DELETE' }); route(); } })))));
  root.append(h('div', { class: 'model' },
    h('p', {}, h('a', { class: 'link', href: '/api/decisions.csv', text: 'Download as CSV' })),
    h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, ...['Claim', 'Decision', 'Note', 'Score', 'Saved', ''].map((x) => h('th', { scope: 'col', text: x })))), body)));
}

/* ---------- start ---------- */
(async function init() {
  $('#view').append(h('p', { class: 'loading', text: 'Loading the model…' }));
  try {
    const [schema, model, decisions] = await Promise.all([api('/api/schema'), api('/api/model'), api('/api/decisions')]);
    state.schema = schema; state.model = model;
    state.decisions = new Map(decisions.map((d) => [d.claim_id, d]));
    state.capacity = schema.bands.high_share;
    route();
  } catch (e) {
    $('#view').replaceChildren(h('div', { class: 'banner', role: 'alert' }, h('strong', { text: 'The scoring service is not reachable' }), 'Start it with python run.py, then reload this page.'));
  }
})();
})();
