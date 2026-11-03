import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import './fonts';

/* ───────────────────────── Visual system ───────────────────────── */

const C = {
  bg: '#07080B',
  text: '#E6E9EE',
  sec: '#8B93A1',
  dim: '#5D6573',
  faint: '#3A4250',
  blue: '#4C8DFF',
  cyan: '#38E8FF',
  red: '#F85149',
  green: '#3FB950',
  amber: '#D29922',
  idle: '#2B3440',
};
const INTER = "'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const EIO = Easing.inOut(Easing.cubic);
const EOUT = Easing.out(Easing.cubic);
const EIN = Easing.in(Easing.cubic);

const ramp = (f: number, a: number, b: number, easing = EIO) =>
  interpolate(f, [a, b], [0, 1], {...CL, easing});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type SpringCfg = {damping?: number; stiffness?: number; mass?: number};
const useSp = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (delay: number, cfg: SpringCfg = {}) =>
    spring({
      frame: f - Math.round(delay),
      fps,
      config: {damping: 20, stiffness: 120, mass: 0.9, ...cfg},
    });
};

const hexToRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
};
const rgba = (h: string, a: number) => {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
};

// Utilisation colour scale: idle → green 35% → amber 70% → orange 90% → red ≥105%
const STOPS: [number, string][] = [
  [0, '#2B3440'],
  [0.35, '#2EA043'],
  [0.7, '#D29922'],
  [0.9, '#DB6D28'],
  [1.05, '#F85149'],
];
const utilColor = (u: number) => {
  if (u <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i][0]) {
      const [u0, c0] = STOPS[i - 1];
      const [u1, c1] = STOPS[i];
      return mixHex(c0, c1, (u - u0) / (u1 - u0));
    }
  }
  return STOPS[STOPS.length - 1][1];
};

/* ───────────────────────── Timeline (frames @30fps) ───────────────────────── */

const T = {
  h1: [8, 86],
  h2: [96, 196],
  h3: [204, 286],
  h4: [294, 454],
  spikeILPA: 128,
  spikePANJ: 150,
  cut: 222,
  dimIn: 302,
  barsIn: 308,
  collapse: 342,
  barsOut: 384,
  restore: 388,
  recolour: 394,
  netOut: 458,
  statsIn: 470,
  statsOut: 534,
  logoIn: 548,
};

/* ───────────────────────── NSFNET-14 ───────────────────────── */

const S = 2;
const CX = 960;
const TOP = 380;
const pt = (x: number, y: number): [number, number] => [CX + (x - 307.5) * S, TOP + (y - 40) * S];

type Anchor = 'start' | 'middle' | 'end';
const NODES: {id: string; x: number; y: number; lx: number; ly: number; a: Anchor}[] = [
  {id: 'WA', x: 40, y: 70, lx: 0, ly: -24, a: 'middle'},
  {id: 'CA1', x: 20, y: 175, lx: -20, ly: 1, a: 'end'},
  {id: 'CA2', x: 70, y: 270, lx: 0, ly: 30, a: 'middle'},
  {id: 'UT', x: 150, y: 150, lx: 0, ly: 30, a: 'middle'},
  {id: 'CO', x: 235, y: 175, lx: -14, ly: 28, a: 'end'},
  {id: 'TX', x: 265, y: 290, lx: 0, ly: 30, a: 'middle'},
  {id: 'NE', x: 325, y: 150, lx: 0, ly: 30, a: 'middle'},
  {id: 'IL', x: 400, y: 110, lx: 0, ly: -24, a: 'middle'},
  {id: 'PA', x: 505, y: 120, lx: -14, ly: -24, a: 'end'},
  {id: 'GA', x: 470, y: 290, lx: 0, ly: 30, a: 'middle'},
  {id: 'MI', x: 440, y: 40, lx: 0, ly: -24, a: 'middle'},
  {id: 'NY', x: 590, y: 65, lx: 20, ly: 1, a: 'start'},
  {id: 'NJ', x: 595, y: 140, lx: 20, ly: 1, a: 'start'},
  {id: 'DC', x: 570, y: 215, lx: 0, ly: 30, a: 'middle'},
];
const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));

// [a, b, shortest-path utilisation, Q-Route utilisation, carries re-routed Q-Route flows]
const RAW: [string, string, number, number, boolean][] = [
  ['WA', 'CA1', 0.4, 0.36, false],
  ['WA', 'CA2', 0.32, 0.34, false],
  ['WA', 'IL', 0.62, 0.44, false],
  ['CA1', 'CA2', 0.28, 0.3, false],
  ['CA1', 'UT', 0.55, 0.42, false],
  ['CA2', 'TX', 0.45, 0.4, false],
  ['UT', 'CO', 0.5, 0.4, false],
  ['UT', 'MI', 0.38, 0.55, true],
  ['CO', 'TX', 0.42, 0.38, false],
  ['CO', 'NE', 0.66, 0.45, false],
  ['TX', 'GA', 0.48, 0.5, true],
  ['TX', 'DC', 0.35, 0.55, true],
  ['NE', 'IL', 0.74, 0.46, false],
  ['IL', 'PA', 1.15, 0.82, false],
  ['PA', 'GA', 0.3, 0.52, true],
  ['PA', 'NY', 0.72, 0, false],
  ['PA', 'NJ', 1.07, 0.48, false],
  ['MI', 'NY', 0.33, 0.6, true],
  ['MI', 'NJ', 0.25, 0.58, true],
  ['NY', 'DC', 0.4, 0.5, true],
  ['NJ', 'DC', 0.52, 0.44, false],
];

const LINKS = RAW.map(([a, b, u0, u1, rr], i) => {
  const A = pt(NODE[a].x, NODE[a].y);
  const B = pt(NODE[b].x, NODE[b].y);
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const L = Math.hypot(dx, dy);
  const mx = (A[0] + B[0]) / 2;
  return {
    key: `${a}-${b}`,
    i,
    A,
    B,
    L,
    ux: dx / L,
    uy: dy / L,
    u0,
    u1,
    rr,
    order: (mx - 385) / 1150,
  };
});
type Link = (typeof LINKS)[number];
const linkByKey = (k: string) => LINKS.find((l) => l.key === k)!;

const CUT_LINK = linkByKey('PA-NY');
const CUT_T = 0.62;
const CUT_P: [number, number] = [
  lerp(CUT_LINK.A[0], CUT_LINK.B[0], CUT_T),
  lerp(CUT_LINK.A[1], CUT_LINK.B[1], CUT_T),
];

const linkState = (l: Link, f: number) => {
  const spike = l.u0 > 1;
  const pre = spike ? (l.key === 'IL-PA' ? 0.76 : 0.68) : l.u0;
  let u = pre * ramp(f, 30 + l.order * 34, 104 + l.order * 34);
  if (l.key === 'IL-PA') u = lerp(u, l.u0, ramp(f, T.spikeILPA, T.spikeILPA + 22));
  if (l.key === 'PA-NJ') u = lerp(u, l.u0, ramp(f, T.spikePANJ, T.spikePANJ + 22));
  const rs = T.recolour + l.order * 20;
  const r = ramp(f, rs, rs + 24);
  u = lerp(u, l.u1, r);
  const rb = l.rr ? ramp(f, rs + 6, rs + 30) : 0;
  let color = utilColor(u);
  if (l.rr) color = mixHex(color, C.blue, rb);
  const w = 2.25 + 3.4 * clamp01((u - 0.88) / 0.22) + 0.85 * rb;
  return {u, r, rb, color, w};
};

const Pill: React.FC<{x: number; y: number; text: string; color: string; p: number; neutral?: boolean}> = ({
  x,
  y,
  text,
  color,
  p,
  neutral,
}) => {
  if (p <= 0.001) return null;
  const w = text.length * 12.4 + 28;
  return (
    <g transform={`translate(${x} ${y + (1 - p) * 10})`} opacity={clamp01(p)}>
      <rect x={-w / 2} y={-18} width={w} height={36} rx={8} fill={C.bg} />
      <rect
        x={-w / 2}
        y={-18}
        width={w}
        height={36}
        rx={8}
        fill={neutral ? 'rgba(255,255,255,0.05)' : rgba(color, 0.12)}
        stroke={neutral ? 'rgba(255,255,255,0.22)' : rgba(color, 0.6)}
        strokeWidth={1.25}
      />
      <text
        x={0}
        y={1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        style={{fontFamily: MONO, fontWeight: 600, fontSize: 20.5, letterSpacing: '-0.01em'}}
      >
        {text}
      </text>
    </g>
  );
};

const pillPos = (l: Link, off = 31): [number, number] => {
  const mx = (l.A[0] + l.B[0]) / 2;
  const my = (l.A[1] + l.B[1]) / 2;
  // perpendicular pointing downwards on screen
  let px = -l.uy;
  let py = l.ux;
  if (py < 0) {
    px = -px;
    py = -py;
  }
  return [mx + px * off, my + py * off];
};

const Network: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f > T.netOut + 24) return null;

  // camera
  const enter = ramp(f, 2, 44, EOUT);
  const dim = ramp(f, T.dimIn, T.dimIn + 18) * (1 - ramp(f, T.restore, T.restore + 20));
  const out = ramp(f, T.netOut, T.netOut + 20, EIN);
  const scale = (0.965 + 0.035 * enter) * (1 + 0.022 * ramp(f, 0, 440, Easing.linear)) * (1 + 0.05 * out);
  const opacity = enter * (1 - 0.8 * dim) * (1 - out);
  const blur = 7 * dim + 8 * out;

  const packetsOn = ramp(f, 24, 50);
  const cutOn = f >= T.cut;
  const cutA = f - T.cut;

  const linksEls: React.ReactNode[] = [];
  const packetEls: React.ReactNode[] = [];

  for (const l of LINKS) {
    const st = linkState(l, f);
    const d = ramp(f, 4 + l.order * 26, 30 + l.order * 26, EOUT);
    if (d <= 0.001) continue;
    const isCut = l === CUT_LINK;

    if (isCut && cutOn) {
      const g = 3 + 15 * sp(T.cut, {damping: 13, stiffness: 170, mass: 0.6});
      const toRed = ramp(f, T.cut, T.cut + 4);
      const settle = ramp(f, T.cut + 10, T.cut + 44);
      const recol = ramp(f, T.recolour + 10, T.recolour + 34);
      const col = mixHex(mixHex(st.color, C.red, toRed), '#4A5361', recol);
      const op = lerp(1, 0.62, settle) * lerp(1, 0.9, recol);
      const segs: [number, number, number, number][] = [
        [l.A[0], l.A[1], CUT_P[0] - l.ux * g, CUT_P[1] - l.uy * g],
        [CUT_P[0] + l.ux * g, CUT_P[1] + l.uy * g, l.B[0], l.B[1]],
      ];
      segs.forEach((s, k) =>
        linksEls.push(
          <line
            key={`cut${k}`}
            x1={s[0]}
            y1={s[1]}
            x2={s[2]}
            y2={s[3]}
            stroke={col}
            strokeWidth={lerp(4, 2.25, settle)}
            strokeLinecap="round"
            strokeDasharray={settle > 0.02 ? `${lerp(40, 2, settle)} ${lerp(0, 9, settle)}` : undefined}
            opacity={op}
          />,
        ),
      );
    } else {
      if (st.u > 0.95) {
        linksEls.push(
          <line
            key={`halo${l.i}`}
            x1={l.A[0]}
            y1={l.A[1]}
            x2={l.B[0]}
            y2={l.B[1]}
            stroke={st.color}
            strokeWidth={st.w + 12}
            strokeLinecap="round"
            opacity={0.1 * clamp01((st.u - 0.95) / 0.15) * d}
          />,
        );
      }
      linksEls.push(
        <line
          key={`l${l.i}`}
          x1={l.A[0]}
          y1={l.A[1]}
          x2={l.B[0]}
          y2={l.B[1]}
          stroke={st.color}
          strokeWidth={st.w}
          strokeLinecap="round"
          strokeDasharray={d < 1 ? `${l.L * d} ${l.L}` : undefined}
          opacity={d < 0.02 ? 0 : 1}
        />,
      );
    }

    // packets
    const lost = isCut ? ramp(f, T.cut, T.cut + 8) : 0;
    if (lost >= 1) continue;
    for (let k = 0; k < 6; k++) {
      const wgt = clamp01((0.2 + st.u) * 5.0 - k) * packetsOn * d * (1 - lost);
      if (wgt < 0.02) continue;
      const speed = 2.5 + hash(l.i) * 0.6;
      const ph = (((f * speed) / l.L + k / 6 + hash(l.i * 13 + k) * 0.07 + hash(l.i) * 0.5) % 1 + 1) % 1;
      const fwd = l.i % 2 === 0;
      const t = fwd ? ph : 1 - ph;
      const edge = clamp01((Math.min(t, 1 - t) * l.L) / 22);
      const x = lerp(l.A[0], l.B[0], t);
      const y = lerp(l.A[1], l.B[1], t);
      const sgn = fwd ? 1 : -1;
      const tx = x - l.ux * 13 * sgn;
      const ty = y - l.uy * 13 * sgn;
      const pc = isCut ? mixHex(C.text, C.red, lost * 3) : l.rr ? mixHex(C.text, C.cyan, st.rb) : C.text;
      const o = wgt * edge;
      packetEls.push(
        <g key={`p${l.i}-${k}`} opacity={o}>
          <line x1={tx} y1={ty} x2={x} y2={y} stroke={pc} strokeWidth={2} strokeLinecap="round" opacity={0.32} />
          <circle cx={x} cy={y} r={2.7} fill={pc} />
        </g>,
      );
    }
  }

  // dropped packets at the cut
  const drops: React.ReactNode[] = [];
  if (cutOn && f < T.restore + 10) {
    const fade = 1 - ramp(f, T.dimIn - 14, T.dimIn);
    for (let j = 0; j < 24; j++) {
      const b = T.cut + 2 + j * 4;
      const a = f - b;
      if (a < 0 || a > 26) continue;
      const sx = (hash(j * 3.3) - 0.5) * 2;
      drops.push(
        <circle
          key={`d${j}`}
          cx={CUT_P[0] + sx * a * 0.9}
          cy={CUT_P[1] + a * 1.1 + 0.05 * a * a}
          r={2.5}
          fill={C.red}
          opacity={(1 - a / 26) * 0.85 * fade}
        />,
      );
    }
  }

  const ringA = clamp01(cutA / 24);
  const xs = sp(T.cut + 1, {damping: 12, stiffness: 190, mass: 0.6});
  const xDim = ramp(f, T.recolour + 10, T.recolour + 34);
  const xCol = mixHex(C.red, '#6B7380', xDim);

  // labels
  const ilpa = linkByKey('IL-PA');
  const panj = linkByKey('PA-NJ');
  const pillsOut = 1 - ramp(f, T.restore, T.restore + 12);
  const p115 = sp(T.spikeILPA + 12) * pillsOut;
  const p107 = sp(T.spikePANJ + 12) * pillsOut;
  const p82 = sp(T.recolour + 28);
  const [x115, y115] = pillPos(ilpa);
  const [x107, y107] = pillPos(panj);

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: '960px 620px',
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <g>{linksEls}</g>
        <g>{packetEls}</g>
        <g>{drops}</g>
        {cutOn && cutA < 26 ? (
          <circle
            cx={CUT_P[0]}
            cy={CUT_P[1]}
            r={16 + 74 * EOUT(ringA)}
            fill="none"
            stroke={C.red}
            strokeWidth={1.5}
            opacity={0.75 * (1 - ringA)}
          />
        ) : null}
        {cutOn ? (
          <g transform={`translate(${CUT_P[0]} ${CUT_P[1]}) scale(${xs})`} opacity={lerp(1, 0.7, xDim)}>
            <circle r={16} fill={C.bg} stroke={xCol} strokeWidth={2} />
            <line x1={-5.5} y1={-5.5} x2={5.5} y2={5.5} stroke={xCol} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-5.5} y1={5.5} x2={5.5} y2={-5.5} stroke={xCol} strokeWidth={2.4} strokeLinecap="round" />
          </g>
        ) : null}
        <g>
          {NODES.map((n) => {
            const [x, y] = pt(n.x, n.y);
            const ord = (x - 385) / 1150;
            const pop = sp(2 + ord * 26, {damping: 14, stiffness: 150, mass: 0.7});
            const lab = ramp(f, 16 + ord * 26, 34 + ord * 26);
            return (
              <g key={n.id}>
                <circle cx={x} cy={y} r={9.5 * pop} fill="#0C0F14" stroke="#566070" strokeWidth={1.6} />
                <circle cx={x} cy={y} r={3.4 * pop} fill="#D3D8DF" />
                <text
                  x={x + n.lx}
                  y={y + n.ly}
                  textAnchor={n.a}
                  dominantBaseline="central"
                  fill="#6A7280"
                  opacity={lab}
                  style={{fontFamily: MONO, fontWeight: 500, fontSize: 16, letterSpacing: '0.04em'}}
                >
                  {n.id}
                </text>
              </g>
            );
          })}
        </g>
        <Pill x={x115} y={y115} text="115%" color={C.red} p={p115} />
        <Pill x={x107} y={y107} text="107%" color={C.red} p={p107} />
        <Pill x={x115} y={y115} text="82%" color={C.text} p={p82} neutral />
      </svg>
    </AbsoluteFill>
  );
};

/* ───────────────────────── Typography ───────────────────────── */

type Tok = {w: React.ReactNode; color?: string};
const toks = (s: string, color?: string): Tok[] => s.split(' ').map((w) => ({w, color}));

const Headline: React.FC<{lines: Tok[][]; start: number; end: number; size?: number; top?: number; left?: number}> = ({
  lines,
  start,
  end,
  size = 88,
  top = 124,
  left = 128,
}) => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < start - 1 || f > end + 24) return null;
  let idx = 0;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        fontFamily: INTER,
        fontWeight: 600,
        fontSize: size,
        letterSpacing: '-0.038em',
        lineHeight: 1.07,
        color: C.text,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{whiteSpace: 'nowrap'}}>
          {line.map((tok, wi) => {
            const i = idx++;
            const p = sp(start + i * 3, {damping: 22, stiffness: 115, mass: 0.85});
            const q = interpolate(f, [end - 12 + i, end + i], [0, 1], {...CL, easing: EIN});
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  marginRight: wi < line.length - 1 ? '0.25em' : 0,
                  color: tok.color ?? C.text,
                  opacity: clamp01(p) * (1 - q),
                  transform: `translateY(${(1 - p) * 0.42 * size - q * 0.22 * size}px)`,
                  filter: `blur(${Math.max(0, (1 - p) * 12 + q * 10)}px)`,
                }}
              >
                {tok.w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Eyebrow: React.FC<{num: string; text: string; start: number; end: number; top?: number; left?: number}> = ({
  num,
  text,
  start,
  end,
  top = 84,
  left = 130,
}) => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < start - 1 || f > end + 20) return null;
  const p = sp(start, {damping: 200, stiffness: 120});
  const q = ramp(f, end - 10, end + 4, EIN);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: MONO,
        fontSize: 17,
        fontWeight: 500,
        letterSpacing: '0.16em',
        color: C.sec,
        opacity: p * (1 - q),
        transform: `translateX(${(1 - p) * -16}px)`,
      }}
    >
      <span style={{color: C.blue}}>{num}</span>
      <span style={{width: 28, height: 1, background: '#3A4250', display: 'inline-block'}} />
      <span>{text}</span>
    </div>
  );
};

/* ───────────────────────── Scene 3: loss counter ───────────────────────── */

const LossCounter: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < T.cut || f > T.h3[1] + 16) return null;
  const p = sp(T.cut + 4, {damping: 22, stiffness: 120});
  const q = ramp(f, T.h3[1] - 10, T.h3[1] + 4, EIN);
  const v = 2.18 * ramp(f, T.cut + 6, T.cut + 50, Easing.out(Easing.quad));
  return (
    <div
      style={{
        position: 'absolute',
        right: 128,
        top: 84,
        textAlign: 'right',
        opacity: clamp01(p) * (1 - q),
        transform: `translateY(${(1 - p) * 24 - q * 16}px)`,
        filter: `blur(${(1 - p) * 8 + q * 8}px)`,
      }}
    >
      <div style={{fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: '0.16em', color: C.red}}>
        FIBRE NY–PA DOWN
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          gap: 18,
          fontFamily: MONO,
        }}
      >
        <span style={{fontSize: 96, fontWeight: 600, letterSpacing: '-0.03em', color: C.red, lineHeight: 1}}>
          {v.toFixed(2)}
        </span>
        <span style={{fontSize: 32, fontWeight: 500, color: C.sec, letterSpacing: '-0.01em'}}>Gbps lost</span>
      </div>
    </div>
  );
};

/* ───────────────────────── Scene 4: Q-bit amplitudes ───────────────────────── */

const BITS = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0];
const QubitBars: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < T.barsIn - 2 || f > T.barsOut + 24) return null;
  const pitch = 32;
  const bw = 12;
  const total = 29 * pitch + bw;
  const x0 = 960 - total / 2;
  const base = 742;
  const H = 268;
  const env = ramp(f, T.barsIn + 8, T.barsIn + 24);
  const exit = ramp(f, T.barsOut, T.barsOut + 16, EIN);
  const frameIn = ramp(f, T.barsIn - 2, T.barsIn + 14, EOUT);
  const front = (f - T.collapse) * 1 + 0.5; // bars collapsed so far
  const scanOn = f >= T.collapse - 2 && f <= T.collapse + 34;
  const scanX = x0 + bw / 2 + clamp01(front / 30) * (total - bw);
  const scanO = ramp(f, T.collapse - 4, T.collapse) * (1 - ramp(f, T.collapse + 28, T.collapse + 36));
  const done = ramp(f, T.collapse + 30, T.collapse + 38);

  return (
    <AbsoluteFill style={{opacity: 1 - exit, transform: `translateY(${exit * 26}px)`}}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <g opacity={frameIn}>
          {[1, 0.5, 0].map((lv) => (
            <g key={lv}>
              <line
                x1={x0 - 20}
                x2={x0 + total + 20}
                y1={base - lv * H}
                y2={base - lv * H}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth={1}
                strokeDasharray={lv === 0 ? undefined : '3 7'}
              />
              <text
                x={x0 - 36}
                y={base - lv * H}
                textAnchor="end"
                dominantBaseline="central"
                fill={C.dim}
                style={{fontFamily: MONO, fontSize: 16, fontWeight: 500}}
              >
                {lv.toFixed(1)}
              </text>
            </g>
          ))}
        </g>
        {BITS.map((bit, i) => {
          const x = x0 + i * pitch;
          const appear = sp(T.barsIn + i * 0.7, {damping: 18, stiffness: 110, mass: 0.8});
          const cp = sp(T.collapse + i, {damping: 12, stiffness: 180, mass: 0.65});
          const shimmer = (Math.sin(f * 0.23 + i * 1.9) * 0.075 + Math.sin(f * 0.11 + i * 0.7) * 0.045) * env * (1 - clamp01(cp));
          const target = bit ? 1 : 0.03;
          const h = Math.max(2, appear * lerp(0.5 + shimmer, target, cp) * H);
          const fillOp = bit ? lerp(0.4, 1, clamp01(cp)) : lerp(0.4, 1, clamp01(cp));
          const fill = bit ? C.blue : mixHex(C.blue, '#3A4250', clamp01(cp));
          const digitO = clamp01((f - (T.collapse + i) - 2) / 6);
          return (
            <g key={i}>
              <rect x={x} y={base - H} width={bw} height={H} rx={3} fill="rgba(255,255,255,0.028)" />
              <rect x={x} y={base - h} width={bw} height={h} rx={3} fill={fill} opacity={fillOp} />
              <rect x={x} y={base - h} width={bw} height={Math.min(3, h)} rx={1.5} fill={bit && cp > 0.5 ? '#9CC0FF' : C.blue} opacity={appear} />
              <text
                x={x + bw / 2}
                y={base + 30}
                textAnchor="middle"
                dominantBaseline="central"
                fill={bit ? C.blue : C.dim}
                opacity={digitO}
                style={{fontFamily: MONO, fontSize: 17, fontWeight: 600}}
              >
                {bit}
              </text>
            </g>
          );
        })}
        {scanOn ? (
          <line x1={scanX} x2={scanX} y1={base - H - 18} y2={base + 8} stroke={C.cyan} strokeWidth={1.5} opacity={0.75 * scanO} />
        ) : null}
        <g opacity={frameIn} style={{fontFamily: MONO, fontSize: 16, fontWeight: 500, letterSpacing: '0.16em'}}>
          <text x={x0 - 4} y={base + 74} fill={C.sec} dominantBaseline="central">
            30 Q-BITS
          </text>
          <text x={x0 + total + 4} y={base + 74} textAnchor="end" fill={C.sec} dominantBaseline="central" opacity={1 - done}>
            SUPERPOSITION
          </text>
          <text x={x0 + total + 4} y={base + 74} textAnchor="end" fill={C.blue} dominantBaseline="central" opacity={done}>
            COLLAPSED · ROUTE PLAN FOUND
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};

/* ───────────────────────── HUD ───────────────────────── */

const HUD: React.FC = () => {
  const f = useCurrentFrame();
  if (f > T.netOut + 20) return null;
  const o = ramp(f, 30, 54) * (1 - ramp(f, T.netOut - 4, T.netOut + 12));
  const qr = ramp(f, T.recolour + 18, T.recolour + 36);
  const barW = 260;
  const ticks: [number, string][] = [
    [0, '0'],
    [0.35, '35'],
    [0.7, '70'],
    [1.05, '105%'],
  ];
  const grad = STOPS.map(([u, c]) => `${c} ${(u / 1.05) * 100}%`).join(', ');
  return (
    <AbsoluteFill style={{opacity: o}}>
      <div style={{position: 'absolute', left: 130, top: 968, fontFamily: MONO, color: C.dim}}>
        <div style={{fontSize: 15, letterSpacing: '0.16em', fontWeight: 500}}>LINK UTILISATION</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 36, marginTop: 14}}>
          <div style={{position: 'relative', width: barW}}>
            <div style={{height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${grad})`}} />
            {ticks.map(([u, s]) => (
              <div
                key={s}
                style={{
                  position: 'absolute',
                  top: 12,
                  left: (u / 1.05) * barW,
                  transform: u === 0 ? undefined : u >= 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                  fontSize: 14,
                }}
              >
                {s}
              </div>
            ))}
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 12, opacity: qr, transform: `translateX(${(1 - qr) * -10}px)`}}>
            <div style={{width: 28, height: 3, borderRadius: 2, background: C.blue}} />
            <span style={{fontSize: 15, letterSpacing: '0.16em', color: C.sec}}>Q-ROUTE PATH</span>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 128,
          top: 1000,
          fontFamily: MONO,
          fontSize: 15,
          letterSpacing: '0.16em',
          color: C.dim,
          fontWeight: 500,
        }}
      >
        NSFNET-14 · 14 NODES · 21 LINKS
      </div>
    </AbsoluteFill>
  );
};

/* ───────────────────────── Scene 5: results ───────────────────────── */

const STATS: {num: string; unit: string; label: string; vsLabel: string; vs?: string}[] = [
  {num: '0', unit: 'Gbps', label: 'traffic lost', vsLabel: 'shortest-path', vs: '2.18 Gbps'},
  {num: '82', unit: '%', label: 'busiest link', vsLabel: 'shortest-path', vs: '115%'},
  {num: '0.4', unit: 's', label: 'to re-plan 30 flows', vsLabel: 'search space 10²⁷ routes'},
];

const Stats: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < T.statsIn - 8 || f > T.statsOut + 24) return null;
  const colW = 560;
  const left0 = 130;
  return (
    <AbsoluteFill>
      {STATS.map((s, i) => {
        const d = T.statsIn + i * 8;
        const rule = ramp(f, d - 4, d + 18, EOUT);
        const pn = sp(d, {damping: 20, stiffness: 120, mass: 0.85});
        const pl = sp(d + 5, {damping: 22, stiffness: 120});
        const pv = sp(d + 10, {damping: 22, stiffness: 120});
        const strike = ramp(f, d + 22, d + 36, EOUT);
        const q = ramp(f, T.statsOut + i * 3, T.statsOut + 12 + i * 3, EIN);
        const fade = (p: number) => ({
          opacity: clamp01(p) * (1 - q),
          transform: `translateY(${(1 - p) * 34 - q * 22}px)`,
          filter: `blur(${Math.max(0, (1 - p) * 10 + q * 8)}px)`,
        });
        return (
          <div key={i} style={{position: 'absolute', left: left0 + i * colW, top: 372, width: colW - 72}}>
            <div style={{position: 'relative', height: 2, opacity: 1 - q}}>
              <div style={{position: 'absolute', inset: 0, background: '#1C2129', transformOrigin: 'left', transform: `scaleX(${rule})`}} />
              <div style={{position: 'absolute', left: 0, top: 0, height: 2, width: 56 * rule, background: C.blue}} />
            </div>
            <div
              style={{
                marginTop: 34,
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                fontFamily: MONO,
                color: C.text,
                ...fade(pn),
              }}
            >
              <span style={{fontSize: 176, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1}}>{s.num}</span>
              <span style={{fontSize: s.unit === '%' ? 84 : 56, fontWeight: 500, color: C.sec, letterSpacing: '-0.03em'}}>
                {s.unit}
              </span>
            </div>
            <div
              style={{
                marginTop: 22,
                fontFamily: INTER,
                fontSize: 34,
                fontWeight: 560,
                letterSpacing: '-0.02em',
                color: C.text,
                ...fade(pl),
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                fontFamily: MONO,
                fontSize: 20,
                fontWeight: 500,
                color: C.sec,
                ...fade(pv),
              }}
            >
              {s.vs ? (
                <>
                  <span>vs</span>
                  <span style={{position: 'relative', whiteSpace: 'nowrap'}}>
                    <span style={{color: rgba(C.red, 0.85)}}>{s.vs}</span>
                    <span
                      style={{
                        position: 'absolute',
                        left: -3,
                        right: -3,
                        top: '54%',
                        height: 2,
                        background: rgba(C.red, 0.9),
                        transformOrigin: 'left',
                        transform: `scaleX(${strike})`,
                      }}
                    />
                  </span>
                  <span>{s.vsLabel}</span>
                </>
              ) : (
                <span>
                  search space 10
                  <span style={{fontSize: '0.62em', position: 'relative', top: '-0.62em', marginLeft: 1}}>27</span> routes
                </span>
              )}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ───────────────────────── Scene 6: logo ───────────────────────── */

const Mark: React.FC<{size: number}> = ({size}) => {
  const f = useCurrentFrame();
  const sp = useSp();
  const s0 = T.logoIn;
  const n = [
    [12, 60],
    [40, 22],
    [68, 60],
  ];
  const l1 = ramp(f, s0 + 3, s0 + 15, EOUT);
  const l2 = ramp(f, s0 + 9, s0 + 21, EOUT);
  const p = [sp(s0, {damping: 13, stiffness: 160, mass: 0.6}), sp(s0 + 8, {damping: 13, stiffness: 160, mass: 0.6}), sp(s0 + 15, {damping: 13, stiffness: 160, mass: 0.6})];
  const len = Math.hypot(28, 38);
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <line
        x1={n[0][0]}
        y1={n[0][1]}
        x2={n[1][0]}
        y2={n[1][1]}
        stroke={C.blue}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${len * l1} ${len}`}
        opacity={l1 > 0.01 ? 1 : 0}
      />
      <line
        x1={n[1][0]}
        y1={n[1][1]}
        x2={n[2][0]}
        y2={n[2][1]}
        stroke={C.blue}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${len * l2} ${len}`}
        opacity={l2 > 0.01 ? 1 : 0}
      />
      <circle cx={n[0][0]} cy={n[0][1]} r={8 * p[0]} fill={C.text} />
      <circle cx={n[1][0]} cy={n[1][1]} r={9 * p[1]} fill={C.cyan} />
      <circle cx={n[2][0]} cy={n[2][1]} r={8 * p[2]} fill={C.text} />
    </svg>
  );
};

const Logo: React.FC = () => {
  const f = useCurrentFrame();
  const sp = useSp();
  if (f < T.logoIn - 2) return null;
  const word = 'Q-Route'.split('');
  const ps = sp(T.logoIn + 22, {damping: 24, stiffness: 110});
  const pf = sp(T.logoIn + 30, {damping: 24, stiffness: 110});
  const div = ramp(f, T.logoIn + 26, T.logoIn + 44, EOUT);
  const up = (p: number) => ({
    opacity: clamp01(p),
    transform: `translateY(${(1 - p) * 20}px)`,
    filter: `blur(${Math.max(0, (1 - p) * 8)}px)`,
  });
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateY(-14px)'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 30}}>
          <Mark size={112} />
          <div
            style={{
              fontFamily: INTER,
              fontWeight: 700,
              fontSize: 148,
              letterSpacing: '-0.05em',
              color: C.text,
              lineHeight: 1,
              display: 'flex',
              paddingBottom: 8,
            }}
          >
            {word.map((ch, i) => {
              const p = sp(T.logoIn + 6 + i * 2, {damping: 20, stiffness: 130, mass: 0.8});
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    opacity: clamp01(p),
                    transform: `translateY(${(1 - p) * 46}px)`,
                    filter: `blur(${Math.max(0, (1 - p) * 12)}px)`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: INTER,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.012em',
            color: C.sec,
            whiteSpace: 'nowrap',
            ...up(ps),
          }}
        >
          <span style={{color: '#C9CED6'}}>Quantum-inspired network routing</span>
          <span style={{margin: '0 18px', color: C.faint}}>·</span>
          Team ReZero
          <span style={{margin: '0 18px', color: C.faint}}>·</span>
          RV College of Engineering
        </div>
        <div style={{marginTop: 46, width: 64 * div, height: 1, background: '#2A303A'}} />
        <div
          style={{
            marginTop: 26,
            fontFamily: MONO,
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '0.06em',
            color: C.dim,
            whiteSpace: 'nowrap',
            ...up(pf),
          }}
        >
          Built on Qualcomm Cloud AI Playground · Hack-AI-Thon 2026 · ET-08
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ───────────────────────── Background ───────────────────────── */

const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const drift = (f / 600) * 16;
  return (
    <>
      <AbsoluteFill
        style={{
          backgroundColor: C.bg,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1.3px, transparent 1.6px)',
          backgroundSize: '32px 32px',
          backgroundPosition: `${16 - drift}px ${16 - drift * 0.5}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 75% 70% at 50% 52%, rgba(7,8,11,0) 55%, rgba(4,5,7,0.75) 100%)',
        }}
      />
    </>
  );
};

/* ───────────────────────── Film ───────────────────────── */

export const Film: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: C.bg, overflow: 'hidden'}}>
      <Backdrop />
      <Network />
      <QubitBars />
      <HUD />

      <Eyebrow num="01" text="RUSH HOUR" start={T.h1[0] - 4} end={T.h1[1]} />
      <Headline lines={[toks('Every evening,'), toks('networks hit rush hour.')]} start={T.h1[0]} end={T.h1[1]} />

      <Eyebrow num="02" text="SHORTEST-PATH ROUTING" start={T.h2[0] - 4} end={T.h2[1]} />
      <Headline
        lines={[toks('Shortest-path routing sends'), toks('everything down the same road.')]}
        start={T.h2[0]}
        end={T.h2[1]}
      />

      <Eyebrow num="03" text="FAILURE" start={T.h3[0] - 4} end={T.h3[1]} />
      <Headline lines={[toks('Then a fibre is cut.')]} start={T.h3[0]} end={T.h3[1]} />
      <LossCounter />

      <Eyebrow num="04" text="Q-ROUTE" start={T.h4[0] - 4} end={T.h4[1]} />
      <Headline
        lines={[
          [
            {w: 'Q-Route', color: C.blue},
            {w: 'searches'},
            {
              w: (
                <>
                  10
                  <span style={{fontSize: '0.56em', position: 'relative', top: '-0.74em', marginLeft: '0.04em', letterSpacing: '-0.02em'}}>
                    27
                  </span>
                </>
              ),
            },
            {w: 'routes'},
          ],
          toks('the quantum-inspired way.'),
        ]}
        start={T.h4[0]}
        end={T.h4[1]}
      />

      <Eyebrow num="05" text="RESULT · SAME CUT, 30 FLOWS RE-PLANNED" start={T.statsIn - 6} end={T.statsOut + 4} />
      <Stats />

      <Logo />
    </AbsoluteFill>
  );
};
