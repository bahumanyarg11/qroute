/* Q-Route demo site: loader, router + page transitions, scroll animations, charts. */
(() => {
  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, ScrambleTextPlugin);
  CustomEase.create('qr', '0.2,0.8,0.2,1');
  const $ = id => document.getElementById(id), $$ = (s, r = document) => [...r.querySelectorAll(s)], NS = 'http://www.w3.org/2000/svg';
  const sleep = ms => new Promise(r => setTimeout(r, ms)), css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const el = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const api = (p, b) => fetch(p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
  const PAGES = ['home', 'how', 'demo', 'cases', 'results', 'team'], NAMES = { home: 'Overview', how: 'How it works', demo: 'Live demo', cases: 'Use cases', results: 'Results', team: 'Team' };
  const globeReady = new Promise(r => window.Globe ? r(window.Globe) : addEventListener('globe-ready', () => r(window.Globe), { once: true }));
  let BENCH = null; const benchP = api('/api/benchmark').then(d => (BENCH = d));
  const q3dReady = new Promise(r => window.Q3D ? r() : addEventListener('q3d-ready', r, { once: true })); const BOOT = {};
  let cur = null, busy = false, ctx = null, booted = false;
  const route = () => { const h = location.hash.replace(/^#\/?/, ''); return PAGES.includes(h) ? h : 'home'; };

  /* ------------------------------------------------------------------ loader */
  async function boot() {
    const title = new SplitText('#ldTitle', { type: 'chars' });
    gsap.from(title.chars, { yPercent: 110, opacity: 0, rotateX: -60, duration: 1.1, ease: 'expo.out', stagger: .05, delay: .2 });
    gsap.from('[data-ld]', { y: 22, opacity: 0, duration: .9, ease: 'expo.out', stagger: .08, delay: .35 });
    globeReady.then(g => { g.mode('loader'); g.intro(); });
    const rows = $$('.boot .row'), bar = $('ldBar'), pctEl = $('ldPct'), msg = $('ldMsg'); let scn, res, st;
    const tasks = [
      ['Fetching NSFNET-14…', async () => { st = await api('/api/status'); scn = await api('/api/scenario', { topo: 'nsfnet', surge: .5 }); BOOT.scn = scn;
        q3dReady.then(() => { BOOT.ld = new Q3D.NetworkScene($('ld3d'), { which: 'classical', autoRotate: true, zoom: 0.95 }); BOOT.ld.setTopology(scn.topo); });
        return `${scn.topo.nodes.length} nodes · ${scn.topo.links.length} links`; }],
      ['Seeding traffic…', async () => `${scn.flows.length} flows · ${scn.flows.reduce((a, f) => a + f.gbps, 0).toFixed(1)} Gbps`],
      ['Superposing Q-bits…', async () => `${scn.flows.length * 3} Q-bits at |+⟩`],
      ['Dijkstra vs QIEA…', async () => { res = await api('/api/solve', { topo: 'nsfnet', surge: .5 }); BOOT.res = res;
        if (BOOT.ld) { BOOT.ld.setState({ util: res.classical.util, paths: res.classical.paths, flows: res.flows }); setTimeout(() => { if (BOOT.ld) { BOOT.ld.which = 'qiea'; BOOT.ld.setState({ util: res.qiea.util, paths: res.qiea.paths, flows: res.flows }); } }, 2600); }
        return `${res.qiea.time_s.toFixed(2)} s · ${res.evals.toLocaleString()} route sets`; }],
      ['Checking the LLM…', async () => st.llm.configured ? `${st.llm.model} · ready` : 'offline mode · no API key'],
    ];
    for (let i = 0; i < tasks.length; i++) {
      if (booted) return; const [m, fn] = tasks[i], row = rows[i]; row.classList.add('on'); msg.textContent = m;
      let det = '—'; try { [det] = await Promise.all([fn(), sleep(420)]); } catch (e) { det = 'skipped'; }
      row.classList.remove('on'); row.classList.add('done'); const d = row.querySelector('.det'); d.textContent = det;
      gsap.from(d, { opacity: 0, x: 8, duration: .4 }); const p = Math.round((i + 1) / tasks.length * 100), o = { v: (i / tasks.length) * 100 };
      gsap.to(bar, { width: p + '%', duration: .5, ease: 'qr' }); gsap.to(o, { v: p, duration: .5, onUpdate: () => pctEl.textContent = Math.round(o.v) + '%', onComplete: () => pctEl.textContent = p + '%' });
    }
    if (booted) return; msg.textContent = 'Ready — press Enter';
    const en = $('enter'); en.classList.add('ready'); gsap.to(en, { opacity: 1, y: 0, duration: .6, ease: 'expo.out' }); en.focus({ preventScroll: true });
  }
  async function exitLoader() {
    if (booted) return; booted = true;
    const tl = gsap.timeline();
    tl.to('#loader .body > *, #loader .bottom, #loader .top, #skip', { y: -26, opacity: 0, duration: .55, ease: 'power3.in', stagger: .035 })
      .to('#loader', { opacity: 0, duration: .5, ease: 'power2.out' }, '-=.15');
    globeReady.then(g => g.outro());
    await tl; $('loader').style.display = 'none'; document.body.classList.remove('loading'); if (BOOT.ld) { BOOT.ld.dispose(); BOOT.ld = null; }
    gsap.from('#nav', { y: -20, opacity: 0, duration: .8, ease: 'expo.out' }); go(route(), true);
  }
  $('enter').onclick = exitLoader; $('skip').onclick = exitLoader;
  addEventListener('keydown', e => { if (!booted && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); exitLoader(); } });

  /* ------------------------------------------------------------------ router + transitions */
  function pill(name) { const a = document.querySelector(`.links a[data-to="${name}"]`); $$('.links a').forEach(x => x.classList.toggle('on', x === a)); if (a) gsap.to('#pill', { x: a.offsetLeft, width: a.offsetWidth, duration: .55, ease: 'qr' }); }
  function wipeIn(label) { $('wipeLbl').textContent = label; return gsap.timeline().set('#wipe i', { transformOrigin: '50% 100%' }).to('#wipe i', { scaleY: 1, duration: .5, ease: 'power4.inOut', stagger: .045 })
      .fromTo('#wipeLbl', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .25 }, '-=.2'); }
  function wipeOut() { return gsap.timeline().to('#wipeLbl', { opacity: 0, duration: .15 }).set('#wipe i', { transformOrigin: '50% 0%' }).to('#wipe i', { scaleY: 0, duration: .55, ease: 'power4.inOut', stagger: .045 }); }
  async function go(name, first) {
    if (busy || name === cur) return; busy = true;
    if (cur && !first) await wipeIn(NAMES[name]);
    if (cur) leave(cur);
    $$('.page').forEach(p => p.classList.toggle('on', p.dataset.page === name));
    window.scrollTo(0, 0); document.body.style.overflow = name === 'demo' ? 'hidden' : ''; cur = name; pill(name);
    globeReady.then(g => g.mode(name === 'home' ? 'hero' : 'off')); gsap.to('.glow', { opacity: name === 'home' ? 1 : .35, duration: .8 });
    enter(name);
    if (!first) await wipeOut();
    busy = false; if (route() !== cur) go(route());
  }
  function leave(name) { if (ctx) ctx.revert(); ctx = null; ScrollTrigger.getAll().forEach(t => t.kill()); $$('video').forEach(v => v.pause()); if (name === 'demo') QConsole.unmount(); }
  function enter(name) {
    const page = document.querySelector(`.page[data-page="${name}"]`);
    ctx = gsap.context(() => {
      $$('[data-split]', page).forEach((h, i) => { const s = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'ln' });
        const top = h.getBoundingClientRect().top < innerHeight;
        gsap.from(s.lines, { yPercent: 110, duration: 1.15, ease: 'expo.out', stagger: .09, delay: top ? .15 + i * .05 : 0, scrollTrigger: top ? null : { trigger: h, start: 'top 85%' } }); });
      const hs = $$('[data-h]', page); if (hs.length) gsap.from(hs, { y: 26, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, delay: .3 });
      ScrollTrigger.batch($$('[data-r]', page), { start: 'top 92%', once: true, onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: .09 }) });
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { if (cur !== 'demo') gsap.set('#prog', { scaleX: s.progress }); } });
      (INIT[name] || (() => {}))(page);
    }, page);
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }
  addEventListener('hashchange', () => { if (booted) go(route()); });

  /* ------------------------------------------------------------------ micro-interactions */
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.spot'); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
    const m = e.target.closest && e.target.closest('.mag'); if (m) { const r = m.getBoundingClientRect(); gsap.to(m, { x: (e.clientX - r.left - r.width / 2) * .18, y: (e.clientY - r.top - r.height / 2) * .28, duration: .4, ease: 'power3.out' }); }
  });
  document.addEventListener('pointerout', e => { const m = e.target.closest && e.target.closest('.mag'); if (m && !m.contains(e.relatedTarget)) gsap.to(m, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.4)' }); });
  $('themeBtn').onclick = () => { const h = document.documentElement, t = h.dataset.theme === 'dark' ? 'light' : 'dark';
    gsap.timeline().to('#view', { opacity: 0, duration: .18 }).add(() => { h.dataset.theme = t; $('themeIco').setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon'); dispatchEvent(new Event('resize')); }).to('#view', { opacity: 1, duration: .35 }); };
  const modal = $('modal'), fv = $('filmVid');
  document.addEventListener('click', e => { const dc = e.target.closest('[data-case]'); if (dc) window.__case = dc.dataset.case;
    if (e.target.closest('[data-film]')) { modal.classList.add('on'); gsap.fromTo('#modal .box', { scale: .92, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: .6, ease: 'expo.out' }); fv.currentTime = 0; fv.play().catch(() => {}); }
    if (e.target === modal || e.target.closest('#mx')) closeModal(); });
  function closeModal() { gsap.to('#modal .box', { scale: .95, opacity: 0, duration: .25, onComplete: () => { modal.classList.remove('on'); fv.pause(); } }); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('on')) closeModal(); });
  // videos: if a clip isn't rendered yet, fall back gracefully (figure on How, placeholder elsewhere)
  $$('video').forEach(v => { const src = v.querySelector('source').getAttribute('src');
    fetch(src, { method: 'HEAD' }).then(r => { if (r.ok) return; const pl = v.closest('.player');
      if (v.id === 'howVid') { pl.style.background = '#fff'; pl.style.aspectRatio = 'auto'; pl.innerHTML = '<img src="/static/fig/s6_engine.svg" alt="QIEA engine" style="object-fit:contain;padding:24px">'; }
      else if (v.id === 'filmVid') { pl.innerHTML = '<div class="ph">The 20-second film is not rendered yet — run the film build, then refresh.</div>'; }
      else { const ph = pl.querySelector('.ph'); if (ph) ph.hidden = false; v.removeAttribute('controls'); } }).catch(() => {}); });

  /* ------------------------------------------------------------------ shared visuals */
  const POS = { WA: [40, 70], CA1: [20, 175], CA2: [70, 270], UT: [150, 150], CO: [235, 175], TX: [265, 290], NE: [325, 150], IL: [400, 110], PA: [505, 120], GA: [470, 290], MI: [440, 40], NY: [590, 65], NJ: [595, 140], DC: [570, 215] };
  const LINKS = ['CA1-WA', 'CA2-WA', 'IL-WA', 'CA1-CA2', 'CA1-UT', 'CA2-TX', 'CO-UT', 'MI-UT', 'CO-TX', 'CO-NE', 'GA-TX', 'DC-TX', 'IL-NE', 'IL-PA', 'GA-PA', 'NY-PA', 'NJ-PA', 'MI-NY', 'MI-NJ', 'DC-NY', 'DC-NJ'];
  function mix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function uc(u) { const st = [[0, css('--idle')], [.35, '#2EA043'], [.7, '#D29922'], [.9, '#DB6D28'], [1.05, '#F85149']]; u = Math.max(0, Math.min(u, 1.05));
    for (let i = 1; i < st.length; i++) if (u <= st[i][0]) return mix(st[i - 1][1], st[i][1], (u - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); return st[4][1]; }
  function size(svg) { const W = svg.clientWidth || 240, H = svg.clientHeight || 96; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = ''; return [W, H]; }
  function qbits(svg, W, H) { const n = 3, grp = W / n, bw = Math.min(16, grp / 5);
    for (let f = 0; f < n; f++) for (let q = 0; q < 3; q++) { const x = f * grp + grp / 2 - bw * 2 + q * bw * 1.5;
      el('rect', { x, y: 8, width: bw, height: H - 16, rx: 3, fill: css('--s3') }, svg);
      const r1 = el('rect', { x, y: H / 2, width: bw, height: H / 2 - 8, rx: 3, fill: css('--ac') }, svg), o = { y: H / 2 };
      gsap.to(o, { y: 14 + Math.random() * (H - 36), duration: 1.4 + Math.random(), repeat: -1, yoyo: true, ease: 'sine.inOut', onUpdate: () => { r1.setAttribute('y', o.y); r1.setAttribute('height', H - 8 - o.y); } }); } }
  function bitsViz(svg, W, H, labels) { const rh = H / 3, rows = [];
    for (let r = 0; r < 3; r++) { const y = r * rh + rh / 2, row = { boxes: [], lab: null };
      el('text', { x: 8, y: y + 4, 'font-size': 12, fill: css('--mu'), 'font-family': 'MonoV' }, svg).textContent = `flow ${r + 1}`;
      for (let b = 0; b < 3; b++) { const x = 62 + b * 26, box = el('rect', { x, y: y - 11, width: 22, height: 22, rx: 5, fill: 'transparent', stroke: css('--ac'), 'stroke-width': 1.5 }, svg);
        const t = el('text', { x: x + 11, y: y + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: css('--ac'), 'font-family': 'MonoV' }, svg); t.textContent = '0'; row.boxes.push([box, t]); }
      if (labels) { row.lab = el('text', { x: 150, y: y + 4, 'font-size': 12.5, fill: css('--tx'), 'font-family': 'MonoV', 'font-weight': 600 }, svg); row.lab.textContent = '→ path ?'; }
      rows.push(row); }
    gsap.timeline({ repeat: -1, repeatDelay: .3 }).add(() => rows.forEach(row => { const v = row.boxes.map(([box, t]) => { const b = Math.random() < .5 ? 1 : 0; t.textContent = b;
      box.setAttribute('fill', b ? css('--ac') : 'transparent'); t.setAttribute('fill', b ? '#fff' : css('--ac')); return b; });
      if (row.lab) row.lab.textContent = `→ path ${v[0] * 4 + v[1] * 2 + v[2] + 1}`; gsap.from(row.boxes.map(x => x[0]), { scale: .7, transformOrigin: '50% 50%', duration: .35, stagger: .05, ease: 'back.out(3)' }); })).to({}, { duration: 1.1 }); }
  function rotViz(svg, W, H) { const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 12;
    el('circle', { cx, cy, r, fill: 'none', stroke: css('--bd2'), 'stroke-width': 1.5 }, svg); el('ellipse', { cx, cy, rx: r, ry: r * .3, fill: 'none', stroke: css('--bd2'), 'stroke-dasharray': '3 4' }, svg);
    el('text', { x: cx + 6, y: cy - r + 14, 'font-size': 11, fill: css('--mu'), 'font-family': 'MonoV' }, svg).textContent = '|0⟩'; el('text', { x: cx + 6, y: cy + r - 4, 'font-size': 11, fill: css('--mu'), 'font-family': 'MonoV' }, svg).textContent = '|1⟩';
    const g = el('g', {}, svg); el('line', { x1: cx, y1: cy, x2: cx, y2: cy - r, stroke: css('--ac'), 'stroke-width': 3, 'stroke-linecap': 'round' }, g); el('circle', { cx, cy: cy - r, r: 5, fill: css('--ac') }, g); el('circle', { cx, cy, r: 3, fill: css('--tx') }, svg);
    gsap.fromTo(g, { rotation: -20, svgOrigin: `${cx} ${cy}` }, { rotation: 130, svgOrigin: `${cx} ${cy}`, duration: 2.6, repeat: -1, yoyo: true, ease: 'power2.inOut' }); }
  function scoreViz(svg, W, H) { const n = 16, bw = (W - 24) / n, rects = [];
    for (let i = 0; i < n; i++) rects.push(el('rect', { x: 12 + i * bw, y: H - 10, width: bw - 4, height: 0, rx: 2, fill: css('--s3') }, svg));
    gsap.timeline({ repeat: -1, repeatDelay: .5 }).add(() => { const v = rects.map(() => .15 + Math.random() * .8), best = v.indexOf(Math.min(...v));
      rects.forEach((r, i) => gsap.to(r, { attr: { height: v[i] * (H - 24), y: H - 10 - v[i] * (H - 24), fill: i === best ? css('--ac') : css('--s3') }, duration: .7, ease: 'expo.out', delay: i * .02 })); }).to({}, { duration: 1.8 }); }

  /* ------------------------------------------------------------------ page inits */
  const INIT = {
    home(page) {
      $$('[data-count]', page).forEach(n => { const to = +n.dataset.count, d = +n.dataset.dec, o = { v: 0 };
        gsap.to(o, { v: to, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: n, start: 'top 95%' }, onUpdate: () => n.textContent = o.v.toFixed(d) }); });
      $$('#cmp .b', page).forEach((b, i) => gsap.to(b, { width: b.dataset.w + '%', duration: 1.3, ease: 'expo.out', delay: (i % 2) * .12, scrollTrigger: { trigger: '#cmp', start: 'top 88%' } }));
      [['v1', qbits], ['v2', (s, W, H) => bitsViz(s, W, H, false)], ['v3', rotViz]].forEach(([id, fn]) => { const s = $(id), [W, H] = size(s); fn(s, W, H); });
      benchP.then(story); hero();
    },
    how() { const hv = $('howVid'); if (hv) hv.play().catch(() => {});
      [['h1v', qbits], ['h2v', (s, W, H) => bitsViz(s, W, H, true)], ['h3v', scoreViz], ['h4v', rotViz]].forEach(([id, fn]) => { const s = $(id), [W, H] = size(s); fn(s, W, H); }); },
    demo() { QConsole.mount(); },
    cases() { QCases.mount(); },
    results() { benchP.then(charts); },
    team() { const mq = $('mq'); if (!mq.dataset.dup) { mq.innerHTML += mq.innerHTML; mq.dataset.dup = 1; } gsap.to(mq, { xPercent: -50, duration: 32, ease: 'none', repeat: -1 });
      gsap.from('.avatar', { scale: .6, opacity: 0, duration: .9, ease: 'back.out(1.7)', delay: .4, stagger: .12 }); },
  };

  /* ------------------------------------------------------------------ home: 3D hero network */
  async function hero() { await q3dReady; if (window.__hero) { window.__hero.resize(); return; }
    const scn = BOOT.scn || await api('/api/scenario', { topo: 'nsfnet', surge: .5 }), res = BOOT.res || await api('/api/solve', { topo: 'nsfnet', surge: .5 });
    const sc = new Q3D.NetworkScene($('hero3d'), { which: 'qiea', autoRotate: true, zoom: 0.95 }); sc.setTopology(scn.topo); sc.setState({ util: res.qiea.util, paths: res.qiea.paths, flows: res.flows }); window.__hero = sc; }

  /* ------------------------------------------------------------------ home: pinned story driven by real benchmark loads */
  function story() {
    if (cur !== 'home') return;
    const svg = $('sceneSvg'), [W, H] = size(svg), pad = 36, xs = Object.values(POS).map(p => p[0]), ys = Object.values(POS).map(p => p[1]);
    const P = k => [pad + (POS[k][0] - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)) * (W - 2 * pad), pad + 20 + (POS[k][1] - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys)) * (H - 2 * pad - 20)];
    const sc = BENCH.scenarios, states = [sc.normal.util_classical, sc.congestion.util_classical, sc.failure.util_classical, sc.failure.util_qiea];
    const lines = {}, fx = {}, gl = el('g', {}, svg), gc = el('g', {}, svg), gn = el('g', {}, svg);
    LINKS.forEach(k => { const [a, b] = k.split('-'), [x1, y1] = P(a), [x2, y2] = P(b);
      lines[k] = el('line', { x1, y1, x2, y2, stroke: css('--idle'), 'stroke-width': 3, 'stroke-linecap': 'round' }, gl);
      fx[k] = el('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 1.6, 'stroke-dasharray': '1 12', 'stroke-linecap': 'round', opacity: .35 }, gl);
      gsap.to(fx[k], { attr: { 'stroke-dashoffset': -26 }, duration: 1.2, repeat: -1, ease: 'none' }); });
    Object.keys(POS).forEach(k => { const [x, y] = P(k); el('circle', { cx: x, cy: y, r: 14, fill: css('--node'), stroke: css('--nodebd'), 'stroke-width': 1.5 }, gn);
      el('text', { x, y: y + 3.8, 'text-anchor': 'middle', 'font-size': k.length > 2 ? 9 : 10.5, 'font-weight': 650, fill: css('--nodetx'), 'font-family': 'InterV' }, gn).textContent = k; });
    const [cx1, cy1] = P('NY'), [cx2, cy2] = P('PA'), cut = el('g', { opacity: 0 }, gc), mx = (cx1 + cx2) / 2, my = (cy1 + cy2) / 2;
    el('circle', { cx: mx, cy: my, r: 9, fill: css('--bad') }, cut); el('path', { d: `M${mx - 3.5},${my - 3.5}L${mx + 3.5},${my + 3.5}M${mx + 3.5},${my - 3.5}L${mx - 3.5},${my + 3.5}`, stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, cut);
    const chips = {}; ['IL-PA', 'NJ-PA'].forEach(k => { const [a, b] = k.split('-'), [x1, y1] = P(a), [x2, y2] = P(b), g = el('g', { opacity: 0 }, gc);
      const x = (x1 + x2) / 2 + (k === 'IL-PA' ? 0 : 30), y = (y1 + y2) / 2 - 22; el('rect', { x: x - 24, y: y - 11, width: 48, height: 22, rx: 5, fill: css('--bad') }, g);
      const t = el('text', { x, y: y + 4.5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#fff', 'font-family': 'MonoV' }, g); chips[k] = [g, t]; });
    const items = $$('.st-item'), dots = $$('#storyDots i'), CH = ['NSFNET-14 · normal load', 'NSFNET-14 · +50% surge', 'NSFNET-14 · surge + NY–PA cut', 'Q-Route · same surge + cut'];
    let step = -1;
    function setStep(s) { if (s === step) return; step = s; const U = states[s];
      items.forEach((it, i) => gsap.to(it, { opacity: i === s ? 1 : 0, y: i === s ? 0 : (i < s ? -24 : 24), duration: .6, ease: 'expo.out' })); dots.forEach((d, i) => d.classList.toggle('on', i <= s));
      gsap.to('#sceneChip', { duration: .5, scrambleText: { text: CH[s], chars: 'upperAndLowerCase', speed: .6 } });
      LINKS.forEach(k => { const u = U[k] || 0, down = s >= 2 && s < 3 ? k === 'NY-PA' : (s === 3 && k === 'NY-PA');
        gsap.to(lines[k], { attr: { stroke: down ? css('--bd2') : uc(u), 'stroke-width': down ? 1.6 : 2 + 6 * Math.min(u, 1.1) }, duration: .8, ease: 'qr' });
        lines[k].setAttribute('stroke-dasharray', down ? '5 6' : ''); gsap.to(fx[k], { opacity: down ? 0 : .2 + .5 * Math.min(u, 1), duration: .6 }); });
      gsap.to(cut, { opacity: s >= 2 ? 1 : 0, duration: .5 });
      Object.values(chips).forEach(([g, t], j) => { const k = Object.keys(chips)[j], u = U[k] || 0, on = u > 1; t.textContent = Math.round(u * 100) + '%'; gsap.to(g, { opacity: on ? 1 : 0, duration: .45 }); });
      gsap.to('#sceneLoss', { opacity: s === 2 ? 1 : 0, y: s === 2 ? 0 : -6, duration: .4 }); }
    setStep(0);
    ScrollTrigger.create({ trigger: '#storySec', start: 'top top', end: '+=2600', pin: true, scrub: true, onUpdate: t => setStep(Math.max(0, Math.min(3, Math.floor(t.progress * 4)))) });
    ScrollTrigger.refresh();
  }

  /* ------------------------------------------------------------------ results charts */
  function charts() {
    if (cur !== 'results') return;
    const sc = BENCH.scenarios, F = sc.failure, big = BENCH.scaling[BENCH.scaling.length - 1], mu = css('--mu'), ac = css('--ac'), bd = css('--bd'), tx2 = css('--tx2');
    $('rk').innerHTML = [[F.qiea.dropped_gbps.toFixed(2) + ' Gbps', 'traffic lost, surge + cut', `Dijkstra ${F.classical.dropped_gbps.toFixed(2)} Gbps`],
      [Math.round(F.qiea.mlu * 100) + '%', 'busiest link', `Dijkstra ${Math.round(F.classical.mlu * 100)}%`],
      [Math.round(F.qiea.cost), 'cost J (lower is better)', `Dijkstra ${Math.round(F.classical.cost)} · random ${Math.round(F.random.cost)}`],
      [big.time_s.toFixed(1) + ' s', `to re-plan ${big.flows} flows`, `${big.q_drop.toFixed(0)} Gbps lost vs ${big.c_drop.toFixed(1)}`]]
      .map(([v, k, s]) => `<div class="card spot"><div class="stat" style="padding:0;border:0"><div class="v" style="font-size:34px">${v}</div><div class="k">${k}</div><div class="s">${s}</div></div></div>`).join('');
    gsap.from('#rk .card', { y: 24, opacity: 0, duration: .9, ease: 'expo.out', stagger: .08, delay: .3 });
    const labels = ['Normal', 'Surge +50%', 'Surge + cut'], keys = ['normal', 'congestion', 'failure'];
    const frame = (svg, ymax, ticks, fmt) => { const [W, H] = size(svg), L = 44, R = W - 10, T = 14, B = H - 30, Y = v => B - (B - T) * v / ymax;
      ticks.forEach(v => { el('line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: bd }, svg); el('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: mu, 'font-family': 'MonoV' }, svg).textContent = fmt(v); });
      return { W, H, L, R, T, B, Y }; };
    const grow = (rects, trig) => rects.forEach((r, i) => { const h = +r.getAttribute('height'), y = +r.getAttribute('y');
      gsap.fromTo(r, { attr: { height: 0, y: y + h } }, { attr: { height: h, y }, duration: 1.1, ease: 'expo.out', delay: i * .05, scrollTrigger: { trigger: trig, start: 'top 88%' } }); });
    { const s = $('c1'), f = frame(s, 130, [0, 50, 100], v => v + '%'), gw = (f.R - f.L) / 3, rects = [];
      el('line', { x1: f.L, x2: f.R, y1: f.Y(100), y2: f.Y(100), stroke: css('--bad'), 'stroke-dasharray': '5 4' }, s);
      keys.forEach((k, g) => { [[sc[k].classical.mlu * 100, mu, 0], [sc[k].qiea.mlu * 100, ac, sc[k].qiea_sd.mlu * 100]].forEach(([v, c, sd], j) => {
        const x = f.L + g * gw + gw / 2 - 34 + j * 36; rects.push(el('rect', { x, y: f.Y(v), width: 30, height: f.B - f.Y(v), rx: 4, fill: c }, s));
        if (sd) el('line', { x1: x + 15, x2: x + 15, y1: f.Y(v + sd), y2: f.Y(v - sd), stroke: css('--tx'), 'stroke-width': 1.4 }, s);
        el('text', { x: x + 15, y: f.Y(v + sd) - 7, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 650, fill: css('--tx'), 'font-family': 'MonoV' }, s).textContent = Math.round(v) + '%'; });
        el('text', { x: f.L + g * gw + gw / 2, y: f.H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: tx2 }, s).textContent = labels[g]; }); grow(rects, s); }
    { const s = $('c2'), mx = Math.max(...keys.map(k => sc[k].random.dropped_gbps)), top = Math.ceil(mx / 2) * 2 + 2, f = frame(s, top, [0, top / 2, top], v => v.toFixed(0)), gw = (f.R - f.L) / 3, rects = [];
      keys.forEach((k, g) => { [[sc[k].classical.dropped_gbps, mu], [sc[k].random.dropped_gbps, css('--wa')], [sc[k].qiea.dropped_gbps, ac]].forEach(([v, c], j) => {
        const x = f.L + g * gw + gw / 2 - 48 + j * 33; rects.push(el('rect', { x, y: f.Y(v), width: 28, height: Math.max(1.5, f.B - f.Y(v)), rx: 4, fill: c }, s));
        el('text', { x: x + 14, y: f.Y(v) - 7, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 650, fill: css('--tx'), 'font-family': 'MonoV' }, s).textContent = v.toFixed(v < 10 ? 1 : 0); });
        el('text', { x: f.L + g * gw + gw / 2, y: f.H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: tx2 }, s).textContent = labels[g]; });
      el('text', { x: f.L, y: 10, 'font-size': 11, fill: mu }, s).textContent = 'Gbps'; grow(rects, s); }
    { const s = $('c3'), h = F.hist, jc = F.classical.cost, top = 220, f = frame(s, top, [0, 100, 200], v => v), X = i => f.L + (f.R - f.L) * i / (h.length - 1);
      el('line', { x1: f.L, x2: f.R, y1: f.Y(jc), y2: f.Y(jc), stroke: mu, 'stroke-dasharray': '5 4' }, s); el('text', { x: f.R, y: f.Y(jc) - 7, 'text-anchor': 'end', 'font-size': 12, fill: tx2 }, s).textContent = `Dijkstra ${Math.round(jc)}`;
      el('text', { x: f.R, y: f.T + 6, 'text-anchor': 'end', 'font-size': 12, fill: css('--wa') }, s).textContent = `random search, same budget: ${Math.round(F.random.cost)} ↑`;
      const pts = h.map((v, i) => `${X(i).toFixed(1)},${f.Y(Math.min(v, top)).toFixed(1)}`).join(' ');
      const area = el('polygon', { points: `${f.L},${f.B} ${pts} ${f.R},${f.B}`, fill: ac, 'fill-opacity': .1 }, s);
      const pl = el('polyline', { points: pts, fill: 'none', stroke: ac, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, s);
      el('text', { x: f.R, y: f.Y(h[h.length - 1]) - 9, 'text-anchor': 'end', 'font-size': 12.5, 'font-weight': 700, fill: ac }, s).textContent = `Q-Route ${Math.round(h[h.length - 1])}`;
      ['0', '150', '300 generations'].forEach((t, i) => el('text', { x: f.L + (f.R - f.L) * i / 2, y: f.H - 8, 'text-anchor': ['start', 'middle', 'end'][i], 'font-size': 11, fill: mu, 'font-family': 'MonoV' }, s).textContent = t);
      const len = pl.getTotalLength(); pl.style.strokeDasharray = `${len} ${len}`; gsap.fromTo(pl, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 88%' } });
      gsap.from(area, { opacity: 0, duration: 1.2, delay: .5, scrollTrigger: { trigger: s, start: 'top 88%' } }); }
    { const s = $('c4'), S4 = BENCH.scaling, f = frame(s, 2, [0, 1, 2], v => v + ' s'), X = n => f.L + 20 + (f.R - f.L - 40) * n / 130;
      const pl = el('polyline', { points: S4.map(r => `${X(r.flows)},${f.Y(r.time_s)}`).join(' '), fill: 'none', stroke: ac, 'stroke-width': 2.6 }, s);
      S4.forEach((r, i) => { const c = el('circle', { cx: X(r.flows), cy: f.Y(r.time_s), r: 5.5, fill: css('--bg2'), stroke: ac, 'stroke-width': 2.4 }, s);
        el('text', { x: X(r.flows), y: f.Y(r.time_s) - 12, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 650, fill: css('--tx'), 'font-family': 'MonoV' }, s).textContent = r.time_s.toFixed(1) + ' s';
        el('text', { x: X(r.flows), y: f.H - 8, 'text-anchor': 'middle', 'font-size': 11.5, fill: tx2, 'font-family': 'MonoV' }, s).textContent = r.flows + (i === S4.length - 1 ? ' flows' : '');
        gsap.from(c, { scale: 0, svgOrigin: `${X(r.flows)} ${f.Y(r.time_s)}`, duration: .6, ease: 'back.out(2)', delay: .4 + i * .15, scrollTrigger: { trigger: s, start: 'top 88%' } }); });
      const len = pl.getTotalLength(); pl.style.strokeDasharray = `${len} ${len}`; gsap.fromTo(pl, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 88%' } }); }
  }

  /* ------------------------------------------------------------------ start */
  if (new URLSearchParams(location.search).has('nointro')) { $('loader').style.display = 'none'; document.body.classList.remove('loading'); booted = true; globeReady.then(g => g.instant()); go(route(), true); }
  else boot();
})();
