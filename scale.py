"""Scaling test: same total surge demand (~41 Gbps) + NY-PA cut, split over more flows."""
import json, time, numpy as np
from benchmark import build, demands, dijkstra, candidates, evaluate, qiea
G = build(((8, 11),)); out = []
for nf in (15, 30, 60, 120):
    flows = demands(n=nf, scale=0.9 * 30 / nf)
    c = evaluate(G, flows, dijkstra(G, flows)); cands = candidates(G, flows)
    ts, rs = [], []
    for seed in range(3):
        t0 = time.perf_counter(); p, ev, _ = qiea(G, flows, cands, seed=seed); ts.append(time.perf_counter() - t0)
        rs.append(evaluate(G, flows, p))
    row = dict(flows=nf, time_s=float(np.mean(ts)), c_drop=c['dropped_gbps'], q_drop=float(np.mean([r['dropped_gbps'] for r in rs])),
               c_mlu=c['mlu'], q_mlu=float(np.mean([r['mlu'] for r in rs])), space_log10=nf * np.log10(8))
    out.append(row); print(row, flush=True)
json.dump(out, open('scaling.json', 'w'), indent=1)
