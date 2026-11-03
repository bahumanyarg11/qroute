"""Q-Route engine: topologies, traffic, classical (Dijkstra) and quantum-inspired (QIEA) routers, scoring.

Same model as ../benchmark.py (the numbers in the deck), extended with operator constraints:
  pair_latency  [{"src","dst","max_ms"}]  latency SLA for flows between two nodes
  avoid_links   [["A","B"]]               never route over these links
  avoid_nodes   ["A"]                     never transit these nodes
  max_util      0.5 .. 1.0                target peak link utilisation (default 0.8)
"""
import itertools, math, time
import numpy as np
import networkx as nx

CAP = 10.0      # Gbps per link
Q0 = 0.5        # ms, M/M/1-style queueing scale
K, NQ = 8, 3    # candidate paths per flow, Q-bits per flow

# ----------------------------------------------------------------------------- topologies
NSF_NODES = [('WA', 40, 70), ('CA1', 20, 175), ('CA2', 70, 270), ('UT', 150, 150), ('CO', 235, 175), ('TX', 265, 290),
             ('NE', 325, 150), ('IL', 400, 110), ('PA', 505, 120), ('GA', 470, 290), ('MI', 440, 40), ('NY', 590, 65),
             ('NJ', 595, 140), ('DC', 570, 215)]
NSF_EDGES = [(0, 1, 2100), (0, 2, 3000), (0, 7, 4800), (1, 2, 1200), (1, 3, 1500), (2, 5, 3600), (3, 4, 1200),
             (3, 10, 3900), (4, 5, 2400), (4, 6, 1200), (5, 9, 2100), (5, 13, 3600), (6, 7, 1200), (7, 8, 1500),
             (8, 9, 1500), (8, 11, 600), (8, 12, 600), (10, 11, 1200), (10, 12, 1500), (11, 13, 600), (12, 13, 300)]

IN_NODES = [('DEL', 28.61, 77.21), ('JAI', 26.91, 75.79), ('LKO', 26.85, 80.95), ('AMD', 23.02, 72.57),
            ('CCU', 22.57, 88.36), ('NAG', 21.15, 79.09), ('BBI', 20.30, 85.82), ('BOM', 19.08, 72.88),
            ('PNQ', 18.52, 73.86), ('HYD', 17.39, 78.49), ('BLR', 12.97, 77.59), ('MAA', 13.08, 80.27), ('COK', 9.93, 76.27)]
IN_LINKS = [('DEL', 'JAI'), ('DEL', 'LKO'), ('DEL', 'NAG'), ('JAI', 'AMD'), ('LKO', 'CCU'), ('LKO', 'NAG'), ('AMD', 'BOM'),
            ('AMD', 'NAG'), ('BOM', 'PNQ'), ('BOM', 'NAG'), ('PNQ', 'HYD'), ('PNQ', 'BLR'), ('NAG', 'HYD'), ('CCU', 'BBI'),
            ('BBI', 'HYD'), ('BBI', 'MAA'), ('HYD', 'BLR'), ('HYD', 'MAA'), ('BLR', 'MAA'), ('BLR', 'COK'), ('COK', 'MAA')]


def _haversine(a, b):
    (la1, lo1), (la2, lo2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _india():
    names = [n for n, _, _ in IN_NODES]; ll = {n: (a, b) for n, a, b in IN_NODES}
    pos = {n: ((lo - 71.5) / (89.5 - 71.5) * 600 + 10, (29.5 - la) / (29.5 - 9.0) * 300) for n, la, lo in IN_NODES}
    edges = [(names.index(a), names.index(b), round(_haversine(ll[a], ll[b]) * 1.3)) for a, b in IN_LINKS]  # fibre ≈ 1.3× great-circle
    return names, pos, edges


def topology(name):
    if name == 'india':
        names, pos, edges = _india(); title = 'India-13 backbone'
    else:
        names = [n for n, _, _ in NSF_NODES]; pos = {n: (x, y) for n, x, y in NSF_NODES}
        edges = NSF_EDGES; title = 'NSFNET-14 (US research backbone)'
    return dict(key=name, title=title, names=names, pos=pos, edges=[(names[u], names[v], km) for u, v, km in edges])


TOPOS = {'nsfnet': 'NSFNET-14 (US backbone)', 'india': 'India-13 backbone'}
DEFAULT_FAIL = {'nsfnet': [('NY', 'PA')], 'india': [('NAG', 'HYD')]}

# ----------------------------------------------------------------------------- scenario
def demands(n_nodes, seed=7, n=30, scale=1.0):
    """Identical generator to benchmark.py (seed 7 reproduces the deck)."""
    r = np.random.default_rng(seed)
    pairs = list(itertools.permutations(range(n_nodes), 2))
    idx = r.choice(len(pairs), n, replace=False)
    return [(pairs[i][0], pairs[i][1], float(r.uniform(0.6, 2.6)) * scale) for i in idx]


def build_graph(topo, failed=()):
    fs = {frozenset(e) for e in failed}
    G = nx.Graph()
    G.add_nodes_from(topo['names'])
    for a, b, km in topo['edges']:
        if frozenset((a, b)) not in fs:
            G.add_edge(a, b, ms=km / 200.0, km=km)
    return G


def make_scenario(topo_key='nsfnet', surge=0.5, failed=None, n_flows=30, seed=7):
    topo = topology(topo_key)
    failed = DEFAULT_FAIL[topo_key] if failed is None else [tuple(f) for f in failed]
    names = topo['names']
    base = {'nsfnet': 0.6, 'india': 0.4}[topo_key]   # nsfnet 0.6 = the deck's 'normal' load
    flows = [(names[s], names[t], d) for s, t, d in demands(len(names), seed, n_flows, base * (1 + surge))]
    return dict(topo=topo, failed=failed, flows=flows, surge=surge, seed=seed)

# ----------------------------------------------------------------------------- scoring
def link_key(a, b):
    return '-'.join(sorted((a, b)))


def evaluate(G, flows, paths, cons=None):
    cons = cons or {}
    target = float(cons.get('max_util', 0.8))
    load = {link_key(a, b): 0.0 for a, b in G.edges()}
    for (s, t, d), p in zip(flows, paths):
        for a, b in zip(p, p[1:]):
            load[link_key(a, b)] += d
    util = {k: v / CAP for k, v in load.items()}
    drop = sum(max(0.0, v - CAP) for v in load.values())
    lat_f, tot, wl = [], 0.0, 0.0
    for (s, t, d), p in zip(flows, paths):
        ms = 0.0
        for a, b in zip(p, p[1:]):
            u = min(util[link_key(a, b)], 0.95)
            ms += G[a][b]['ms'] + Q0 * u / (1 - u)
        lat_f.append(ms); wl += d * ms; tot += d
    sla_pen, viol = 0.0, []
    for c in cons.get('pair_latency', []):
        for i, (s, t, d) in enumerate(flows):
            if {s, t} == {c['src'], c['dst']} and lat_f[i] > c['max_ms']:
                sla_pen += 20 * (lat_f[i] - c['max_ms']); viol.append(i)
    mlu = max(util.values()) if util else 0.0
    avg = wl / tot if tot else 0.0
    J = avg + 100 * max(0.0, mlu - target) + 50 * drop + sla_pen
    return dict(avg_latency_ms=avg, mlu=mlu, overloaded=sum(u > 1 for u in util.values()), dropped_gbps=drop,
                cost=J, util=util, flow_latency=lat_f, sla_violations=viol)

# ----------------------------------------------------------------------------- routers
def _route_graph(G, cons):
    H = G.copy()
    for a, b in cons.get('avoid_links', []):
        if H.has_edge(a, b): H.remove_edge(a, b)
    for n in cons.get('avoid_nodes', []):
        if n in H: H.remove_edges_from(list(H.edges(n)))
    return H


def dijkstra(G, flows, cons=None):
    """Classical baseline: OSPF-style shortest path on propagation delay (admin-excluded links removed)."""
    H = _route_graph(G, cons or {})
    out = []
    for s, t, _ in flows:
        try: out.append(nx.shortest_path(H, s, t, weight='ms'))
        except nx.NetworkXNoPath: out.append(nx.shortest_path(G, s, t, weight='ms'))
    return out


def candidates(G, flows, cons=None):
    H = _route_graph(G, cons or {})
    avoid_n = set(cons.get('avoid_nodes', [])) if cons else set()
    out = []
    for s, t, _ in flows:
        try:
            c = [p for p in itertools.islice(nx.shortest_simple_paths(H, s, t, weight='ms'), K)
                 if not (set(p[1:-1]) & avoid_n)]
        except nx.NetworkXNoPath:
            c = []
        out.append(c or [nx.shortest_path(G, s, t, weight='ms')])
    return out


def qiea(G, flows, cands, cons=None, pop=16, gens=300, seed=0, dtheta=0.025 * np.pi):
    """Quantum-inspired evolutionary algorithm (Han & Kim style Q-bit individuals).
    Each flow owns NQ Q-bits; angle θ gives P(bit=1)=sin²θ. Measurement collapses a register to one
    path index per flow, a rotation gate turns θ toward the best route set found, and a tunnelling
    step resets part of the register to |+> when the search stalls."""
    r = np.random.default_rng(seed)
    F = len(flows); sizes = np.array([len(c) for c in cands])
    theta = np.full((pop, F, NQ), np.pi / 4)
    w = 2 ** np.arange(NQ)[::-1]
    best_x, best_J, stall, hist = None, np.inf, 0, []
    for g in range(gens):
        bits = (r.random(theta.shape) < np.sin(theta) ** 2).astype(int)
        Js = []
        for i in range(pop):
            ch = (bits[i] @ w) % sizes
            Js.append(evaluate(G, flows, [cands[f][k] for f, k in enumerate(ch)], cons)['cost'])
        i = int(np.argmin(Js))
        if Js[i] < best_J - 1e-9: best_J, best_x, stall = Js[i], bits[i].copy(), 0
        else: stall += 1
        diff = bits != best_x[None]
        theta += dtheta * np.where(best_x[None] == 1, 1, -1) * diff
        theta = np.clip(theta, 0.03 * np.pi, 0.47 * np.pi)
        if stall >= 25:
            theta[r.random(theta.shape) < 0.15] = np.pi / 4; stall = 0
        hist.append(float(best_J))
    ch = (best_x @ w) % sizes
    p1 = np.sin(theta.mean(axis=0)) ** 2          # final mean P(1) per flow/Q-bit (for the UI)
    return [cands[f][k] for f, k in enumerate(ch)], hist, p1.tolist(), pop * gens


def solve(scn, cons=None, seed=0, budget_s=5.0):
    cons = cons or {}
    G = build_graph(scn['topo'], scn['failed'])
    flows = scn['flows']
    t0 = time.perf_counter(); cp = dijkstra(G, flows, cons); tc = time.perf_counter() - t0
    c = evaluate(G, flows, cp, cons)
    t0 = time.perf_counter()
    cands = candidates(G, flows, cons)
    qp, hist, p1, evals = qiea(G, flows, cands, cons, seed=seed)
    tq = time.perf_counter() - t0
    q = evaluate(G, flows, qp, cons)
    fallback = tq > budget_s and q['cost'] >= c['cost']
    if fallback: qp, q = cp, c                      # fail-safe: keep classical routes
    moved = []
    for i, ((s, t, d), a, b) in enumerate(zip(flows, cp, qp)):
        if a != b:
            new_links = {link_key(*e) for e in zip(b, b[1:])}
            old_links = [link_key(*e) for e in zip(a, a[1:])]
            left = [k for k in old_links if k not in new_links] or old_links
            hot = max(left, key=lambda k: c['util'][k])
            moved.append(dict(i=i, src=s, dst=t, gbps=round(d, 2), old=a, new=b, hot_link=hot,
                              hot_util=round(c['util'][hot], 3), hot_util_new=round(q['util'].get(hot, 0.0), 3),
                              lat_old=round(c['flow_latency'][i], 1), lat_new=round(q['flow_latency'][i], 1)))
    moved.sort(key=lambda m: (-m['hot_util'], -(m['lat_old'] - m['lat_new'])))
    pack = lambda res, paths, t: dict(paths=paths, time_s=t, avg_latency_ms=res['avg_latency_ms'], mlu=res['mlu'],
                                      overloaded=res['overloaded'], dropped_gbps=res['dropped_gbps'], cost=res['cost'],
                                      util=res['util'], flow_latency=res['flow_latency'], sla_violations=res['sla_violations'])
    return dict(classical=pack(c, cp, tc), qiea=pack(q, qp, tq), history=hist, qbit_p1=p1, evals=evals,
                moved=moved, fallback=fallback,
                flows=[dict(src=s, dst=t, gbps=round(d, 2)) for s, t, d in flows])


def topo_json(scn):
    t = scn['topo']
    return dict(key=t['key'], title=t['title'], nodes=[dict(id=n, x=t['pos'][n][0], y=t['pos'][n][1]) for n in t['names']],
                links=[dict(id=link_key(a, b), a=a, b=b, km=km) for a, b, km in t['edges']],
                failed=[link_key(*f) for f in scn['failed']])
