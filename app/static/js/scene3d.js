// Q-Route 3D scenes (Three.js). window.Q3D = { NetworkScene, ProteinScene, MoleculeScene, RosterScene }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const C = { green: 0x12804f, greenL: 0x2bb673, dark: 0x0b5e39, orange: 0xe8641b, red: 0xd9480f, slate: 0x6b7770, ink: 0x18221c, line: 0xd5d9d1 };
const col = h => new THREE.Color(h);
function utilColor(u) {
  const st = [[0, 0xc9d1cb], [0.45, 0x2bb673], [0.75, 0xe0a33a], [0.95, 0xe8641b], [1.05, 0xd9480f]]; u = Math.max(0, Math.min(u, 1.05));
  for (let i = 1; i < st.length; i++) if (u <= st[i][0]) return col(st[i - 1][1]).lerp(col(st[i][1]), (u - st[i - 1][0]) / (st[i][0] - st[i - 1][0]));
  return col(st[4][1]);
}
function label(text, { size = 44, color = '#18221c', bg = 'rgba(255,255,255,.92)', border = '#d5d9d1', weight = 600, pad = 14 } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = `${weight} ${size}px Inter, -apple-system, sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + pad * 2, h = size + pad * 1.4; c.width = w; c.height = h;
  x.font = `${weight} ${size}px Inter, -apple-system, sans-serif`; x.fillStyle = bg; x.strokeStyle = border; x.lineWidth = 3;
  const r = h / 2.2; x.beginPath(); x.roundRect(1.5, 1.5, w - 3, h - 3, r); x.fill(); if (border) x.stroke();
  x.fillStyle = color; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.renderOrder = 10;
  s.scale.set(w / h * 0.32, 0.32, 1); s.userData.aspect = w / h; return s;
}

/* -------------------------------------------------------------------------------- base */
class Base {
  constructor(canvas, { autoRotate = false, camera = [0, 8, 10], fov = 35, interactive = true, shadow = true } = {}) {
    this.canvas = canvas; this.R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.R.setPixelRatio(Math.min(2, devicePixelRatio)); this.R.outputColorSpace = THREE.SRGBColorSpace; this.R.toneMapping = THREE.ACESFilmicToneMapping; this.R.toneMappingExposure = 1.0;
    this.R.shadowMap.enabled = shadow; this.R.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); const pm = new THREE.PMREMGenerator(this.R); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 200); this.cam.position.set(...camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5df, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(5, 12, 6); d.castShadow = shadow; d.shadow.mapSize.set(2048, 2048);
    Object.assign(d.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 }); d.shadow.bias = -0.0005; d.shadow.radius = 4; this.scene.add(d); this.sun = d;
    if (shadow) { const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.12 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.01; g.receiveShadow = true; this.scene.add(g); }
    this.ctl = new OrbitControls(this.cam, canvas); this.ctl.enableDamping = true; this.ctl.dampingFactor = 0.08; this.ctl.enablePan = false;
    this.ctl.autoRotate = autoRotate; this.ctl.autoRotateSpeed = 0.6; this.ctl.enabled = interactive; this.ctl.maxPolarAngle = Math.PI * 0.47;
    this.clock = new THREE.Clock(); this.alive = true; this.visible = true; this.tickers = [];
    const ro = new ResizeObserver(() => this.resize()); ro.observe(canvas.parentElement); this.ro = ro; this.resize();
    const io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }); io.observe(canvas); this.io = io;
    const loop = () => { if (!this.alive) return; requestAnimationFrame(loop); this.step(); }; loop();
  }
  step() { if (!this.visible) return; const dt = Math.min(0.05, this.clock.getDelta()); this.ctl.update(); this.tickers.forEach(f => f(dt, this.clock.elapsedTime)); this.R.render(this.scene, this.cam); }
  resize() { const p = this.canvas.parentElement, w = Math.max(50, p.clientWidth), h = Math.max(50, p.clientHeight); this.R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); if (this._fit) this.fit(...this._fit); }
  fit(box, k = 1) { this._fit = [box, k]; const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2, vf = this.cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * this.cam.aspect);
    const d = r * k / Math.sin(Math.min(vf, hf) / 2), dir = this.cam.position.clone().sub(this.ctl.target).normalize(), tp = this.topPad || 0;
    // Static views: frame the real box corners at ~92% of the panel (tp reserves headroom for an info overlay). Rotating views keep the sphere fit.
    const pts = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    let need = d; for (let i = 0; i < 5; i++) { this.cam.position.copy(c).addScaledVector(dir, need); this.cam.lookAt(c); this.cam.updateMatrixWorld();
      const v = pts.map(p => p.clone().project(this.cam)); need *= Math.max(0.5, Math.max(...v.map(q => Math.abs(q.x))) / 0.92, Math.max(...v.map(q => Math.abs(q.y))) / (0.92 - tp)); }
    const dist = this.ctl.autoRotate ? Math.max(d, need) : need; this.cam.position.copy(c).addScaledVector(dir, dist); this.cam.lookAt(c);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cam.quaternion).multiplyScalar(tp * dist * Math.tan(vf / 2));
    this.ctl.target.copy(c).add(up); this.cam.position.add(up); this.ctl.update(); }
  dispose() { this.alive = false; this.ro.disconnect(); this.io.disconnect(); this.R.dispose(); }
}

/* -------------------------------------------------------------------------------- network */
const RT = { body: new THREE.CylinderGeometry(0.42, 0.44, 0.28, 48), cap: new THREE.CylinderGeometry(0.405, 0.405, 0.025, 48), ring: new THREE.TorusGeometry(0.445, 0.022, 10, 64) };
const ARROW = (() => { const s = new THREE.Shape(); s.moveTo(-0.05, -0.035); s.lineTo(0.06, -0.035); s.lineTo(0.06, -0.075); s.lineTo(0.15, 0); s.lineTo(0.06, 0.075); s.lineTo(0.06, 0.035); s.lineTo(-0.05, 0.035); s.closePath(); return new THREE.ShapeGeometry(s); })();
const MAT = { body: new THREE.MeshStandardMaterial({ color: 0x2c3631, metalness: 0.65, roughness: 0.32 }), cap: new THREE.MeshStandardMaterial({ color: 0xf3f5f2, metalness: 0.1, roughness: 0.45 }),
  arrow: new THREE.MeshStandardMaterial({ color: C.green, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide }) };
function router() {
  const g = new THREE.Group(), b = new THREE.Mesh(RT.body, MAT.body); b.position.y = 0.14; b.castShadow = true; g.add(b);
  const c = new THREE.Mesh(RT.cap, MAT.cap); c.position.y = 0.29; c.castShadow = true; g.add(c);
  [[0, 1], [Math.PI / 2, -1], [Math.PI, 1], [-Math.PI / 2, -1]].forEach(([a, dir]) => { const m = new THREE.Mesh(ARROW, MAT.arrow); m.rotation.x = -Math.PI / 2; m.rotation.z = a + (dir < 0 ? Math.PI : 0);
    const r = dir > 0 ? 0.08 : 0.25; m.position.set(Math.cos(a) * r, 0.305, -Math.sin(a) * r); g.add(m); });
  const ring = new THREE.Mesh(RT.ring, new THREE.MeshStandardMaterial({ color: C.greenL, emissive: C.greenL, emissiveIntensity: 0.6, roughness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.07; g.add(ring); g.userData.ring = ring;
  return g;
}
export class NetworkScene extends Base {
  constructor(canvas, o = {}) {
    super(canvas, { camera: o.camera || [0, 12, 5.5], autoRotate: !!o.autoRotate, interactive: o.interactive !== false });
    this.o = o; this.which = o.which || 'qiea'; this.nodes = {}; this.links = {}; this.pk = []; this.bursts = []; this.drops = 0; this.state = null;
    this.root = new THREE.Group(); this.scene.add(this.root); this.hl = new THREE.Group(); this.scene.add(this.hl);
    const pg = new THREE.SphereGeometry(0.055, 12, 10); this.pkMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 320); this.pkMesh.count = 0; this.scene.add(this.pkMesh);
    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2(); let down = null;
    canvas.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
    canvas.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const id = this.pick(e); if (id && this.o.onLinkClick) this.o.onLinkClick(id); });
    canvas.addEventListener('pointermove', e => { const id = this.pick(e); canvas.style.cursor = id ? 'pointer' : 'grab'; if (this.o.onHover) this.o.onHover(id, e); });
    this.tickers.push((dt) => this.animate(dt));
  }
  pick(e) { const r = this.canvas.getBoundingClientRect(); this.ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.ptr, this.cam);
    const hit = this.ray.intersectObjects(Object.values(this.links).map(l => l.hitM), false)[0]; return hit ? hit.object.userData.id : null; }
  pos(n) { return new THREE.Vector3((n.x - 310) / 46, 0, (n.y - 150) / 46); }
  setTopology(T) {
    this.T = T; this.root.clear(); this.nodes = {}; this.links = {}; this.pk = [];
    const xs = T.nodes.map(n => n.x), ys = T.nodes.map(n => n.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, sc = 12.5 / Math.max(Math.max(...xs) - Math.min(...xs), 1);
    this.pos = n => new THREE.Vector3((n.x - cx) * sc, 0, (n.y - cy) * sc);
    T.nodes.forEach((n, i) => { const g = router(); g.position.copy(this.pos(n)); this.root.add(g); const lb = label(n.id); lb.position.set(0, 0.72, 0); g.add(lb);
      this.nodes[n.id] = { g, n }; if (window.gsap && this.o.intro !== false) gsap.from(g.position, { y: 2.5, duration: 0.9, delay: 0.05 * i, ease: 'bounce.out' }); });
    T.links.forEach(l => { const a = this.nodes[l.a].g.position, b = this.nodes[l.b].g.position, d = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = 0.28 + d * 0.06; const curve = new THREE.QuadraticBezierCurve3(a.clone().setY(0.2), mid, b.clone().setY(0.2));
      const mat = new THREE.MeshStandardMaterial({ color: C.line, roughness: 0.45, metalness: 0.05, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.045, 10), mat); mesh.castShadow = true; this.root.add(mesh);
      const hitM = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.22, 6), new THREE.MeshBasicMaterial({ visible: false })); hitM.userData.id = l.id; this.root.add(hitM);
      this.links[l.id] = { l, curve, mesh, mat, hitM, r: 0.045, u: 0 }; });
    const box = new THREE.Box3().setFromObject(this.root); this.fit(box, this.o.zoom || 0.8); this.applyState();
  }
  setState(s) { this.state = s; this.applyState(); }
  applyState() {
    if (!this.T) return; const s = this.state || {}, util = s.util || {}, failed = new Set((this.T.failed) || []);
    this.root.children.filter(o => o.userData.tag).forEach(o => this.root.remove(o));
    for (const k in this.links) { const L = this.links[k], u = util[k] || 0, f = failed.has(k); L.u = f ? 0 : u; L.failed = f;
      const r = f ? 0.022 : (s.util ? 0.035 + 0.075 * Math.min(u, 1.1) : 0.04); if (Math.abs(r - L.r) > 1e-3) { L.mesh.geometry.dispose(); L.mesh.geometry = new THREE.TubeGeometry(L.curve, 32, r, 10); L.r = r; }
      const target = f ? col(0xb9c0bb) : (s.util ? utilColor(u) : col(C.line)); if (window.gsap) gsap.to(L.mat.color, { r: target.r, g: target.g, b: target.b, duration: 0.7 }); else L.mat.color.copy(target);
      L.mat.opacity = f ? 0.55 : 1; L.mat.emissive = new THREE.Color(u > 1 ? C.red : 0x000000); L.mat.emissiveIntensity = u > 1 ? 0.35 : 0;
      const m = L.curve.getPoint(0.5);
      if (f) { const x = label('✕ cut', { color: '#fff', bg: '#d9480f', border: null, size: 40 }); x.position.copy(m).add(new THREE.Vector3(0, 0.35, 0)); x.userData.tag = 1; this.root.add(x); }
      else if (u > 1) { const x = label(Math.round(u * 100) + '%', { color: '#fff', bg: '#d9480f', border: null, size: 40 }); x.position.copy(m).add(new THREE.Vector3(0, 0.42, 0)); x.userData.tag = 1; this.root.add(x); } }
    for (const id in this.nodes) { const N = this.nodes[id]; let mx = 0; for (const k in this.links) { const L = this.links[k]; if (L.l.a === id || L.l.b === id) mx = Math.max(mx, L.u); }
      const c = s.util ? utilColor(Math.max(mx, 0.3)) : col(C.greenL); N.g.userData.ring.material.color.copy(c); N.g.userData.ring.material.emissive.copy(c); }
    this.hl.clear(); if (s.highlight != null && s.paths) { const p = s.paths[s.highlight]; if (p) { const pts = []; for (let i = 0; i < p.length - 1; i++) { const seg = this.seg(p[i], p[i + 1]); if (seg) for (let t = 0; t <= 1; t += 0.1) pts.push(seg(t)); }
      if (pts.length > 1) { const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.1, 10), new THREE.MeshStandardMaterial({ color: this.which === 'qiea' ? C.green : C.ink, transparent: true, opacity: 0.35, emissive: this.which === 'qiea' ? C.green : 0x000000, emissiveIntensity: 0.3 })); this.hl.add(tube);
        if (window.gsap) { tube.scale.set(1, 1, 1); gsap.from(tube.material, { opacity: 0, duration: 0.6 }); } } } }
  }
  seg(a, b) { const k = a < b ? `${a}-${b}` : `${b}-${a}`, L = this.links[k]; if (!L) return null; const fw = L.l.a === a; return t => L.curve.getPoint(fw ? t : 1 - t); }
  animate(dt) {
    const s = this.state; if (!s || !s.paths || !s.flows) { this.pkMesh.count = 0; return; }
    s.paths.forEach((p, i) => { if (Math.random() < s.flows[i].gbps * dt * 1.0 && this.pk.length < 300) this.pk.push({ i, seg: 0, t: 0, chk: -1 }); });
    const m4 = new THREE.Matrix4(), cq = this.which === 'qiea' ? col(C.green) : col(0x56615b), cr = col(C.orange); let n = 0;
    this.pk = this.pk.filter(k => { const path = s.paths[k.i]; if (!path || k.seg >= path.length - 1) return false; const a = path[k.seg], b = path[k.seg + 1], key = a < b ? `${a}-${b}` : `${b}-${a}`, L = this.links[key]; if (!L || L.failed) return false;
      if (k.chk !== k.seg) { k.chk = k.seg; k.drop = L.u > 1 && Math.random() < (L.u - 1) / L.u * 2.2 ? 0.25 + Math.random() * 0.5 : null; }
      k.t += dt * 2.4 / Math.max(1, L.curve.getLength()); const p = L.curve.getPoint(L.l.a === a ? Math.min(k.t, 1) : 1 - Math.min(k.t, 1));
      if (k.drop != null && k.t >= k.drop) { this.burst(p); this.drops++; return false; }
      m4.makeTranslation(p.x, p.y + 0.02, p.z); this.pkMesh.setMatrixAt(n, m4); this.pkMesh.setColorAt(n, L.u > 1 ? cr : cq); n++;
      if (k.t >= 1) { k.seg++; k.t = 0; } return true; });
    this.pkMesh.count = n; this.pkMesh.instanceMatrix.needsUpdate = true; if (this.pkMesh.instanceColor) this.pkMesh.instanceColor.needsUpdate = true;
    this.bursts = this.bursts.filter(b => { b.t += dt; b.m.scale.setScalar(1 + b.t * 6); b.m.material.opacity = Math.max(0, 0.8 - b.t * 1.6); if (b.t > 0.5) { this.scene.remove(b.m); return false; } return true; });
  }
  burst(p) { const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 24), new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, side: THREE.DoubleSide })); m.position.copy(p); m.rotation.x = -Math.PI / 2; this.scene.add(m); this.bursts.push({ m, t: 0 }); }
}

/* -------------------------------------------------------------------------------- protein (PyMOL-style) */
export class ProteinScene extends Base {
  constructor(canvas, o = {}) { super(canvas, { camera: [6, 5, 9], autoRotate: true, shadow: false }); this.ctl.maxPolarAngle = Math.PI; this.ctl.autoRotateSpeed = 1.1; this.root = new THREE.Group(); this.scene.add(this.root); this.o = o; }
  setFold(seq, xyz, contacts, accent = 'qiea') {
    this.root.clear(); const P = xyz.map(p => new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(1.0)), c = new THREE.Box3().setFromPoints(P).getCenter(new THREE.Vector3()); P.forEach(p => p.sub(c));
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal', 0.5);
    const tubeMat = new THREE.MeshStandardMaterial({ color: accent === 'qiea' ? 0x3f8f6a : 0x8a948e, roughness: 0.35, metalness: 0.05 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, P.length * 12, 0.13, 14), tubeMat); this.root.add(tube);
    const total = tube.geometry.index.count; tube.geometry.setDrawRange(0, 0);
    const hM = new THREE.MeshStandardMaterial({ color: 0xe8641b, roughness: 0.3, metalness: 0.05 }), pM = new THREE.MeshStandardMaterial({ color: 0xe9eee9, roughness: 0.35, metalness: 0.02 }), sg = new THREE.SphereGeometry(0.3, 32, 24);
    const balls = P.map((p, i) => { const m = new THREE.Mesh(sg, seq[i] === 'H' ? hM : pM); m.position.copy(p); m.scale.setScalar(0.001); this.root.add(m); return m; });
    const dl = new THREE.LineDashedMaterial({ color: 0xd4a000, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0 });
    contacts.forEach(([i, j]) => { const g = new THREE.BufferGeometry().setFromPoints([P[i], P[j]]); const l = new THREE.Line(g, dl); l.computeLineDistances(); this.root.add(l); });
    const ends = [label('N', { size: 36 }), label('C', { size: 36 })]; ends[0].position.copy(P[0]).add(new THREE.Vector3(0, 0.6, 0)); ends[1].position.copy(P[P.length - 1]).add(new THREE.Vector3(0, 0.6, 0)); ends.forEach(e => this.root.add(e));
    const g = window.gsap; if (g) { const o = { k: 0 }; g.to(o, { k: 1, duration: 1.6, ease: 'power2.inOut', onUpdate: () => tube.geometry.setDrawRange(0, Math.floor(total * o.k) - (Math.floor(total * o.k) % 3)) });
      balls.forEach((b, i) => g.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.35, delay: (i / balls.length) * 1.5, ease: 'back.out(2)' })); g.to(dl, { opacity: 1, duration: 0.6, delay: 1.6 }); }
    else { tube.geometry.setDrawRange(0, total); balls.forEach(b => b.scale.setScalar(1)); dl.opacity = 1; }
    this.fit(new THREE.Box3().setFromObject(this.root), 0.95);
  }
}

/* -------------------------------------------------------------------------------- molecule (ball-and-stick, CPK colours) */
const EL = { C: [0x8e9893, 0.36], H: [0xf4f6f4, 0.24], O: [0xe03b2f, 0.36], N: [0x3b5bdb, 0.36], F: [0x9bd16a, 0.33], Cl: [0x3fae49, 0.42] };
export function buildMolecule(frags) {
  const atoms = [], bonds = [], V = (x, y, z) => new THREE.Vector3(x, y, z), n = V(0, 1, 0);
  for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; atoms.push({ el: 'C', p: V(Math.cos(a) * 1.39, 0, Math.sin(a) * 1.39) }); }
  for (let k = 0; k < 6; k++) bonds.push([k, (k + 1) % 6, k % 2 ? 1 : 2]);
  frags.forEach((f, k) => { const base = atoms[k].p, u = base.clone().normalize(), w = u.clone().cross(n).normalize(), add = (el, p, to) => { atoms.push({ el, p }); bonds.push([to, atoms.length - 1, 1]); return atoms.length - 1; };
    const tet = (c, el, len, from) => [0, 120, 240].forEach(d => { const r = d * Math.PI / 180, dir = u.clone().multiplyScalar(0.34).add(w.clone().multiplyScalar(Math.cos(r) * 0.94)).add(n.clone().multiplyScalar(Math.sin(r) * 0.94)).normalize(); add(el, atoms[c].p.clone().add(dir.multiplyScalar(len)), c); });
    const s = f.replace('–', '');
    if (s === 'H') add('H', base.clone().add(u.clone().multiplyScalar(1.08)), k);
    else if (s === 'F') add('F', base.clone().add(u.clone().multiplyScalar(1.35)), k);
    else if (s === 'Cl') add('Cl', base.clone().add(u.clone().multiplyScalar(1.75)), k);
    else if (s === 'CH₃') { const c = add('C', base.clone().add(u.clone().multiplyScalar(1.51)), k); tet(c, 'H', 1.09); }
    else if (s === 'CF₃') { const c = add('C', base.clone().add(u.clone().multiplyScalar(1.51)), k); tet(c, 'F', 1.35); }
    else if (s === 'OH') { const o = add('O', base.clone().add(u.clone().multiplyScalar(1.36)), k); add('H', atoms[o].p.clone().add(u.clone().multiplyScalar(0.33).add(w.clone().multiplyScalar(0.9)).normalize().multiplyScalar(0.96)), o); }
    else if (s === 'NH₂') { const N = add('N', base.clone().add(u.clone().multiplyScalar(1.40)), k); [1, -1].forEach(sg => add('H', atoms[N].p.clone().add(u.clone().multiplyScalar(0.5).add(w.clone().multiplyScalar(0.86 * sg)).normalize().multiplyScalar(1.01)), N)); }
    else if (s === 'OCH₃') { const o = add('O', base.clone().add(u.clone().multiplyScalar(1.36)), k); const c = add('C', atoms[o].p.clone().add(u.clone().multiplyScalar(0.5).add(w.clone().multiplyScalar(0.86)).normalize().multiplyScalar(1.43)), o); tet(c, 'H', 1.09); } });
  return { atoms, bonds };
}
export class MoleculeScene extends Base {
  constructor(canvas) { super(canvas, { camera: [0, 7, 7], autoRotate: true, shadow: false }); this.ctl.maxPolarAngle = Math.PI; this.root = new THREE.Group(); this.scene.add(this.root); }
  setMolecule({ atoms, bonds }, labels = []) {
    this.root.clear(); const sg = new THREE.SphereGeometry(1, 32, 24), cg = new THREE.CylinderGeometry(1, 1, 1, 16), mats = {};
    const mat = el => mats[el] || (mats[el] = new THREE.MeshStandardMaterial({ color: EL[el][0], roughness: 0.28, metalness: 0.05 }));
    atoms.forEach((a, i) => { const m = new THREE.Mesh(sg, mat(a.el)); m.position.copy(a.p); m.scale.setScalar(EL[a.el][1]); this.root.add(m);
      if (window.gsap) gsap.from(m.scale, { x: 0, y: 0, z: 0, duration: 0.45, delay: 0.02 * i, ease: 'back.out(2)' }); });
    const ctr = new THREE.Vector3();
    bonds.forEach(([i, j, o]) => { const A = atoms[i].p, B = atoms[j].p, offs = o === 2 ? [-0.09, 0.09] : [0];
      offs.forEach(off => { const shift = o === 2 ? ctr.clone().sub(A.clone().add(B).multiplyScalar(0.5)).normalize().multiplyScalar(off) : new THREE.Vector3();
        [[A, atoms[i].el], [B, atoms[j].el]].forEach(([P, el], h) => { const a = P.clone().add(shift), m = A.clone().add(B).multiplyScalar(0.5).add(shift), len = a.distanceTo(m), c = new THREE.Mesh(cg, mat(el));
          c.scale.set(o === 2 ? 0.065 : 0.1, len, o === 2 ? 0.065 : 0.1); c.position.copy(a.clone().add(m).multiplyScalar(0.5)); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.clone().sub(a).normalize()); this.root.add(c); }); }); });
    labels.forEach(([t, k]) => { const s = label(t, { size: 34 }); s.position.copy(atoms[k].p.clone().multiplyScalar(1.0)).add(new THREE.Vector3(0, 0.55, 0)); this.root.add(s); });
    this.fit(new THREE.Box3().setFromObject(this.root), 0.9);
  }
}

/* -------------------------------------------------------------------------------- roster (3D block calendar) */
export class RosterScene extends Base {
  constructor(canvas) { super(canvas, { camera: [0, 9, 8.5] }); this.topPad = 0.2; this.root = new THREE.Group(); this.scene.add(this.root); }
  setRoster(grid, nurses, days, seniors) {
    this.root.clear(); const H = [0.08, 0.5, 0.5, 0.5], CL = [0xe6eae4, 0x7cc79a, 0xf0a25a, 0x0b5e39], geo = new THREE.BoxGeometry(0.86, 1, 0.86), mats = CL.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.02 }));
    const W = days.length, N = nurses.length, ox = -(W - 1) / 2, oz = -(N - 1) / 2;
    grid.forEach((row, i) => row.forEach((s, j) => { const m = new THREE.Mesh(geo, mats[s]); m.scale.y = H[s]; m.position.set(ox + j, H[s] / 2, oz + i); m.castShadow = true; m.receiveShadow = true; this.root.add(m);
      if (window.gsap) gsap.from(m.scale, { y: 0.001, duration: 0.6, delay: (i * W + j) * 0.012, ease: 'power3.out' });
      if (s) { const t = label('·MEN'[s], { size: 34, bg: 'rgba(0,0,0,0)', border: null, color: s === 3 ? '#ffffff' : '#18221c' }); t.position.set(ox + j, H[s] + 0.18, oz + i); t.scale.multiplyScalar(0.8); this.root.add(t); } }));
    days.forEach((d, j) => { const t = label(d, { size: 34 }); t.position.set(ox + j, 0.1, oz - 0.95); this.root.add(t); });
    nurses.forEach((n, i) => { const t = label((seniors.includes(n) ? '★ ' : '') + n, { size: 34 }); t.position.set(ox - 1.25, 0.1, oz + i); this.root.add(t); });
    this.fit(new THREE.Box3().setFromObject(this.root), 0.78);
  }
}

window.Q3D = { NetworkScene, ProteinScene, MoleculeScene, RosterScene, buildMolecule };
window.dispatchEvent(new Event('q3d-ready'));
