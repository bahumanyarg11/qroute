/* Q-Route Engine use cases: one QIEA core, many problems. window.QCases = { mount() } */
(function () {
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const el = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const api = (p, b) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
  const size = svg => { const W = svg.clientWidth || 400, H = svg.clientHeight || 300; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = ''; return [W, H]; };
  const S = { cur: null, res: {}, peak: true, seq: 'S1-20', seed: 0, busy: false };

  const CFG = {
    network: { title: 'Network routing', desc: 'Route 30 traffic flows across a 14-city backbone after a fibre cut — the ET-08 problem, live in the console.',
      chips: ['3 Q-bits per flow → 8 candidate paths', 'cost: latency + busiest link + loss', 'baseline: Dijkstra (OSPF-style)'] },
    fleet: { title: 'Fleet delivery routing', desc: 'Two vans leave Infosys, Electronic City at 09:00 to serve 12 stops across Bengaluru, each with a deadline. Distances and times come from the real road network (OpenStreetMap).',
      chips: ['4 Q-bits per stop → which van + visiting order', 'cost: drive time + 4× lateness', 'baseline: sweep + nearest-neighbour'] },
    protein: { title: 'Protein folding', desc: 'Fold a chain on a 3D cubic lattice. Hydrophobic (H) residues want to bury themselves together — more H–H contacts means a lower, more stable energy.',
      chips: ['3 Q-bits per residue → 6 lattice directions (3D)', 'cost: −(H–H contacts) + clash penalty', 'baseline: greedy chain growth'] },
    drug: { title: 'Drug fragment design', desc: 'Pick one of 8 chemical groups at each of 6 positions on a benzene core: maximise pocket fit, stay drug-like, avoid toxic combinations.',
      chips: ['3 Q-bits per site → 8 fragments', 'cost: pocket fit + clashes + toxicity + Lipinski', 'baseline: best fit at each site'] },
    roster: { title: 'Hospital shift rostering', desc: 'Six nurses, seven days. Every day needs 2 morning, 1 evening and 1 night nurse, a senior on mornings and nights, and no night → morning turnarounds.',
      chips: ['2 Q-bits per nurse-day → off / morning / evening / night', 'cost: coverage + seniority + rest + preferences', 'baseline: greedy day-by-day'] },
  };

  /* ---------------- views: real map (fleet) + 3D scenes ---------------- */
  const VIEW = {}, q3d = new Promise(r => window.Q3D ? r() : addEventListener('q3d-ready', r, { once: true }));
  function view(panel, kind, make) { const box = $(panel);
    if (box.dataset.kind !== kind) { Object.keys(VIEW).filter(k => k.startsWith(panel + ':')).forEach(k => { const v = VIEW[k]; try { v.remove ? v.remove() : v.dispose && v.dispose(); } catch (e) {} delete VIEW[k]; });
      box.innerHTML = ''; box.dataset.kind = kind; }
    return VIEW[panel + ':' + kind] || (VIEW[panel + ':' + kind] = make(box)); }
  const canvasIn = (box, Cls, hint) => { const c = document.createElement('canvas'); box.appendChild(c); const h = document.createElement('div'); h.className = 'hint'; h.textContent = hint || 'drag to rotate · scroll to zoom'; box.appendChild(h); return new Cls(c); };
  const overlay = (box, html) => { let o = box.querySelector('.ov'); if (!o) { o = document.createElement('div'); o.className = 'ov'; o.style.cssText = 'position:absolute;left:10px;top:10px;max-width:70%;font:12px MonoV,monospace;color:var(--tx2);line-height:1.6;pointer-events:none;background:rgba(255,255,255,.9);border:1px solid var(--bd);border-radius:8px;padding:6px 9px;z-index:2'; box.appendChild(o); } o.innerHTML = html; };
  /* fleet: MapLibre + OpenFreeMap tiles, roads from OSRM */
  const RC = {};
  async function road(coords) { const key = coords.map(c => c.map(v => v.toFixed(5)).join(',')).join(';'); if (RC[key]) return RC[key];
    try { const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson`, { signal: ctl.signal }).then(r => r.json()); RC[key] = r.routes[0].geometry.coordinates; }
    catch (e) { RC[key] = coords; } return RC[key]; }
  function makeMap(box) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; box.appendChild(d);
    const map = new maplibregl.Map({ container: d, style: 'https://tiles.openfreemap.org/styles/positron', center: [77.62, 12.98], zoom: 10.1, pitch: 50, bearing: -14, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    map._ready = new Promise((res, rej) => { map.on('load', res); setTimeout(() => rej(new Error('map timeout')), 7000); }); map._mk = []; return map; }
  async function fleetViz(panel, r, which) {
    if (!window.maplibregl) return fleetSvg(panel, r, which);
    const map = view(panel, 'map', makeMap);
    try { await map._ready; } catch (e) { const box = $(panel); box.dataset.kind = ''; return fleetSvg(panel, r, which); }
    const P = r.places, res = r[which], cols = which === 'qiea' ? ['#12804F', '#2BB673'] : ['#56615B', '#E8641B'], late = new Set(res.late);
    map._mk.forEach(m => m.remove()); map._mk = [];
    const dep = document.createElement('div'); dep.className = 'mdepot'; dep.textContent = 'Infosys depot'; map._mk.push(new maplibregl.Marker({ element: dep }).setLngLat([P[0].lon, P[0].lat]).addTo(map));
    for (let v = 0; v < 2; v++) { const rt = res.routes[v] || [], id = 'van' + v, coords = await road([0, ...rt, 0].map(i => [P[i].lon, P[i].lat])); if (S.cur !== 'fleet') return;
      const data = n => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, Math.max(2, n)) } });
      if (map.getSource(id)) map.getSource(id).setData(data(2)); else { map.addSource(id, { type: 'geojson', data: data(2) });
        map.addLayer({ id: id + 'c', type: 'line', source: id, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': cols[v], 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } }); }
      map.setPaintProperty(id, 'line-color', cols[v]);
      const o = { k: 0 }; gsap.to(o, { k: 1, duration: 1.6, delay: v * .3, ease: 'power2.inOut', onUpdate: () => map.getSource(id) && map.getSource(id).setData(data(Math.floor(coords.length * o.k))) });
      rt.forEach((i, k) => { const p = P[i], e = document.createElement('div'); e.className = 'mstop' + (which === 'qiea' ? '' : ' c') + (late.has(p.name) ? ' late' : ''); e.textContent = k + 1;
        e.title = `${p.name} · van ${v + 1} · stop ${k + 1}${p.due ? ' · due ' + p.due : ''}${late.has(p.name) ? ' · LATE' : ''}`; if (which === 'qiea' && v === 1) e.style.background = '#2BB673';
        map._mk.push(new maplibregl.Marker({ element: e }).setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setText(e.title)).addTo(map));
        gsap.from(e, { scale: 0, duration: .4, delay: .3 + k * .07 + v * .3, ease: 'back.out(2)' }); }); }
    const b = new maplibregl.LngLatBounds(); P.forEach(p => b.extend([p.lon, p.lat])); map.fitBounds(b, { padding: { top: 72, bottom: 34, left: 34, right: 56 }, pitch: 50, bearing: -14, duration: 900 });
    overlay($(panel), `${res.late.length ? `<span style="color:var(--bad)">late: ${res.late.join(', ')}</span>` : '<span style="color:var(--ok)">every deadline met</span>'} · back at ${res.finish}`); }
  function fleetSvg(panel, r, which) { const box = $(panel); box.innerHTML = '<svg style="width:100%;height:100%"></svg>'; box.dataset.kind = 'svg'; fleetSvgDraw(box.firstChild, r, which); }
  function fleetSvgDraw(svg, r, which) {
    const [W, H] = size(svg), P = r.places, lats = P.map(p => p.lat), lons = P.map(p => p.lon), pad = 34;
    const X = lon => pad + (lon - Math.min(...lons)) / (Math.max(...lons) - Math.min(...lons)) * (W - 2 * pad), Y = lat => pad + (Math.max(...lats) - lat) / (Math.max(...lats) - Math.min(...lats)) * (H - 2 * pad - 10);
    const q = which === 'qiea', res = r[which], cols = q ? [css('--ac'), css('--ac2')] : [css('--tx2'), css('--mu')], late = new Set(res.late);
    if (r.peak) P.forEach(p => { if (p.orr) el('circle', { cx: X(p.lon), cy: Y(p.lat), r: 17, fill: 'rgba(210,153,34,.10)', stroke: 'rgba(210,153,34,.35)', 'stroke-dasharray': '3 3' }, svg); });
    res.routes.forEach((rt, v) => { const pts = [0, ...rt, 0].map(i => `${X(P[i].lon)},${Y(P[i].lat)}`).join(' ');
      const pl = el('polyline', { points: pts, fill: 'none', stroke: cols[v], 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-dasharray': v ? '7 5' : '' }, svg);
      const len = pl.getTotalLength(); if (!v) { pl.style.strokeDasharray = `${len} ${len}`; gsap.fromTo(pl, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }); }
      else gsap.from(pl, { opacity: 0, duration: 1.2, delay: .4 });
      rt.forEach((i, k) => { const p = P[i], g = el('g', {}, svg), x = X(p.lon), y = Y(p.lat), bad = late.has(p.name);
        el('circle', { cx: x, cy: y, r: 10, fill: bad ? css('--bad') : css('--node'), stroke: bad ? css('--bad') : cols[v], 'stroke-width': 1.8 }, g);
        el('text', { x, y: y + 3.6, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, fill: bad ? '#fff' : css('--tx'), 'font-family': 'MonoV' }, g).textContent = k + 1;
        el('text', { x: x + 13, y: y + 4, 'font-size': 10.5, fill: bad ? css('--bad') : css('--tx2') }, g).textContent = p.name.split(',')[0] + (bad ? ' · late' : '');
        gsap.from(g, { scale: 0, opacity: 0, svgOrigin: `${x} ${y}`, duration: .45, delay: .2 + k * .08 + v * .3, ease: 'back.out(2)' }); }); });
    const d = P[0], x = X(d.lon), y = Y(d.lat); el('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 4, fill: css('--tx') }, svg);
    el('text', { x: x + 14, y: y + 4, 'font-size': 11, 'font-weight': 650, fill: css('--tx') }, svg).textContent = 'Infosys depot';
    el('text', { x: 12, y: H - 10, 'font-size': 11, fill: css('--mu') }, svg).textContent = `solid = van 1 · dashed = van 2${r.peak ? ' · amber ring = Outer Ring Road (peak traffic)' : ''}`;
  }

  async function proteinViz(panel, r, which) { await q3d; const sc = view(panel, 'protein', b => canvasIn(b, Q3D.ProteinScene)); sc.setFold(r.seq, r[which].xyz, r[which].contacts, which);
    overlay($(panel), `<span style="color:#E8641B">●</span> hydrophobic (H) &nbsp; <span style="color:#9aa59f">●</span> polar (P) &nbsp; <span style="color:#d4a000">- -</span> H–H contact (${r[which].contacts.length})`); }
  async function drugViz(panel, r, which) { await q3d; const sc = view(panel, 'mol', b => canvasIn(b, Q3D.MoleculeScene)), res = r[which];
    sc.setMolecule(Q3D.buildMolecule(res.frags), r.sites.map((t, k) => [t, k]));
    overlay($(panel), `${res.frags.join('  ')}<br>logP ${res.logP} · tPSA ${res.tPSA} · tox alert ${res.tox}` + (which === 'qiea' && r.exhaustive.match ? `<br><span style="color:var(--ok)">✓ global optimum — all ${r.exhaustive.evals.toLocaleString()} combinations checked</span>` : '')); }
  async function rosterViz(panel, r, which) { await q3d; const sc = view(panel, 'roster', b => canvasIn(b, Q3D.RosterScene)), res = r[which];
    sc.setRoster(res.grid, r.nurses, r.days, r.seniors);
    const iss = res.issues.slice(0, 3); overlay($(panel), (iss.length ? iss.map(t => `<span style="color:var(--bad)">● ${t}</span>`).join('<br>') : '<span style="color:var(--ok)">✓ no hard-rule problems</span>') + '<br><span style="color:#7cc79a">■</span> morning <span style="color:#f0a25a">■</span> evening <span style="color:#0b5e39">■</span> night ★ senior'); }
  async function networkViz(panel, B, which, topo) { await q3d; const sc = view(panel, 'net', b => { const c = document.createElement('canvas'); b.appendChild(c); return new Q3D.NetworkScene(c, { which, interactive: true, intro: true, zoom: 0.55 }); });
    if (!sc.T) sc.setTopology(Object.assign(JSON.parse(JSON.stringify(topo)), { failed: ['NY-PA'] }));
    sc.setState({ util: B.scenarios.failure[which === 'qiea' ? 'util_qiea' : 'util_classical'] }); }

  /* ---------------- metrics + text ---------------- */
  function metrics(name, r) { const c = r.classical, q = r.qiea;
    if (name === 'fleet') return [['Distance', c.km, q.km, ' km'], ['Late minutes', c.late_min, q.late_min, ' min'], ['Driving time', c.drive_min, q.drive_min, ' min']];
    if (name === 'protein') return [['H–H contacts (higher is better)', c.contacts.length, q.contacts.length, '', true], ['Energy (lower is better)', c.energy, q.energy, '']];
    if (name === 'drug') return [['Score (lower is better)', c.score, q.score, ''], ['Toxicity alert', c.tox, q.tox, ''], ['Drug-likeness (higher is better)', c.desirability, q.desirability, '', true]];
    if (name === 'roster') return [['Hard rule breaks', c.gaps + c.rest + c.over, q.gaps + q.rest + q.over, ''], ['Preference misses', c.pref, q.pref, '']];
    return []; }
  function headline(name, r) { const c = r.classical, q = r.qiea;
    if (name === 'fleet') return [`${c.km} km · ${c.late.length ? c.late.length + ' late' : 'on time'}`, `${q.km} km · ${q.late.length ? q.late.length + ' late' : 'all on time'}`];
    if (name === 'protein') return [`${c.contacts.length} H–H contacts`, `${q.contacts.length} H–H contacts`];
    if (name === 'drug') return [`score ${c.score}`, `score ${q.score}`];
    if (name === 'roster') return [`${c.gaps + c.rest + c.over} rule breaks`, `${q.gaps + q.rest + q.over} rule breaks`];
    return ['', '']; }
  function bars(name, r) { const box = $('cBars'); box.innerHTML = '';
    metrics(name, r).forEach(([k, a, b, u, hi]) => { const mx = Math.max(Math.abs(a), Math.abs(b), 1e-6), better = hi ? b >= a : b <= a, row = document.createElement('div'); row.className = 'cbar';
      row.innerHTML = `<div class="lab">${k}<b class="${better ? 'ok' : 'no'}">${better ? 'Q-Route wins' : 'classical wins'}</b></div>
        <div class="br"><span>Classical</span><div class="tr"><i style="background:var(--mu)"></i></div><span class="v">${a}${u}</span></div>
        <div class="br"><span>Q-Route</span><div class="tr"><i style="background:var(--ac)"></i></div><span class="v">${b}${u}</span></div>`;
      box.appendChild(row); const is = row.querySelectorAll('.tr i');
      gsap.to(is[0], { width: Math.abs(a) / mx * 100 + '%', duration: 1, ease: 'expo.out' }); gsap.to(is[1], { width: Math.abs(b) / mx * 100 + '%', duration: 1, ease: 'expo.out', delay: .1 }); });
    gsap.from('#cBars .cbar', { opacity: 0, y: 10, stagger: .07, duration: .5 }); }
  async function explain(name) { const e = $('cExp'); e.className = 'mut'; e.textContent = 'Writing the explanation…';
    const r = await api(`/api/domain/${name}/explain`); if (S.cur !== name) return; e.className = ''; $('cSrc').className = 'src' + (r.source === 'offline' ? '' : ' llm'); $('cSrc').textContent = r.source === 'offline' ? 'offline explainer' : r.source;
    e.textContent = ''; for (const w of r.text.split(/(\s+)/)) { if (/^\s+$/.test(w)) { e.append(w); continue; } const s = document.createElement('span'); s.className = 'w'; s.textContent = w; e.append(s); await new Promise(z => setTimeout(z, 14)); } }

  /* ---------------- flow ---------------- */
  const VIZ = { fleet: fleetViz, protein: proteinViz, drug: drugViz, roster: rosterViz };
  function controls(name) { const c = $('cCtl');
    if (name === 'network') c.innerHTML = '<a class="btn ac" href="#/demo">Open the live console →</a>';
    else if (name === 'fleet') c.innerHTML = `<label class="switch" style="margin:0"><input type="checkbox" id="cPeak" ${S.peak ? 'checked' : ''}><i></i>Peak-hour traffic</label><button class="btn pri" id="cRun">Re-run</button>`;
    else if (name === 'protein') c.innerHTML = `<select id="cSeq" style="width:auto">${['S1-20', 'S2-24', 'S3-36'].map(k => `<option ${k === S.seq ? 'selected' : ''}>${k}</option>`).join('')}</select><button class="btn pri" id="cRun">Re-run</button>`;
    else c.innerHTML = `<button class="btn pri" id="cRun">Re-run (new seed)</button>`;
    const run = $('cRun'); if (run) run.onclick = () => { S.seed++; solve(name); };
    if ($('cPeak')) $('cPeak').onchange = e => { S.peak = e.target.checked; solve(name); };
    if ($('cSeq')) $('cSeq').onchange = e => { S.seq = e.target.value; solve(name); }; }
  async function solve(name) {
    if (S.busy) return; S.busy = true; const cfg = CFG[name];
    $('cMetC').textContent = '…'; $('cMetQ').textContent = 'racing…'; gsap.to('#cvC, #cvQ', { opacity: .35, duration: .2 });
    try {
      if (name === 'network') { const B = await fetch('/api/benchmark').then(r => r.json()); const F = B.scenarios.failure;
        const topo = (await api('/api/scenario', { topo: 'nsfnet', surge: .5 })).topo;
        $('cBase').textContent = '· Dijkstra'; gsap.to('#cvC, #cvQ', { opacity: 1, duration: .3 }); networkViz('cvC', B, 'classical', topo); networkViz('cvQ', B, 'qiea', topo);
        $('cMetC').innerHTML = `<span class="no">${F.classical.dropped_gbps.toFixed(2)} Gbps lost</span> · ${Math.round(F.classical.mlu * 100)}%`; $('cMetQ').innerHTML = `<span class="ok">${F.qiea.dropped_gbps.toFixed(2)} Gbps lost</span> · ${Math.round(F.qiea.mlu * 100)}%`;
        const r = { classical: {}, qiea: {} }; $('cBars').innerHTML = ''; [['Traffic lost (Gbps)', F.classical.dropped_gbps, F.qiea.dropped_gbps], ['Busiest link (%)', Math.round(F.classical.mlu * 100), Math.round(F.qiea.mlu * 100)]].forEach(([k, a, b]) => {
          const row = document.createElement('div'); row.className = 'cbar'; row.innerHTML = `<div class="lab">${k}<b class="ok">Q-Route wins</b></div><div class="br"><span>Classical</span><div class="tr"><i style="background:var(--mu)"></i></div><span class="v">${(+a).toFixed(a < 10 ? 2 : 0)}</span></div><div class="br"><span>Q-Route</span><div class="tr"><i style="background:var(--ac)"></i></div><span class="v">${(+b).toFixed(b < 10 ? 2 : 0)}</span></div>`;
          $('cBars').appendChild(row); const is = row.querySelectorAll('.tr i'), mx = Math.max(a, b); gsap.to(is[0], { width: a / mx * 100 + '%', duration: 1, ease: 'expo.out' }); gsap.to(is[1], { width: b / mx * 100 + '%', duration: 1, ease: 'expo.out' }); });
        $('cSrc').className = 'src'; $('cSrc').textContent = 'benchmark'; $('cExp').className = ''; $('cExp').textContent = `Under a +50% surge with the NY–PA fibre cut, Dijkstra overloads two links and drops ${F.classical.dropped_gbps.toFixed(2)} Gbps. The same engine re-plans all 30 flows in ${F.qiea_time_s.toFixed(2)} s with zero loss. Try it yourself in the live console.`;
        $('cSpace').textContent = '10²⁷'; return; }
      const r = await api(`/api/domain/${name}`, { seed: S.seed, peak: S.peak, seq: S.seq }); if (S.cur !== name) return; S.res[name] = r;
      gsap.to('#cvC, #cvQ', { opacity: 1, duration: .3 }); $('cBase').textContent = '· ' + r.baseline; $('cSpace').textContent = r.space;
      VIZ[name]('cvC', r, 'classical'); VIZ[name]('cvQ', r, 'qiea');
      const [hc, hq] = headline(name, r); $('cMetC').textContent = hc; $('cMetQ').textContent = `${hq} · ${r.qiea.time_s.toFixed(2)} s`;
      bars(name, r); explain(name);
    } finally { S.busy = false; } }
  function select(name) {
    S.cur = name; const cfg = CFG[name];
    document.querySelectorAll('#ctabs button').forEach(b => b.classList.toggle('on', b.dataset.c === name));
    const b = document.querySelector(`#ctabs button[data-c="${name}"]`); gsap.to('#cpill', { x: b.offsetLeft, y: b.offsetTop - 6, width: b.offsetWidth, height: b.offsetHeight, duration: .5, ease: 'expo.out' });
    gsap.timeline().to('#case .chead, #case .cvs, #case .cfoot', { opacity: 0, y: 10, duration: .18, stagger: .03 }).add(() => {
      $('cTitle').textContent = cfg.title; $('cDesc').textContent = cfg.desc;
      $('cChips').innerHTML = cfg.chips.map(t => `<span class="tagc">${t}</span>`).join('') + '<span class="tagc">search space <b id="cSpace" style="color:var(--tx)">…</b></span>';
      controls(name); solve(name);
    }).to('#case .chead, #case .cvs, #case .cfoot', { opacity: 1, y: 0, duration: .45, stagger: .06, ease: 'expo.out' }); }
  window.QCases = {
    mount() { document.querySelectorAll('#ctabs button').forEach(b => b.onclick = () => select(b.dataset.c));
      const want = window.__case || 'fleet'; window.__case = null; requestAnimationFrame(() => select(want)); },
  };
})();
