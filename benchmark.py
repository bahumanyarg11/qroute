"""Q-Route pre-event benchmark: classical shortest path (Dijkstra/OSPF-style) vs a
Quantum-Inspired Evolutionary Algorithm (Q-bit encoding + rotation gates) on NSFNET-14.
Usage: python3 benchmark.py  -> prints results and writes results.json"""
import json, time, itertools
import numpy as np, networkx as nx

EDGES = [(0,1,2100),(0,2,3000),(0,7,4800),(1,2,1200),(1,3,1500),(2,5,3600),(3,4,1200),
         (3,10,3900),(4,5,2400),(4,6,1200),(5,9,2100),(5,13,3600),(6,7,1200),(7,8,1500),
         (8,9,1500),(8,11,600),(8,12,600),(10,11,1200),(10,12,1500),(11,13,600),(12,13,300)]
CAP = 10.0            # Gbps per link
Q0 = 0.5              # ms queueing scale (M/M/1-style u/(1-u))
K, NQ = 8, 3          # candidate paths per flow, qubits per flow (2^3 = 8)

def build(failed=()):
    G = nx.Graph()
    for u, v, km in EDGES:
        if (u, v) in failed or (v, u) in failed: continue
        G.add_edge(u, v, ms=km / 200.0)          # ~200 km/ms in fibre
    return G

def demands(seed=7, n=30, scale=1.0):
    r = np.random.default_rng(seed)
    pairs = [p for p in itertools.permutations(range(14), 2)]
    idx = r.choice(len(pairs), n, replace=False)
    return [(pairs[i][0], pairs[i][1], float(r.uniform(0.6, 2.6)) * scale) for i in idx]

def evaluate(G, flows, paths):
    eidx = {frozenset(e): i for i, e in enumerate(G.edges())}
    load = np.zeros(len(eidx))
    for (s, t, d), p in zip(flows, paths):
        for a, b in zip(p, p[1:]): load[eidx[frozenset((a, b))]] += d
    u = load / CAP
    drop = np.maximum(0, load - CAP).sum()
    lat, tot = 0.0, 0.0
    for (s, t, d), p in zip(flows, paths):
        ms = 0.0
        for a, b in zip(p, p[1:]):
            uu = min(u[eidx[frozenset((a, b))]], 0.95)
            ms += G[a][b]['ms'] + Q0 * uu / (1 - uu)
        lat += d * ms; tot += d
    mlu = float(u.max())
    avg = lat / tot
    J = avg + 100 * max(0, mlu - 0.8) + 50 * drop        # cost: latency + congestion + loss
    return dict(avg_latency_ms=avg, mlu=mlu, overloaded_links=int((u > 1).sum()),
                dropped_gbps=float(drop), cost=J, util=u.tolist(),
                edges=[tuple(sorted(e)) for e in G.edges()])

def dijkstra(G, flows):
    return [nx.shortest_path(G, s, t, weight='ms') for s, t, _ in flows]

def candidates(G, flows):
    out = []
    for s, t, _ in flows:
        c = list(itertools.islice(nx.shortest_simple_paths(G, s, t, weight='ms'), K))
        out.append(c)
    return out

def qiea(G, flows, cands, pop=16, gens=300, seed=0, dtheta=0.025 * np.pi):
    """Quantum-inspired evolutionary search: each flow owns NQ Q-bits; a Q-bit's angle
    theta gives P(1)=sin^2(theta). Observation collapses the register to a path index;
    rotation gates steer amplitudes toward the best route set found; a tunnelling step
    re-opens superposition when the search stagnates."""
    r = np.random.default_rng(seed)
    F = len(flows)
    theta = np.full((pop, F, NQ), np.pi / 4)                # uniform superposition
    w = 2 ** np.arange(NQ)[::-1]
    best_x, best_J, stall, evals, hist = None, np.inf, 0, 0, []
    for g in range(gens):
        bits = (r.random(theta.shape) < np.sin(theta) ** 2).astype(int)   # measurement
        Js = []
        for i in range(pop):
            choice = (bits[i] @ w) % np.array([len(c) for c in cands])
            res = evaluate(G, flows, [cands[f][k] for f, k in enumerate(choice)])
            Js.append(res['cost']); evals += 1
        i = int(np.argmin(Js))
        if Js[i] < best_J - 1e-9: best_J, best_x, stall = Js[i], bits[i].copy(), 0
        else: stall += 1
        diff = bits != best_x[None]                           # rotation gate toward best
        theta += dtheta * np.where(best_x[None] == 1, 1, -1) * diff
        theta = np.clip(theta, 0.03 * np.pi, 0.47 * np.pi)
        if stall >= 25:                                       # quantum tunnelling
            mask = r.random(theta.shape) < 0.15
            theta[mask] = np.pi / 4; stall = 0
        hist.append(best_J)
    choice = (best_x @ w) % np.array([len(c) for c in cands])
    return [cands[f][k] for f, k in enumerate(choice)], evals, hist

def random_search(G, flows, cands, evals, seed=0):
    r = np.random.default_rng(seed)
    best, bp = np.inf, None
    for _ in range(evals):
        p = [c[r.integers(len(c))] for c in cands]
        J = evaluate(G, flows, p)['cost']
        if J < best: best, bp = J, p
    return bp

SCEN = {
    'normal':     dict(scale=0.6, failed=()),
    'congestion': dict(scale=0.9, failed=()),
    'failure':    dict(scale=0.9, failed=((8, 11),)),
}

if __name__ == '__main__':
    out = {}
    for name, sc in SCEN.items():
        G = build(sc['failed']); flows = demands(scale=sc['scale'])
        t0 = time.perf_counter(); cp = dijkstra(G, flows); tc = time.perf_counter() - t0
        c = evaluate(G, flows, cp)
        cands = candidates(G, flows)
        runs, times, hists = [], [], []
        for seed in range(10):
            t0 = time.perf_counter(); qp, ev, h = qiea(G, flows, cands, seed=seed)
            times.append(time.perf_counter() - t0); runs.append(evaluate(G, flows, qp)); hists.append(h)
        best = min(runs, key=lambda x: x['cost'])
        rs = [evaluate(G, flows, random_search(G, flows, cands, ev, seed=s)) for s in range(3)]
        agg = lambda L, k: (float(np.mean([x[k] for x in L])), float(np.std([x[k] for x in L])))
        out[name] = dict(classical=c, classical_time_s=tc, qiea_best=best,
                         qiea_mean={k: agg(runs, k) for k in ['avg_latency_ms', 'mlu', 'overloaded_links', 'dropped_gbps', 'cost']},
                         qiea_time_s=(float(np.mean(times)), float(np.std(times))), evals=ev,
                         random_mean={k: agg(rs, k) for k in ['avg_latency_ms', 'mlu', 'overloaded_links', 'dropped_gbps', 'cost']},
                         hist=np.mean(hists, axis=0).tolist(), n_flows=len(flows),
                         total_gbps=sum(d for *_, d in flows))
        q = out[name]['qiea_mean']
        print(f"\n== {name}  flows={len(flows)} demand={out[name]['total_gbps']:.1f} Gbps")
        print(f" classical : lat {c['avg_latency_ms']:.2f} ms  MLU {c['mlu']:.2f}  overl {c['overloaded_links']}  drop {c['dropped_gbps']:.2f}  J {c['cost']:.1f}")
        print(f" QIEA(10)  : lat {q['avg_latency_ms'][0]:.2f}±{q['avg_latency_ms'][1]:.2f}  MLU {q['mlu'][0]:.2f}±{q['mlu'][1]:.2f}  overl {q['overloaded_links'][0]:.1f}  drop {q['dropped_gbps'][0]:.2f}  J {q['cost'][0]:.1f}±{q['cost'][1]:.1f}  t {np.mean(times):.2f}s  evals {ev}")
        rm = out[name]['random_mean']
        print(f" random    : lat {rm['avg_latency_ms'][0]:.2f}  MLU {rm['mlu'][0]:.2f}  overl {rm['overloaded_links'][0]:.1f}  drop {rm['dropped_gbps'][0]:.2f}  J {rm['cost'][0]:.1f}")
    json.dump(out, open('results.json', 'w'), indent=1)
