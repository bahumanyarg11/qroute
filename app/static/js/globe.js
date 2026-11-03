// Q-Route hero globe — Three.js. Exposes window.Globe = { mode('loader'|'hero'|'off'), intro(), outro() }
import * as THREE from 'three';

const canvas = document.getElementById('globe');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { canvas.remove(); window.Globe = { mode() {}, intro() { return Promise.resolve(); }, outro() { return Promise.resolve(); } }; }

if (renderer) {
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 10);
  const world = new THREE.Group(); scene.add(world);
  const globe = new THREE.Group(); world.add(globe);
  const R = 1.72;

  // occluder so back-side points are hidden (gives depth)
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 64, 64), new THREE.MeshBasicMaterial({ color: 0x080b12 })));

  // fibonacci dot sphere
  const N = 2600, pos = new Float32Array(N * 3), pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
    const v = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(R);
    pts.push(v); pos.set([v.x, v.y, v.z], i * 3);
  }
  const dotGeo = new THREE.BufferGeometry(); dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dotMat = new THREE.PointsMaterial({ color: 0x7088b2, size: 0.032, transparent: true, opacity: 0 });
  globe.add(new THREE.Points(dotGeo, dotMat));

  // hubs
  const hubs = []; for (let i = 0; i < 52; i++) hubs.push(pts[Math.floor((i + 0.5) * N / 52)]);
  const hubGeo = new THREE.BufferGeometry().setFromPoints(hubs);
  const hubMat = new THREE.PointsMaterial({ color: 0x9cc0ff, size: 0.075, transparent: true, opacity: 0, depthWrite: false });
  globe.add(new THREE.Points(hubGeo, hubMat));

  // arcs between nearby hubs
  const BLUE = new THREE.Color(0x4c8dff), RED = new THREE.Color(0xf85149), CYAN = new THREE.Color(0x38e8ff);
  const arcs = [];
  for (let a = 0; a < hubs.length; a++) {
    const near = hubs.map((h, b) => [b, h.distanceTo(hubs[a])]).filter(([b, d]) => b > a && d > 0.6 && d < 1.9).sort((x, y) => x[1] - y[1]).slice(0, 2);
    for (const [b, d] of near) {
      const mid = hubs[a].clone().add(hubs[b]).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + 0.16 * d));
      const curve = new THREE.QuadraticBezierCurve3(hubs[a], mid, hubs[b]);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const mat = new THREE.LineBasicMaterial({ color: BLUE.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat); globe.add(line);
      arcs.push({ curve, mat, heat: 0, target: 0, draw: 0 });
    }
  }
  // packets (one Points cloud, per-vertex colours)
  const P = arcs.length * 2, ppos = new Float32Array(P * 3), pcol = new Float32Array(P * 3);
  const packets = Array.from({ length: P }, (_, k) => ({ arc: k % arcs.length, t: Math.random(), v: 0.18 + Math.random() * 0.22 }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  globe.add(new THREE.Points(pGeo, pMat));

  // fresnel rim glow
  const glow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.22, 64, 64), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(0x4c8dff) }, o: { value: 0 } }, transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 c;uniform float o;varying vec3 n;void main(){float i=pow(0.62-dot(n,vec3(0,0,1.)),3.);gl_FragColor=vec4(c,1.)*i*o;}'
  }));
  world.add(glow);

  // state
  const S = { mode: 'loader', alpha: 0, mx: 0, my: 0, x: 0, scale: 0.82, running: true };
  const place = () => {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    S.x = w > 1100 ? 2.15 * (w / h) / 1.6 : 0;
  };
  place(); addEventListener('resize', place);
  addEventListener('pointermove', e => { S.mx = e.clientX / innerWidth - 0.5; S.my = e.clientY / innerHeight - 0.5; });

  // periodic "congestion → reroute" events
  setInterval(() => { const a = arcs[Math.floor(Math.random() * arcs.length)]; a.target = 1; setTimeout(() => (a.target = 0), 1700); }, 900);

  const clock = new THREE.Clock(); let shown = 0;
  function frame() {
    requestAnimationFrame(frame);
    step();
  }
  function step() {
    if (!S.running) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    shown += ((S.mode === 'off' ? 0 : 1) - shown) * Math.min(1, dt * 3);
    dotMat.opacity = 0.85 * S.alpha * shown; hubMat.opacity = S.alpha * shown; pMat.opacity = S.alpha * shown; glow.material.uniforms.o.value = 0.62 * S.alpha * shown;
    globe.rotation.y += dt * 0.07; globe.rotation.x = 0.32 + S.my * 0.25;
    world.rotation.y += ((S.mx * 0.35) - world.rotation.y) * 0.04;
    world.position.x += (S.x - world.position.x) * 0.06;
    world.scale.setScalar(world.scale.x + (S.scale - world.scale.x) * 0.06);
    for (const a of arcs) {
      a.heat += (a.target - a.heat) * Math.min(1, dt * 4); a.draw = Math.min(1, a.draw + dt * 0.6 * S.alpha);
      a.mat.color.copy(BLUE).lerp(RED, a.heat); a.mat.opacity = (0.38 + 0.5 * a.heat) * S.alpha * shown * a.draw;
    }
    packets.forEach((p, k) => {
      const a = arcs[p.arc]; p.t += dt * p.v * (1 - 0.6 * a.heat); if (p.t > 1) { p.t = 0; p.arc = Math.floor(Math.random() * arcs.length); }
      const v = a.curve.getPoint(p.t); ppos.set([v.x, v.y, v.z], k * 3);
      const c = CYAN.clone().lerp(RED, a.heat); pcol.set([c.r, c.g, c.b], k * 3);
    });
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    if (shown > 0.003) renderer.render(scene, camera); else renderer.clear();
  }
  frame();

  window.Globe = {
    mode(m) { S.mode = m; S.scale = m === 'loader' ? 0.92 : 0.86; if (window.gsap) gsap.to(canvas, { opacity: m === 'off' ? 0 : 1, duration: .6 }); else canvas.style.opacity = m === 'off' ? 0 : 1; },
    intro() { return new Promise(res => { const g = window.gsap; if (!g) { S.alpha = 1; return res(); }
      g.to(S, { alpha: 1, duration: 2.2, ease: 'power2.out', onComplete: res }); g.fromTo(world.rotation, { x: -0.6 }, { x: 0, duration: 2.6, ease: 'expo.out' }); }); },
    outro() { return new Promise(res => { const g = window.gsap; if (!g) return res(); g.to(S, { scale: 1.06, duration: 1.1, ease: 'expo.inOut', onComplete: res }); }); },
    instant() { S.alpha = 1; arcs.forEach(a => (a.draw = 1)); },
    step,
  };
  document.addEventListener('visibilitychange', () => { S.running = !document.hidden; clock.getDelta(); });
  window.dispatchEvent(new Event('globe-ready'));
}
