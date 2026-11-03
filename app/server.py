"""Q-Route Console — FastAPI backend.  Run:  ./run.sh   (or: python3 -m uvicorn server:app --port 8000)"""
import pathlib
from typing import Optional
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import engine, llm

HERE = pathlib.Path(__file__).parent
app = FastAPI(title='Q-Route Console')
app.mount('/static', StaticFiles(directory=HERE / 'static'), name='static')
LAST = {}   # single-operator demo: last scenario / constraints / result


class Scn(BaseModel):
    topo: str = 'nsfnet'
    surge: float = 0.5
    failed: Optional[list] = None
    n_flows: int = 30
    seed: int = 7
    qseed: int = 0
    constraints: dict = {}


class Text(BaseModel):
    text: str
    topo: str = 'nsfnet'


def _scn(p: Scn):
    failed = None if p.failed is None else [tuple(x.split('-')) if isinstance(x, str) else tuple(x) for x in p.failed]
    return engine.make_scenario(p.topo, p.surge, failed, p.n_flows, p.seed)


@app.get('/')
def index():
    return FileResponse(HERE / 'static' / 'index.html')


@app.get('/api/status')
def status():
    return dict(llm=llm.status(), topologies=engine.TOPOS)


@app.post('/api/scenario')
def scenario(p: Scn):
    s = _scn(p)
    return dict(topo=engine.topo_json(s), flows=[dict(src=a, dst=b, gbps=round(d, 2)) for a, b, d in s['flows']])


@app.post('/api/solve')
def solve(p: Scn):
    s = _scn(p)
    t = s['topo']; links = [(a, b) for a, b, _ in t['edges']]
    cons, errs = llm.guard(p.constraints or {}, t['names'], links)   # re-check: the client is untrusted too
    res = engine.solve(s, cons, seed=p.qseed)
    LAST.update(scn=s, cons=cons, res=res)
    return dict(res, topo=engine.topo_json(s), constraints=cons, constraint_errors=errs)


@app.post('/api/intent')
def intent(p: Text):
    t = engine.topology(p.topo)
    return llm.parse_intent(p.text, t['names'], [(a, b) for a, b, _ in t['edges']])


@app.post('/api/explain')
def explain():
    if not LAST: return dict(text='Run both routers first.', source='offline')
    f = llm.facts(LAST['res'], LAST['scn'], LAST['cons'])
    text, src = llm.explain(f)
    return dict(text=text, source=src, facts=f)


@app.post('/api/ask')
def ask(p: Text):
    if not LAST: return dict(text='Run both routers first.', source='offline')
    text, src = llm.answer(p.text, LAST['res'], LAST['scn'], LAST['cons'])
    return dict(text=text, source=src)


@app.get('/api/benchmark')
def benchmark():
    """Pre-event benchmark (../benchmark.py, ../scale.py) for the Results page."""
    import json
    R = json.loads((HERE.parent / 'results.json').read_text())
    SC = json.loads((HERE.parent / 'scaling.json').read_text())
    keys = ('avg_latency_ms', 'mlu', 'overloaded_links', 'dropped_gbps', 'cost')
    CODE = [n for n, _, _ in engine.NSF_NODES]
    out = {}
    for name, v in R.items():
        out[name] = dict(classical={k: v['classical'][k] for k in keys},
                         qiea={k: v['qiea_mean'][k][0] for k in keys}, qiea_sd={k: v['qiea_mean'][k][1] for k in keys},
                         random={k: v['random_mean'][k][0] for k in keys}, qiea_time_s=v['qiea_time_s'][0],
                         evals=v['evals'], total_gbps=v['total_gbps'], n_flows=v['n_flows'], hist=v['hist'][::3],
                         util_classical={engine.link_key(CODE[e[0]], CODE[e[1]]): u for e, u in zip(v['classical']['edges'], v['classical']['util'])},
                         util_qiea={engine.link_key(CODE[e[0]], CODE[e[1]]): u for e, u in zip(v['qiea_best']['edges'], v['qiea_best']['util'])})
    return dict(scenarios=out, scaling=SC)


class Prompt(BaseModel):
    system: str = 'You are Q-Route, a concise optimisation assistant. Answer in 2-4 plain sentences.'
    prompt: str


@app.post('/api/llm')
def llm_any(p: Prompt):
    """Generic LLM call for the Android app (any domain). The API key never leaves this server."""
    text, src = llm._try([dict(role='system', content=p.system[:2000]), dict(role='user', content=p.prompt[:4000])], max_tokens=260)
    return dict(text=text, source=src)


import domains
CASES = {}


class Case(BaseModel):
    seed: int = 0
    peak: bool = True
    seq: str = 'S1-20'


@app.post('/api/domain/{name}')
def domain(name: str, p: Case):
    if name not in domains.SOLVERS: return dict(error=f'unknown domain {name}')
    kw = dict(fleet=dict(peak=p.peak, seed=p.seed), protein=dict(seq_key=p.seq, seed=p.seed)).get(name, dict(seed=p.seed))
    r = domains.SOLVERS[name](**kw); CASES[name] = r
    return r


def _case_facts(name, r):
    c, q = r['classical'], r['qiea']
    if name == 'fleet':
        f = dict(problem='2 delivery vans, 12 Bengaluru stops with deadlines, real road distances (OpenStreetMap)', peak_hour_traffic=r['peak'], baseline=r['baseline'],
                 classical=dict(km=c['km'], late_stops=c['late'], late_minutes=c['late_min'], back_at=c['finish']),
                 q_route=dict(km=q['km'], late_stops=q['late'], late_minutes=q['late_min'], back_at=q['finish'], solve_s=round(q['time_s'], 2)))
        fb = (f"With {'peak-hour Outer Ring Road traffic' if r['peak'] else 'normal traffic'}, sweep + nearest-neighbour drives {c['km']} km"
              + (f" and reaches {', '.join(c['late'])} {c['late_min']} min late" if c['late'] else '') + f". Q-Route re-orders both vans together: {q['km']} km, "
              + (f"{len(q['late'])} late stops" if q['late'] else 'every deadline met') + f", back at {q['finish']} — planned in {q['time_s']:.2f} s.")
    elif name == 'protein':
        f = dict(problem='3D HP cubic-lattice protein folding (toy model)', sequence=r['seq'], baseline=r['baseline'],
                 classical=dict(energy=c['energy'], hh_contacts=len(c['contacts'])), q_route=dict(energy=q['energy'], hh_contacts=len(q['contacts']), solve_s=round(q['time_s'], 2)))
        fb = (f"Greedy chain growth commits to each turn without look-ahead and finds {len(c['contacts'])} H–H contacts (energy {c['energy']}). "
              f"Q-Route searches all {r['space']} 3D folds jointly and finds {len(q['contacts'])} contacts (energy {q['energy']}), burying more hydrophobic residues together. Toy lattice model.")
    elif name == 'drug':
        e = r['exhaustive']
        f = dict(problem='choose 1 of 8 fragments at 6 sites of a scaffold (toy scoring model)', baseline=r['baseline'],
                 classical=dict(score=c['score'], fragments=c['frags'], toxicity=c['tox'], logP=c['logP']), q_route=dict(score=q['score'], fragments=q['frags'], toxicity=q['tox'], logP=q['logP']),
                 exhaustive_check=dict(score=e['score'], combinations=e['evals'], q_route_matches=e['match']))
        fb = (f"Choosing the best pocket fit at each site independently scores {c['score']} but stacks bulky halogens (toxicity alert {c['tox']}). "
              f"Q-Route scores all six sites together and reaches {q['score']}" + (", the exact optimum — confirmed by checking all 262,144 combinations" if e['match'] else '') + ". Toy scoring model, not real docking.")
    else:
        f = dict(problem='6 nurses × 7 days, 4 shift types, coverage + seniority + rest rules', baseline=r['baseline'],
                 classical=dict(hard_violations=c['gaps'] + c['rest'] + c['over'], preference_misses=c['pref'], issues=c['issues'][:4]),
                 q_route=dict(hard_violations=q['gaps'] + q['rest'] + q['over'], preference_misses=q['pref'], issues=q['issues'][:4]))
        fb = (f"A greedy day-by-day fill leaves {c['gaps'] + c['rest'] + c['over']} hard rule breaks (e.g. {c['issues'][0] if c['issues'] else 'none'}) and {c['pref']} preference misses. "
              f"Q-Route plans the whole week at once: {q['gaps'] + q['rest'] + q['over']} hard breaks and {q['pref']} preference misses.")
    return f, fb


@app.post('/api/domain/{name}/explain')
def domain_explain(name: str):
    if name not in CASES: return dict(text='Run the solver first.', source='offline')
    f, fb = _case_facts(name, CASES[name])
    text, src = llm.explain_generic(name, f, fb)
    return dict(text=text, source=src)
