/* Q-Route live console — guided 4-step demo. window.QConsole = { mount(), unmount(), present() } */
(function () {
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg', sleep = ms => new Promise(r => setTimeout(r, ms));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const S = { topo: 'nsfnet', surge: .5, failed: null, cons: {}, res: null, T: null, hl: null, running: false, demo: false, mounted: false, done: new Set(), live: false };
  const INTENT = { nsfnet: 'Keep CA1 to PA under 50 ms and avoid IL-PA', india: 'Keep Bengaluru to Delhi under 20 ms and avoid Nagpur' };
  const EXAMPLES = { nsfnet: ['Keep CA1 to PA under 50 ms', 'Avoid IL-PA', 'Keep every link under 85%'], india: ['Keep Bengaluru to Delhi under 20 ms', 'Avoid Nagpur', 'Keep every link under 85%'] };
  const CUTS = { nsfnet: ['NY-PA', 'IL-PA', 'CO-NE', 'GA-TX', 'MI-NJ', 'IL-WA'], india: ['HYD-NAG', 'BOM-PNQ', 'BLR-HYD', 'DEL-NAG', 'BBI-CCU', 'BLR-MAA'] };
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const pct = u => Math.round(u * 100) + '%';
  function el(t, a = {}, p) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function mix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function uc(u) { const st = [[0, css('--idle') || '#2A3340'], [.35, '#2EA043'], [.7, '#D29922'], [.9, '#DB6D28'], [1.05, '#F85149']]; u = Math.max(0, Math.min(u, 1.05));
    for (let i = 1; i < st.length; i++) if (u <= st[i][0]) return mix(st[i - 1][1], st[i][1], (u - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); return st[4][1]; }
  async function api(p, b) { const r = await fetch(p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return r.json(); }
  function toast(t, c) { const e = document.createElement('div'); e.className = 'toast'; e.innerHTML = `<i style="background:${c || 'var(--ac)'}"></i>`; e.append(t); $('toasts').appendChild(e);
    gsap.from(e, { y: -10, opacity: 0, duration: .35, ease: 'power3.out' }); gsap.to(e, { opacity: 0, y: -8, delay: 2.4, duration: .3, onComplete: () => e.remove() }); }
  function num(node, to, fmt) { const o = { v: parseFloat(node.dataset.v) || 0 }; node.dataset.v = to; gsap.to(o, { v: to, duration: .9, ease: 'power3.out', onUpdate: () => node.textContent = fmt(o.v), onComplete: () => node.textContent = fmt(to) }); }
  async function stream(node, text) { node.textContent = ''; for (const w of text.split(/(\s+)/)) { if (/^\s+$/.test(w)) { node.append(w); continue; } const s = document.createElement('span'); s.className = 'w'; s.textContent = w; node.append(s); await sleep(16); } }
  async function typeVal(node, text, ms = 22) { node.value = ''; for (let i = 0; i < text.length; i++) { node.value = text.slice(0, i + 1); await sleep(ms); } }

  /* ---------- steps + verdict ---------- */
  function mark(n) { S.done.add(n); document.querySelectorAll('.step').forEach(s => { const k = +s.dataset.s; s.classList.toggle('done', S.done.has(k)); s.classList.remove('cur'); });
    const next = [1, 2, 3, 4].find(k => !S.done.has(k)); const c = document.querySelector(`.step[data-s="${next || 4}"]`); if (c && next) c.classList.add('cur'); }
  function focusPanel(id) { const p = $(id); if (!p) return; p.classList.add('focus'); setTimeout(() => p.classList.remove('focus'), 1400); }
  function verdict() { const r = S.res; if (!r) return; const c = r.classical, q = r.qiea, v = $('verdict');
    let html;
    if (c.dropped_gbps > 0.005 && q.dropped_gbps < 0.005) html = `Q-Route keeps <span class="g">every packet flowing</span>. Classical routing drops <em class="r">${c.dropped_gbps.toFixed(2)} Gbps</em> — its busiest link hits <em class="r">${pct(c.mlu)}</em>.`;
    else if (c.dropped_gbps > 0.005) html = `Both routers are under pressure: Q-Route cuts loss from <em class="r">${c.dropped_gbps.toFixed(2)}</em> to <em class="a">${q.dropped_gbps.toFixed(2)} Gbps</em>.`;
    else if (c.mlu > q.mlu + .05) html = `No loss yet — but Q-Route keeps the busiest link at <em class="a">${pct(q.mlu)}</em> instead of <em>${pct(c.mlu)}</em>, leaving headroom.`;
    else html = `The network is calm: both routers keep every link within capacity. <span class="mut">Try the surge slider or cut a fibre.</span>`;
    if (S.cons && Object.keys(S.cons).length) html += ` <span class="mut">Rules: Q-Route ${q.sla_violations.length ? q.sla_violations.length + ' broken' : 'all met'}, Dijkstra ${c.sla_violations.length} broken.</span>`;
    gsap.to(v, { opacity: 0, y: -6, duration: .18, onComplete: () => { v.innerHTML = html; gsap.fromTo(v, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }); } }); }

  /* ---------- 3D maps ---------- */
  const SC = {}, q3d = new Promise(r => window.Q3D ? r() : addEventListener('q3d-ready', r, { once: true }));
  function tip(id, e, which) { const t = $('tip'); if (!id || !S.T) { t.style.opacity = 0; return; } const L = S.T.links.find(l => l.id === id), f = S.T.failed.includes(id);
    const u = S.res ? S.res[which].util[id] || 0 : 0; t.innerHTML = `<b>${L.a} – ${L.b}</b> · ${L.km} km<br>${f ? 'fibre cut — click to restore' : (S.res ? `load ${pct(u)} · click to cut` : 'click to cut')}`;
    t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY + 12) + 'px'; t.style.opacity = 1; }
  async function rebuild(intro) { await q3d; if (!S.T) return;
    [['C', 'map3C', 'classical'], ['Q', 'map3Q', 'qiea']].forEach(([k, id, which]) => {
      if (!SC[k]) SC[k] = new Q3D.NetworkScene($(id), { which, onLinkClick: toggleFail, onHover: (lid, e) => tip(lid, e, which), zoom: 0.74, intro });
      SC[k].o.intro = intro; SC[k].setTopology(JSON.parse(JSON.stringify(S.T))); });
    redraw(); }
  function redraw() { [['C', 'classical'], ['Q', 'qiea']].forEach(([k, which]) => { const sc = SC[k]; if (!sc || !sc.T) return; sc.T.failed = [...S.T.failed];
    sc.setState(S.res ? { util: S.res[which].util, paths: S.res[which].paths, flows: S.res.flows, highlight: S.hl } : {}); }); }

  /* ---------- panels ---------- */
  function bars() { const c = S.res.classical, q = S.res.qiea;
    const rows = [['b1', c.dropped_gbps, q.dropped_gbps, v => v.toFixed(2) + ' Gbps', Math.max(.5, c.dropped_gbps, q.dropped_gbps)],
      ['b2', c.mlu * 100, q.mlu * 100, v => Math.round(v) + '%', Math.max(120, c.mlu * 100, q.mlu * 100)],
      ['b3', c.avg_latency_ms, q.avg_latency_ms, v => v.toFixed(1) + ' ms', Math.max(c.avg_latency_ms, q.avg_latency_ms) * 1.15]];
    rows.forEach(([id, a, b, f, mx]) => { const box = $(id); gsap.to(box.querySelector('.c i'), { width: (a / mx * 100) + '%', duration: .9, ease: 'power3.out' }); gsap.to(box.querySelector('.q i'), { width: (b / mx * 100) + '%', duration: .9, ease: 'power3.out', delay: .08 });
      num(box.querySelector('.c .v'), a, f); num(box.querySelector('.q .v'), b, f); });
    $('hc').innerHTML = `<span class="${c.dropped_gbps > 0 ? 'no' : 'ok'}">${c.dropped_gbps.toFixed(2)} Gbps lost</span> · ${pct(c.mlu)}`;
    $('hq').innerHTML = `<span class="${q.dropped_gbps > 0 ? 'no' : 'ok'}">${q.dropped_gbps.toFixed(2)} Gbps lost</span> · ${pct(q.mlu)}`; }
  function hood() { const s = $('conv'), W = s.clientWidth || 300, H = 120; s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.innerHTML = ''; const h = S.res.history, jc = S.res.classical.cost, top = Math.max(40, Math.min(Math.max(...h), jc * 1.3));
    const X = i => 30 + (W - 36) * i / (h.length - 1), Y = v => 104 - 92 * Math.min(v, top) / top, mu = css('--mu'), ac = css('--ac');
    el('line', { x1: 30, x2: W - 6, y1: Y(jc), y2: Y(jc), stroke: mu, 'stroke-dasharray': '4 4' }, s); el('text', { x: W - 6, y: Y(jc) - 5, 'text-anchor': 'end', 'font-size': 11, fill: mu }, s).textContent = `Dijkstra ${Math.round(jc)}`;
    const pl = el('polyline', { points: h.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '), fill: 'none', stroke: ac, 'stroke-width': 2 }, s);
    el('text', { x: W - 6, y: Y(h[h.length - 1]) - 6, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 650, fill: ac }, s).textContent = `Q-Route ${Math.round(h[h.length - 1])}`;
    el('text', { x: 30, y: 118, 'font-size': 10.5, fill: mu }, s).textContent = `cost J over ${h.length} generations`;
    const len = pl.getTotalLength(); pl.style.strokeDasharray = `${len} ${len}`; gsap.fromTo(pl, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.2, ease: 'power3.out' });
    const q = $('qb'), W2 = q.clientWidth || 300; q.setAttribute('viewBox', `0 0 ${W2} ${H}`); q.innerHTML = ''; const p = S.res.qbit_p1, F = p.length, cw = (W2 - 30) / F, base = css('--bg2');
    for (let f = 0; f < F; f++) for (let k = 0; k < 3; k++) { const fill = mix(base, ac, .08 + .92 * p[f][k]); const r = el('rect', { x: 26 + f * cw, y: 4 + k * 30, width: Math.max(1, cw - 1.5), height: 27, rx: 2, fill: mix(base, ac, .5) }, q);
      gsap.to(r, { attr: { fill }, duration: .8, delay: f * .02, ease: 'power2.out' }); }
    ['q0', 'q1', 'q2'].forEach((t, i) => el('text', { x: 20, y: 22 + i * 30, 'text-anchor': 'end', 'font-size': 10.5, fill: mu, 'font-family': 'MonoV' }, q).textContent = t);
    el('text', { x: 26, y: 118, 'font-size': 10.5, fill: mu }, q).textContent = `${F} flows × 3 Q-bits · lilac = still superposed`; }
  function moved() { const t = $('moved'), mv = S.res.moved.slice(0, 7); t.innerHTML = mv.length ? '' : '<tr><td class="m" style="cursor:default">No flow had to move.</td></tr>';
    mv.forEach((m, i) => { const d = m.lat_old - m.lat_new, tr = document.createElement('tr'); if (S.hl === m.i) tr.className = 'on';
      tr.innerHTML = `<td class="f">${m.src} → ${m.dst}</td><td class="m">off ${m.hot_link}</td><td class="d ${d >= 0 ? 'ok' : 'no'}">${d >= 0 ? '−' : '+'}${Math.abs(d).toFixed(1)} ms</td>`; tr.onclick = () => trace(m); t.appendChild(tr);
      gsap.from(tr, { opacity: 0, x: -8, duration: .35, delay: i * .04 }); });
    const sg = $('sugg'); sg.innerHTML = ''; mv.slice(0, 3).forEach(m => { const b = document.createElement('button'); b.textContent = `Why did ${m.src}→${m.dst} move?`; b.onclick = () => ask(b.textContent); sg.appendChild(b); });
    if (mv[0]) $('askIn').placeholder = `Why did ${mv[0].src}→${mv[0].dst} move?`; }
  function trace(m) { S.hl = S.hl === m.i ? null : m.i; redraw(); moved(); $('traceNote').innerHTML = S.hl === null ? '' : `tracing <b>${m.src}→${m.dst}</b> · dashed = Dijkstra · blue = Q-Route`; }
  function cuts() { const box = $('cuts'); box.innerHTML = ''; const f = new Set(S.T.failed); const list = [...new Set([...CUTS[S.topo], ...S.T.failed])];
    list.forEach(id => { const b = document.createElement('button'); b.className = 'cut' + (f.has(id) ? ' on' : ''); b.textContent = id.replace('-', '–'); b.onclick = () => toggleFail(id); box.appendChild(b); });
    $('downN').textContent = f.size ? `${f.size} down` : 'all up'; }
  function rules() { const b = $('rules'), c = S.cons; b.innerHTML = ''; const add = t => { const s = document.createElement('span'); s.className = 'rule'; s.textContent = t; b.appendChild(s); gsap.from(s, { scale: .8, opacity: 0, duration: .3, ease: 'back.out(2)' }); };
    (c.pair_latency || []).forEach(x => add(`${x.src}–${x.dst} ≤ ${x.max_ms} ms`)); (c.avoid_links || []).forEach(x => add(`avoid ${x[0]}–${x[1]}`)); (c.avoid_nodes || []).forEach(x => add(`avoid ${x}`)); if (c.max_util) add(`peak ≤ ${pct(c.max_util)}`); }
  function setSurge(v) { S.surge = v / 100; $('surge').value = v; $('surge').style.setProperty('--p', v + '%'); $('surgeVal').textContent = '+' + v + '%'; }
  function examples() { const b = $('examples'); b.innerHTML = ''; EXAMPLES[S.topo].forEach(t => { const x = document.createElement('button'); x.textContent = t; x.onclick = () => { $('intent').value = t; parse(); }; b.appendChild(x); }); $('intent').placeholder = INTENT[S.topo]; }

  /* ---------- actions ---------- */
  async function loadScenario(intro) { const d = await api('/api/scenario', { topo: S.topo, surge: S.surge, failed: S.failed }); S.T = d.topo; S.failed = d.topo.failed; S.res = null; S.hl = null;
    cuts(); await rebuild(intro); $('vtopo').textContent = S.T.title.split(' (')[0]; }
  async function run() { if (S.running) return; S.running = true; const b = $('run'); b.innerHTML = '<span class="spin"></span>Racing both routers…'; gsap.to('#prog', { scaleX: .7, duration: .4 });
    try { const r = await api('/api/solve', { topo: S.topo, surge: S.surge, failed: S.failed, constraints: S.cons }); S.res = r; S.T = r.topo; if (S.hl !== null && !r.moved.find(m => m.i === S.hl)) { S.hl = null; $('traceNote').textContent = ''; }
      redraw(); bars(); hood(); moved(); cuts(); verdict(); mark(3); $('lastRun').textContent = `last race ${r.qiea.time_s.toFixed(2)} s · ${r.evals.toLocaleString()} route sets`; explain(); }
    finally { S.running = false; b.innerHTML = '<svg class="i" style="fill:currentColor;stroke:none"><use href="#i-play"/></svg>Run both routers'; gsap.to('#prog', { scaleX: 1, duration: .25, onComplete: () => gsap.set('#prog', { scaleX: 0 }) }); } }
  let exN = 0; async function explain() { const n = ++exN, e = $('explain'); e.style.color = 'var(--mu)'; e.textContent = 'Writing the explanation…'; const r = await api('/api/explain', {}); if (n !== exN) return; e.style.color = ''; src($('exSrc'), r.source); await stream(e, r.text); }
  function src(node, s) { node.className = 'src' + (s === 'offline' ? '' : ' llm'); node.textContent = s === 'offline' ? 'offline explainer' : s; }
  async function ask(q) { q = q || $('askIn').value.trim() || $('askIn').placeholder; $('askIn').value = ''; const c = $('chat'); c.innerHTML = `<div class="qq">You asked <b></b></div><div class="aa" style="color:var(--mu)">Thinking…</div>`;
    c.querySelector('b').textContent = q; const r = await api('/api/ask', { text: q, topo: S.topo }), a = c.querySelector('.aa'); a.style.color = ''; await stream(a, r.text);
    const s = document.createElement('div'); s.style.marginTop = '8px'; const bd = document.createElement('span'); src(bd, r.source); s.appendChild(bd); c.appendChild(s); mark(4); }
  async function parse() { const t = $('intent').value.trim() || $('intent').placeholder; $('intent').value = t; $('intentOut').innerHTML = '<div class="help">Parsing…</div>';
    const r = await api('/api/intent', { text: t, topo: S.topo }), js = JSON.stringify(r.constraints, null, 1).replace(/"([a-z_]+)":/g, '<span class="k">"$1"</span>:');
    $('intentOut').innerHTML = `<div class="codeo">${js}</div>` + (r.errors.length ? `<div class="vd no">✕ ${r.errors.join('; ')}</div>` : `<div class="vd ok">✓ Validated by the constraint guard</div>`) + `<div class="help">Parsed by ${r.source === 'offline' ? 'the offline rule parser' : r.source}</div>`;
    gsap.from('#intentOut > *', { opacity: 0, y: 6, stagger: .06, duration: .35 });
    if (Object.keys(r.constraints).length) { S.cons = r.constraints; rules(); mark(2); toast('Rule validated → sent to the optimizer', 'var(--ok)'); if ($('auto').checked) await run(); } }
  function toggleFail(id) { const f = new Set(S.failed), was = f.has(id); was ? f.delete(id) : f.add(id); S.failed = [...f]; S.T.failed = S.failed; cuts(); redraw(); mark(1);
    toast(was ? `Link ${id.replace('-', '–')} restored` : `Fibre ${id.replace('-', '–')} cut`, was ? 'var(--ok)' : 'var(--bad)'); if ($('auto').checked) run(); }
  async function setTopo(k) { if (S.running) return; S.topo = k; S.failed = null; S.cons = {}; rules(); $('intentOut').innerHTML = ''; $('intent').value = ''; $('chat').innerHTML = ''; $('traceNote').textContent = '';
    document.querySelectorAll('#topoBtns button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); examples(); await loadScenario(true); run(); }

  /* ---------- presenter ---------- */
  const STEPS = ['Baseline', 'Traffic surge', 'Fibre cut', 'Operator rule', 'Trace a reroute', 'Ask why'];
  function stage(i, t) { $('stN').textContent = `Step ${i + 1} of ${STEPS.length}`; $('stName').textContent = '· ' + STEPS[i]; $('stT').textContent = t; $('stBar').innerHTML = STEPS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join(''); $('stage').classList.add('show'); }
  async function waitRun() { await sleep(80); while (S.running) await sleep(60); }
  async function present() { if (S.demo) { S.demo = false; return; } S.demo = true; $('present').querySelector('span').textContent = 'Stop'; const A = $('auto').checked; $('auto').checked = false;
    try { if (S.topo !== 'nsfnet') { S.topo = 'nsfnet'; document.querySelectorAll('#topoBtns button').forEach(b => b.classList.toggle('on', b.dataset.k === 'nsfnet')); examples(); }
      S.cons = {}; rules(); $('intentOut').innerHTML = ''; $('intent').value = ''; $('chat').innerHTML = ''; S.hl = null; $('traceNote').textContent = ''; S.done.clear(); mark(0);
      setSurge(0); S.failed = []; await loadScenario(true); S.failed = []; S.T.failed = []; cuts(); redraw();
      stage(0, 'A normal day. Both routers keep every link below capacity.'); await sleep(900); await run(); await sleep(2600); if (!S.demo) return;
      stage(1, 'Evening peak: +50% traffic. Shortest-path routing starts stacking flows on the same links.'); focusPanel('p1'); for (let v = 0; v <= 50; v += 5) { setSurge(v); await sleep(60); } mark(1); await run(); await sleep(2900); if (!S.demo) return;
      stage(2, 'The NY–PA fibre is cut. Watch the red bursts: Dijkstra is dropping packets.'); $('auto').checked = true; toggleFail('NY-PA'); await waitRun(); $('auto').checked = false; await sleep(3600); if (!S.demo) return;
      stage(3, 'The operator adds a rule in plain English. The LLM turns it into JSON; the guard validates it.'); focusPanel('p2'); await typeVal($('intent'), INTENT.nsfnet); $('auto').checked = true; await parse(); await waitRun(); $('auto').checked = false; await sleep(3200); if (!S.demo) return;
      const m = S.res.moved.find(x => x.src === 'CA1' && x.dst === 'PA') || S.res.moved[0]; stage(4, `Tracing ${m.src} → ${m.dst}: dashed is Dijkstra's path, solid blue is Q-Route's.`); trace(m); await sleep(3400); if (!S.demo) return;
      stage(5, 'Ask why. The answer is built only from the measured scores.'); focusPanel('p4'); await ask(`Why did ${m.src}→${m.dst} move?`); await sleep(3800);
      const Q = S.res.qiea, C = S.res.classical, v = Q.sla_violations.length; $('stN').textContent = 'Result'; $('stName').textContent = ''; $('stBar').innerHTML = '';
      $('stT').textContent = `${Q.dropped_gbps > 0 ? Q.dropped_gbps.toFixed(2) + ' Gbps lost' : 'No traffic lost'} (Dijkstra: ${C.dropped_gbps.toFixed(2)} Gbps) · busiest link ${pct(Q.mlu)} vs ${pct(C.mlu)} · ${v ? v + ' rules broken' : 'all rules met'} · ${Q.time_s.toFixed(1)} s`; await sleep(4500); }
    finally { S.demo = false; $('present').querySelector('span').textContent = 'Present'; $('stage').classList.remove('show'); $('auto').checked = A; } }

  /* ---------- wiring ---------- */
  function wire() {
    $('topoBtns').innerHTML = [['nsfnet', 'NSFNET-14', 'US research backbone'], ['india', 'India-13', 'metro backbone']].map(([k, a, b]) => `<button data-k="${k}" class="${k === S.topo ? 'on' : ''}">${a}<small>${b}</small></button>`).join('');
    document.querySelectorAll('#topoBtns button').forEach(b => b.onclick = () => setTopo(b.dataset.k));
    let deb; $('surge').oninput = e => { setSurge(+e.target.value); mark(1); clearTimeout(deb); deb = setTimeout(() => { if ($('auto').checked) run(); }, 350); };
    $('run').onclick = run; $('parse').onclick = parse; $('askBtn').onclick = () => ask(); $('askIn').onkeydown = e => { if (e.key === 'Enter') ask(); };
    $('intent').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); parse(); } };
    $('clearC').onclick = () => { S.cons = {}; rules(); $('intentOut').innerHTML = ''; if ($('auto').checked) run(); };
    $('reset').onclick = async () => { setSurge(50); S.failed = null; S.cons = {}; rules(); $('intentOut').innerHTML = ''; $('intent').value = ''; $('chat').innerHTML = ''; $('traceNote').textContent = ''; await loadScenario(true); run(); };
    $('present').onclick = present; $('hoodBtn').onclick = () => { $('drawer').classList.toggle('open'); if (S.res) setTimeout(hood, 60); };
    document.querySelectorAll('.step').forEach(s => s.onclick = () => focusPanel(['p1', 'p2', 'mapsWrap', 'p4'][+s.dataset.s - 1]));
    document.addEventListener('keydown', e => { if (!S.mounted || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return; const k = e.key.toLowerCase();
      if (k === 'd') present(); else if (k === 'r') run(); else if (k === 'escape') S.demo = false; });
  }
  window.QConsole = {
    async mount() { S.live = true; if (S.mounted) { rebuild(false); return; } S.mounted = true; wire(); examples(); setSurge(50); mark(0);
      const st = await api('/api/status'), L = st.llm; $('vllm').innerHTML = L.configured ? `<span class="ok">●</span> ${L.model}` : '<span style="color:var(--wa)">●</span> LLM offline mode';
      await loadScenario(true); await sleep(400); run(); },
    unmount() { S.live = false; S.demo = false; $('tip').style.opacity = 0; },
    present,
  };
})();
