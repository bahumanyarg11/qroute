"""Q-Route Engine beyond networks: one quantum-inspired optimizer (QIEA), many problems.

Every domain is "pick one option per item, under shared constraints, at minimum cost":
  - each item gets NB Q-bits (angle θ, P(1) = sin²θ); measuring them picks an option
  - a domain cost function scores the whole choice vector
  - rotation gates pull every Q-bit toward the best choice vector found so far
Each domain also has a classical baseline so the comparison is honest.
All models are small, synthetic proofs of concept (not production chemistry/biology/logistics).
"""
import itertools, math, time
import numpy as np


# ============================================================ shared QIEA core
def qiea(n_items, n_bits, cost, pop=16, gens=300, seed=0, dtheta=0.025 * np.pi, n_opts=None):
    r = np.random.default_rng(seed)
    theta = np.full((pop, n_items, n_bits), np.pi / 4)
    w = 2 ** np.arange(n_bits)[::-1]
    best_x, best_v, best_J, stall, hist = None, None, np.inf, 0, []
    for g in range(gens):
        bits = (r.random(theta.shape) < np.sin(theta) ** 2).astype(int)
        vals = bits @ w
        if n_opts is not None: vals = vals % n_opts
        Js = [cost(vals[i]) for i in range(pop)]
        i = int(np.argmin(Js))
        if Js[i] < best_J - 1e-9: best_J, best_x, best_v, stall = Js[i], bits[i].copy(), vals[i].copy(), 0
        else: stall += 1
        diff = bits != best_x[None]
        theta += dtheta * np.where(best_x[None] == 1, 1, -1) * diff
        theta = np.clip(theta, 0.03 * np.pi, 0.47 * np.pi)
        if stall >= 25:
            theta[r.random(theta.shape) < 0.15] = np.pi / 4; stall = 0
        hist.append(float(best_J))
    p1 = (np.sin(theta.mean(axis=0)) ** 2).tolist()
    return best_v, hist, p1, pop * gens


def timed(fn, *a, **k):
    t0 = time.perf_counter(); out = fn(*a, **k); return out, time.perf_counter() - t0


# ============================================================ 1. fleet delivery routing (Bengaluru)
DEPOT = ('Infosys, Electronic City', 12.8456, 77.6603)
STOPS = [('Koramangala', 12.9352, 77.6245, 11.0), ('Indiranagar', 12.9784, 77.6408, 12.5), ('Whitefield', 12.9698, 77.7500, 13.0),
         ('HSR Layout', 12.9121, 77.6446, 10.25), ('Jayanagar', 12.9250, 77.5938, 11.5), ('Malleshwaram', 13.0031, 77.5643, 13.5),
         ('Hebbal', 13.0358, 77.5970, 12.0), ('Marathahalli', 12.9591, 77.6974, 12.0), ('BTM Layout', 12.9166, 77.6101, 10.5),
         ('MG Road', 12.9756, 77.6050, 11.5), ('RVCE, Mysuru Rd', 12.9237, 77.4987, 13.75), ('Yelahanka', 13.1007, 77.5963, 12.5)]
ORR = {'Whitefield', 'Marathahalli', 'HSR Layout', 'Koramangala', 'Indiranagar', 'BTM Layout'}   # Outer Ring Road corridor


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) * 1.4      # road distance ≈ 1.4 × great-circle


_ROAD = {}


def road_matrix(pts):
    """Road distance (km) and free-flow drive time (min) between all stops from OpenStreetMap's OSRM router; cached on disk."""
    import json, pathlib, httpx
    f = pathlib.Path(__file__).with_name('data') / 'bengaluru_osrm.json'
    if 'm' in _ROAD: return _ROAD['m']
    if f.exists():
        _ROAD['m'] = json.loads(f.read_text()); return _ROAD['m']
    try:
        coords = ';'.join(f"{lon},{lat}" for lat, lon in pts)
        r = httpx.get(f"https://router.project-osrm.org/table/v1/driving/{coords}", params={'annotations': 'distance,duration'}, timeout=8).json()
        m = dict(km=[[d / 1000 for d in row] for row in r['distances']], min=[[d / 60 for d in row] for row in r['durations']], source='OpenStreetMap / OSRM road network')
        f.parent.mkdir(exist_ok=True); f.write_text(json.dumps(m)); _ROAD['m'] = m; return m
    except Exception:
        return None


def fleet_setup(peak=True, vehicles=2):
    pts = [(DEPOT[1], DEPOT[2])] + [(s[1], s[2]) for s in STOPS]
    n = len(pts)
    road = road_matrix(pts)
    D = np.array(road['km']) if road else np.array([[_km(pts[i], pts[j]) for j in range(n)] for i in range(n)])
    names = [DEPOT[0]] + [s[0] for s in STOPS]
    slow = np.ones((n, n))
    if peak:
        for i in range(n):
            for j in range(n):
                if names[i] in ORR or names[j] in ORR: slow[i, j] = 1.8   # peak-hour ORR congestion
    T = (np.array(road['min']) * 1.6 if road else D / 24.0 * 60) * slow   # OSRM free-flow × 1.6 for city traffic, × 1.8 more on ORR at peak
    due = [None] + [s[3] for s in STOPS]
    return dict(D=D, T=T, names=names, pts=pts, due=due, V=vehicles, peak=peak, road=bool(road))


def fleet_eval(S, routes):
    km = mins = late = 0.0; late_stops = []; finish = []
    for r in routes:
        t, prev = 9 * 60.0, 0
        for s in r:
            km += S['D'][prev, s]; t += S['T'][prev, s]
            if t > S['due'][s] * 60: late += t - S['due'][s] * 60; late_stops.append(s)
            t += 8; prev = s                                             # 8 min service per stop
        km += S['D'][prev, 0]; t += S['T'][prev, 0]; finish.append(t); mins += t - 9 * 60
    return dict(km=km, drive_min=mins, late_min=late, late_stops=late_stops, finish=max(finish) if finish else 540,
                cost=mins + 4 * late + 2 * abs(len(routes[0]) - len(routes[-1])) if routes else 0)


def fleet_decode(v, S):
    n = len(v); routes = [[] for _ in range(S['V'])]
    keys = sorted(range(n), key=lambda i: (v[i] & 7, i))
    for i in keys: routes[(v[i] >> 3) % S['V']].append(i + 1)
    return routes


def fleet_classical(S):
    """Sweep + nearest-neighbour: split stops by angle around the depot, then visit the nearest unvisited stop."""
    d0 = S['pts'][0]; idx = list(range(1, len(S['pts'])))
    ang = sorted(idx, key=lambda i: math.atan2(S['pts'][i][0] - d0[0], S['pts'][i][1] - d0[1]))
    k = math.ceil(len(ang) / S['V']); groups = [ang[i:i + k] for i in range(0, len(ang), k)]
    routes = []
    for g in groups:
        r, cur, left = [], 0, set(g)
        while left:
            nxt = min(left, key=lambda j: S['D'][cur, j]); r.append(nxt); left.remove(nxt); cur = nxt
        routes.append(r)
    return routes


def fleet(peak=True, seed=0):
    S = fleet_setup(peak)
    cr, tc = timed(fleet_classical, S); c = fleet_eval(S, cr)
    (v, hist, p1, ev), tq = timed(qiea, len(STOPS), 4, lambda v: fleet_eval(S, fleet_decode(v, S))['cost'], seed=seed)
    qr = fleet_decode(v, S); q = fleet_eval(S, qr)
    pack = lambda res, routes, t: dict(routes=routes, km=round(res['km'], 1), drive_min=round(res['drive_min']), late_min=round(res['late_min']),
                                       late=[S['names'][i] for i in res['late_stops']], finish=f"{int(res['finish'] // 60):02d}:{int(res['finish'] % 60):02d}",
                                       cost=round(res['cost'], 1), time_s=t)
    return dict(domain='fleet', classical=pack(c, cr, tc), qiea=pack(q, qr, tq), history=hist, qbit_p1=p1, evals=ev,
                places=[dict(name=nm, lat=p[0], lon=p[1], due=(None if d is None else f"{int(d):02d}:{int(round((d % 1) * 60)):02d}"), orr=nm in ORR)
                        for nm, p, d in zip(S['names'], S['pts'], S['due'])],
                space=f"{2 ** (4 * len(STOPS)):.1e}", baseline='Sweep + nearest-neighbour', peak=peak, roads=S['road'])


# ============================================================ 2. protein folding (3D HP cubic lattice)
SEQS = {'S1-20': 'HPHPPHHPHPPHPHHPPHPH', 'S2-24': 'HHPPHPPHPPHPPHPPHPPHPPHH', 'S3-36': 'PPPHHPPHHPPPPPHHHHHHHPPHHPPPPHHPPHPP'}
DIRS3 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def fold_coords(moves):
    xyz = [(0, 0, 0)]
    for m in moves:
        d = DIRS3[int(m) % 6]; x, y, z = xyz[-1]; xyz.append((x + d[0], y + d[1], z + d[2]))
    return xyz


def fold_energy(seq, xyz):
    pos, clash = {}, 0
    for i, p in enumerate(xyz):
        if p in pos: clash += 1
        else: pos[p] = i
    contacts = []
    for i, (x, y, z) in enumerate(xyz):
        if seq[i] != 'H': continue
        for dx, dy, dz in DIRS3:
            j = pos.get((x + dx, y + dy, z + dz))
            if j is not None and j > i + 1 and seq[j] == 'H': contacts.append((i, j))
    return -len(contacts), clash, contacts


def fold_classical(seq):
    """Greedy chain growth on the cubic lattice: each step takes the move with the most H–H contacts now, then the most compact."""
    moves = []
    for k in range(len(seq) - 1):
        best = None
        for m in range(6):
            xyz = fold_coords(moves + [m]); e, c, _ = fold_energy(seq[:len(xyz)], xyz)
            cx, cy, cz = (sum(p[a] for p in xyz) / len(xyz) for a in range(3))
            sc = (e + 10 * c, sum((p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2 for p in xyz))
            if best is None or sc < best[0]: best = (sc, m)
        moves.append(best[1])
    return moves


def protein(seq_key='S1-20', seed=0):
    seq = SEQS.get(seq_key, SEQS['S1-20'])
    cm, tc = timed(fold_classical, seq); cxyz = fold_coords(cm); ce, cc, ccon = fold_energy(seq, cxyz)
    cost = lambda v: (lambda e: e[0] + 2 * e[1])(fold_energy(seq, fold_coords(list(v))))      # soft clash penalty during search
    strict = lambda v: (lambda e: e[0] + 10 * e[1])(fold_energy(seq, fold_coords(list(v))))
    t0 = time.perf_counter(); runs = [qiea(len(seq) - 1, 3, cost, pop=30, gens=1800, seed=seed * 3 + k, n_opts=6) for k in range(3)]   # 3 independent Q-populations
    v, hist, p1, _ = min(runs, key=lambda r: strict(r[0])); ev = sum(r[3] for r in runs); tq = time.perf_counter() - t0
    qxyz = fold_coords(list(v)); qe, qc, qcon = fold_energy(seq, qxyz)
    pack = lambda xyz, e, c, con, t: dict(xyz=xyz, energy=e, clashes=c, contacts=con, time_s=t)
    return dict(domain='protein', seq=seq, seq_key=seq_key, best_known=None, classical=pack(cxyz, ce, cc, ccon, tc), qiea=pack(qxyz, qe, qc, qcon, tq),
                history=hist, qbit_p1=p1, evals=ev, space=f"{5 ** (len(seq) - 2):.1e}", baseline='Greedy chain growth')


# ============================================================ 3. drug fragment design (toy model)
FRAGS = ['–H', '–CH₃', '–F', '–Cl', '–OH', '–NH₂', '–OCH₃', '–CF₃']
# per-fragment property increments: MW, cLogP, HBD, HBA, tPSA, toxicity-alert weight
PROPS = np.array([[1, 0.0, 0, 0, 0, 0], [15, 0.5, 0, 0, 0, 0], [19, 0.14, 0, 0, 0, 0], [35.5, 0.71, 0, 0, 0, .2],
                  [17, -0.67, 1, 1, 20.2, 0], [16, -1.23, 1, 1, 26.0, .3], [31, -0.02, 0, 1, 9.2, 0], [69, 0.88, 0, 0, 0, .1]])
CORE = dict(name='benzene core', MW=78.1, logP=1.9, HBD=0, HBA=0, tPSA=0.0)
SITES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']
# synthetic "pocket fit" (kcal/mol, more negative = better) per site × fragment
FIT = np.array([[0, -.6, -.4, -1.1, -.3, -.2, -.5, -1.5], [0, -.4, -.8, -.6, -1.2, -1.0, -.7, -.3], [0, -.9, -.3, -.7, -.2, -.4, -1.0, -1.2],
                [0, -.2, -.6, -.4, -1.1, -1.3, -.5, -.2], [0, -.8, -.5, -1.0, -.1, -.3, -.6, -1.4], [0, -.3, -.7, -.5, -.9, -.8, -1.1, -.6]])


def drug_eval(v):
    v = list(v); P = PROPS[v].sum(axis=0)
    mw, logp, hbd, hba, tpsa = CORE['MW'] + P[0] - len(v), CORE['logP'] + P[1], CORE['HBD'] + P[2], CORE['HBA'] + P[3], CORE['tPSA'] + P[4]
    dock = float(sum(FIT[i, f] for i, f in enumerate(v)))
    clash = sum(0.8 for i in range(len(v) - 1) if v[i] in (3, 7) and v[i + 1] in (3, 7))      # adjacent bulky halogen groups clash
    hb_pair = sum(-0.5 for i in range(len(v) - 1) if v[i] in (4, 5) and v[i + 1] == 6)       # H-bond donor next to methoxy: bonus
    tox = float(P[5]) + (0.6 if sum(1 for f in v if f in (3, 7)) >= 3 else 0)
    viol = int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)
    desir = max(0, 1 - abs(logp - 2.5) / 3) * max(0, 1 - max(0, tpsa - 90) / 60)              # QED-like desirability (0..1)
    score = dock + clash + hb_pair + 2.0 * tox + 1.5 * viol - 1.5 * desir
    return dict(score=score, dock=dock + clash + hb_pair, MW=mw, logP=logp, HBD=hbd, HBA=hba, tPSA=tpsa, tox=tox, violations=viol, desirability=desir)


def drug(seed=0):
    cv = [int(np.argmin(FIT[i])) for i in range(len(SITES))]             # classical: best pocket fit per site, independently
    t0 = time.perf_counter(); c = drug_eval(cv); tc = time.perf_counter() - t0
    (v, hist, p1, ev), tq = timed(qiea, len(SITES), 3, lambda v: drug_eval(v)['score'], seed=seed)
    q = drug_eval(v)
    t0 = time.perf_counter(); best = min(itertools.product(range(8), repeat=len(SITES)), key=lambda x: drug_eval(x)['score']); tb = time.perf_counter() - t0
    b = drug_eval(best)
    rnd = lambda d: {k: (round(x, 2) if isinstance(x, float) else x) for k, x in d.items()}
    pack = lambda vec, res, t: dict(frags=[FRAGS[f] for f in vec], **rnd(res), time_s=t)
    return dict(domain='drug', core=CORE, sites=SITES, classical=pack(cv, c, tc), qiea=pack(list(v), q, tq), exhaustive=dict(score=round(b['score'], 2), time_s=tb, evals=8 ** len(SITES),
                frags=[FRAGS[f] for f in best], match=[FRAGS[f] for f in best] == [FRAGS[f] for f in v]),
                history=hist, qbit_p1=p1, evals=ev, space=f"{8 ** len(SITES):,}", baseline='Best fit per site (greedy)')


# ============================================================ 4. hospital shift rostering
NURSES = ['Asha', 'Bhavna', 'Chetan', 'Divya', 'Esha', 'Farhan']
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
SHIFTS = ['Off', 'Morning', 'Evening', 'Night']
NEED = {1: 2, 2: 1, 3: 1}                          # per day: 2 morning, 1 evening, 1 night
NO_NIGHTS = {'Bhavna', 'Esha'}                     # soft preferences
SENIOR = {'Asha', 'Chetan', 'Farhan'}               # every night and every morning team needs one senior
WANTS_OFF = {('Chetan', 'Sat'), ('Divya', 'Sun'), ('Asha', 'Wed'), ('Farhan', 'Fri')}


def roster_eval(v):
    R = np.array(v).reshape(len(NURSES), len(DAYS)); gaps = rest = over = pref = 0; issues = []
    for d in range(len(DAYS)):
        for s, k in NEED.items():
            have = int((R[:, d] == s).sum())
            if have < k: gaps += k - have; issues.append(f"{DAYS[d]} {SHIFTS[s].lower()} short by {k - have}")
        for s in (1, 3):
            if not any(R[n, d] == s and NURSES[n] in SENIOR for n in range(len(NURSES))): gaps += 1; issues.append(f"{DAYS[d]} {SHIFTS[s].lower()}: no senior")
    for n, name in enumerate(NURSES):
        work = int((R[n] > 0).sum())
        if work > 5: over += work - 5; issues.append(f"{name} works {work} days")
        for d in range(len(DAYS) - 1):
            if R[n, d] == 3 and R[n, d + 1] == 1: rest += 1; issues.append(f"{name}: night → morning ({DAYS[d]}→{DAYS[d + 1]})")
        for d in range(len(DAYS)):
            if name in NO_NIGHTS and R[n, d] == 3: pref += 1
            if (name, DAYS[d]) in WANTS_OFF and R[n, d] > 0: pref += 1
    return dict(cost=10 * gaps + 8 * rest + 6 * over + 1.5 * pref, gaps=gaps, rest=rest, over=over, pref=pref, issues=issues, grid=R.tolist())


def roster_classical():
    """Greedy day by day: fill each required shift with the least-worked available nurse (no look-ahead for rest rules)."""
    R = np.zeros((len(NURSES), len(DAYS)), int); load = [0] * len(NURSES)
    for d in range(len(DAYS)):
        free = set(range(len(NURSES)))
        for s in (1, 1, 2, 3):
            n = min(free, key=lambda i: (load[i], i)); R[n, d] = s; free.remove(n); load[n] += 1
    return R.flatten().tolist()


def roster(seed=0):
    cv, tc = timed(roster_classical); c = roster_eval(cv)
    (v, hist, p1, ev), tq = timed(qiea, len(NURSES) * len(DAYS), 2, lambda v: roster_eval(v)['cost'], pop=24, gens=1500, seed=seed)
    q = roster_eval(v)
    for x, t in ((c, tc), (q, tq)): x['time_s'] = t
    return dict(domain='roster', nurses=NURSES, days=DAYS, shifts=SHIFTS, no_nights=sorted(NO_NIGHTS), seniors=sorted(SENIOR), wants_off=[list(w) for w in WANTS_OFF],
                classical=c, qiea=q, history=hist, qbit_p1=p1, evals=ev, space=f"{4 ** (len(NURSES) * len(DAYS)):.1e}", baseline='Greedy day-by-day fill')


SOLVERS = dict(fleet=fleet, protein=protein, drug=drug, roster=roster)


if __name__ == '__main__':
    for name, fn in SOLVERS.items():
        t0 = time.perf_counter(); r = fn(); dt = time.perf_counter() - t0
        c, q = r['classical'], r['qiea']
        if name == 'fleet': print('roads:', r['roads']); print(f"fleet  classical {c['km']} km late {c['late_min']} min {c['late']} | QIEA {q['km']} km late {q['late_min']} {q['late']} | {q['time_s']:.2f}s")
        if name == 'protein': print(f"protein classical E={c['energy']} clash={c['clashes']} | QIEA E={q['energy']} clash={q['clashes']} | {q['time_s']:.2f}s")
        if name == 'drug': print(f"drug   classical score {c['score']} viol {c['violations']} tox {c['tox']} logP {c['logP']} | QIEA {q['score']} viol {q['violations']} | exhaustive {r['exhaustive']['score']} match={r['exhaustive']['match']} ({r['exhaustive']['time_s']:.1f}s) | {q['time_s']:.2f}s")
        if name == 'roster': print(f"roster classical cost {c['cost']} gaps {c['gaps']} rest {c['rest']} over {c['over']} pref {c['pref']} | QIEA {q['cost']} gaps {q['gaps']} rest {q['rest']} over {q['over']} pref {q['pref']} | {q['time_s']:.2f}s")
