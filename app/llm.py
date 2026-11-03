"""LLM layer — Qualcomm Cloud AI Playground (OpenAI-compatible Imagine API) with an offline fallback.

Config (environment or app/.env):
  IMAGINE_API_KEY    your key from https://aisuite.cirrascale.com  (required for the cloud LLM)
  IMAGINE_ENDPOINT   default https://aisuite.cirrascale.com/apis/v2
  IMAGINE_MODEL      default Llama-3.1-8B
Every function returns (result, source) where source is the model name or 'offline'.
The LLM never touches routes: intents go through guard() before the optimizer sees them.
"""
import json, os, re, pathlib
import httpx

ENV = pathlib.Path(__file__).with_name('.env')
if ENV.exists():
    for line in ENV.read_text().splitlines():
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

KEY = os.environ.get('IMAGINE_API_KEY', '')
ENDPOINT = (os.environ.get('IMAGINE_ENDPOINT') or os.environ.get('IMAGINE_ENDPOINT_URL') or 'https://aisuite.cirrascale.com/apis/v2').rstrip('/')
MODEL = os.environ.get('IMAGINE_MODEL', 'Llama-3.1-8B')
STATE = dict(online=None, error='')


def status():
    return dict(configured=bool(KEY), online=STATE['online'], model=MODEL, endpoint=ENDPOINT, error=STATE['error'])


def chat(messages, max_tokens=300, temperature=0.2, timeout=20):
    if not KEY:
        raise RuntimeError('IMAGINE_API_KEY not set')
    r = httpx.post(f'{ENDPOINT}/chat/completions', timeout=timeout,
                   headers={'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'},
                   json=dict(model=MODEL, messages=messages, max_tokens=max_tokens, temperature=temperature, stream=False))
    if r.status_code >= 400:
        STATE.update(online=False, error=f'HTTP {r.status_code}: {r.text[:200]}')
        raise RuntimeError(STATE['error'])
    data = r.json()
    text = data['choices'][0]['message']['content']
    STATE.update(online=True, error='')
    return text.strip()


def _try(messages, **kw):
    try:
        return chat(messages, **kw), MODEL
    except Exception as e:  # network down, bad key, quota … → caller falls back
        STATE.update(online=False, error=str(e)[:200])
        return None, 'offline'

# ----------------------------------------------------------------------------- intent → constraints
ALIASES = {'DELHI': 'DEL', 'NEW DELHI': 'DEL', 'JAIPUR': 'JAI', 'LUCKNOW': 'LKO', 'AHMEDABAD': 'AMD', 'KOLKATA': 'CCU',
           'CALCUTTA': 'CCU', 'NAGPUR': 'NAG', 'BHUBANESWAR': 'BBI', 'MUMBAI': 'BOM', 'BOMBAY': 'BOM', 'PUNE': 'PNQ',
           'HYDERABAD': 'HYD', 'BENGALURU': 'BLR', 'BANGALORE': 'BLR', 'CHENNAI': 'MAA', 'MADRAS': 'MAA', 'KOCHI': 'COK',
           'COCHIN': 'COK', 'NEW YORK': 'NY', 'WASHINGTON': 'DC', 'SEATTLE': 'WA', 'ATLANTA': 'GA', 'HOUSTON': 'TX',
           'CHICAGO': 'IL', 'PITTSBURGH': 'PA', 'NEW JERSEY': 'NJ', 'ANN ARBOR': 'MI', 'BOULDER': 'CO', 'SALT LAKE': 'UT',
           'LINCOLN': 'NE', 'PALO ALTO': 'CA1', 'SAN DIEGO': 'CA2'}


def guard(obj, names, links):
    """Schema + bounds check. Returns (clean_constraints, errors). Nothing unchecked reaches the optimizer."""
    errs, out = [], {}
    if not isinstance(obj, dict):
        return {}, ['not a JSON object']
    names = set(names); links = {frozenset(l) for l in links}
    for k in obj:
        if k not in ('pair_latency', 'avoid_links', 'avoid_nodes', 'max_util'):
            errs.append(f'unknown field "{k}" ignored')
    pl = []
    for c in obj.get('pair_latency', []) or []:
        try:
            s, t, ms = str(c['src']).upper(), str(c['dst']).upper(), float(c['max_ms'])
        except Exception:
            errs.append(f'bad pair_latency entry {c}'); continue
        if s not in names or t not in names or s == t: errs.append(f'unknown pair {s}-{t}'); continue
        if not 1 <= ms <= 500: errs.append(f'latency {ms} ms out of range 1–500'); continue
        pl.append(dict(src=s, dst=t, max_ms=ms))
    if pl: out['pair_latency'] = pl
    al = []
    for l in obj.get('avoid_links', []) or []:
        try:
            a, b = (l.split('-') if isinstance(l, str) else l)[:2]; a, b = a.strip().upper(), b.strip().upper()
        except Exception:
            errs.append(f'bad link {l}'); continue
        if frozenset((a, b)) not in links: errs.append(f'no such link {a}-{b}'); continue
        al.append([a, b])
    if al: out['avoid_links'] = al
    an = [str(n).upper() for n in obj.get('avoid_nodes', []) or []]
    bad = [n for n in an if n not in names]
    if bad: errs.append(f'unknown nodes {bad}')
    an = [n for n in an if n in names][:3]
    if an: out['avoid_nodes'] = an
    if obj.get('max_util') is not None:
        try:
            u = float(obj['max_util']); u = u / 100 if u > 1.5 else u
            if 0.5 <= u <= 1.0: out['max_util'] = u
            else: errs.append(f'max_util {u} out of range 0.5–1.0')
        except Exception:
            errs.append('bad max_util')
    return out, errs


def _norm(text):
    t = ' ' + text.upper() + ' '
    for k, v in sorted(ALIASES.items(), key=lambda kv: -len(kv[0])):
        t = re.sub(r'\b' + k + r'\b', v, t)
    return t


def rule_parse(text, names):
    """Offline intent parser (regex). Covers the demo phrasings; the LLM handles free-form ones."""
    t = _norm(text); N = '|'.join(sorted(map(re.escape, names), key=len, reverse=True))
    sep = r'\s*(?:<->|↔|→|->|–|-|TO|AND|/)\s*'
    out = {}
    for a, b, ms in re.findall(rf'\b({N}){sep}({N})\b[^0-9]{{0,40}}?(\d+(?:\.\d+)?)\s*MS', t):
        out.setdefault('pair_latency', []).append(dict(src=a, dst=b, max_ms=float(ms)))
    for a, b in re.findall(rf'AVOID(?:ING)?\s+(?:THE\s+)?(?:LINK\s+)?({N}){sep}({N})\b', t):
        out.setdefault('avoid_links', []).append([a, b])
    for n in re.findall(rf'AVOID(?:ING)?\s+(?:THE\s+)?(?:NODE\s+|CITY\s+|ROUTER\s+)?({N})\b(?!{sep}(?:{N}))', t):
        out.setdefault('avoid_nodes', []).append(n)
    m = re.search(r'(?:UNDER|BELOW|LESS THAN|<)\s*(\d{2,3})\s*%', t)
    if m: out['max_util'] = float(m.group(1)) / 100
    return out


def _lines_to_rules(raw):
    """Parse the LLM's line format (LATENCY A B ms / AVOID_LINK A B / AVOID_NODE A / MAX_UTIL x) into a rules dict."""
    out = {}
    for ln in raw.splitlines():
        t = ln.replace(',', ' ').replace('–', ' ').replace('-', ' ').split()
        if not t: continue
        k = t[0].upper().rstrip(':')
        try:
            if k == 'LATENCY' and len(t) >= 4: out.setdefault('pair_latency', []).append(dict(src=t[1].upper(), dst=t[2].upper(), max_ms=float(t[3].lower().replace('ms', ''))))
            elif k == 'AVOID_LINK' and len(t) >= 3: out.setdefault('avoid_links', []).append([t[1].upper(), t[2].upper()])
            elif k == 'AVOID_NODE' and len(t) >= 2: out.setdefault('avoid_nodes', []).append(t[1].upper())
            elif k == 'MAX_UTIL' and len(t) >= 2: out['max_util'] = float(t[1].rstrip('%'))
        except ValueError:
            continue
    return out


def parse_intent(text, names, links):
    # Line format, not JSON: the Imagine server treats JSON-looking replies as tool calls and drops the text.
    sys = ("Convert the network operator's request into routing rules, one per line, using ONLY these forms (no JSON, no prose):\n"
           "LATENCY <SRC> <DST> <MAX_MS>\nAVOID_LINK <A> <B>\nAVOID_NODE <ID>\nMAX_UTIL <0.5-1.0>\n"
           "Node ids: " + ', '.join(names) + '. Existing links: ' + ', '.join('-'.join(l) for l in links) + '. City names: '
           + ', '.join(f'{k.title()}={v}' for k, v in ALIASES.items() if v in names) + '. Output only the rule lines the request needs.')
    raw, src = _try([{'role': 'system', 'content': sys}, {'role': 'user', 'content': text}], max_tokens=150, temperature=0.1)   # API returns empty text at temperature 0
    obj = _lines_to_rules(raw) if raw else None
    if not obj:
        obj, src = rule_parse(text, names), ('offline' if src == 'offline' else f'{src} → offline parser')
    clean, errs = guard(obj, names, links)
    if not clean and not errs:
        errs = ['no rule recognised — try e.g. “Keep CA1 to PA under 50 ms and avoid IL-PA”']
    return dict(constraints=clean, errors=errs, source=src, raw=raw or json.dumps(obj))


# ----------------------------------------------------------------------------- explanations
def facts(res, scn, cons):
    c, q = res['classical'], res['qiea']
    hot = sorted(c['util'].items(), key=lambda kv: -kv[1])[:3]
    return dict(network=scn['topo']['title'], traffic_surge_pct=round(scn['surge'] * 100), failed_links=['-'.join(f) for f in scn['failed']],
                operator_constraints=cons, flows=len(res['flows']), flows_moved=len(res['moved']),
                dijkstra=dict(peak_load_pct=round(c['mlu'] * 100), lost_gbps=round(c['dropped_gbps'], 2), avg_latency_ms=round(c['avg_latency_ms'], 1),
                              overloaded_links=c['overloaded'], sla_violations=len(c['sla_violations'])),
                q_route=dict(peak_load_pct=round(q['mlu'] * 100), lost_gbps=round(q['dropped_gbps'], 2), avg_latency_ms=round(q['avg_latency_ms'], 1),
                             overloaded_links=q['overloaded'], sla_violations=len(q['sla_violations']), solve_s=round(q['time_s'], 2)),
                hottest_links_under_dijkstra={k: f'{round(v * 100)}%' for k, v in hot},
                biggest_reroutes=[dict(flow=f"{m['src']}->{m['dst']}", gbps=m['gbps'], old='-'.join(m['old']), new='-'.join(m['new']),
                                       left_hot_link=f"{m['hot_link']} at {round(m['hot_util'] * 100)}%", latency_ms=f"{m['lat_old']} -> {m['lat_new']}")
                                  for m in res['moved'][:4]])


def template_explain(f):
    d, q = f['dijkstra'], f['q_route']
    s = []
    cause = (f"After the {', '.join(f['failed_links'])} cut" if f['failed_links'] else 'Under this load') + \
            (f" and a {f['traffic_surge_pct']}% surge" if f['traffic_surge_pct'] else '')
    hk, hv = next(iter(f['hottest_links_under_dijkstra'].items()))
    s.append(f"{cause}, shortest-path routing pushes {hk} to {hv}" + (f" and drops {d['lost_gbps']} Gbps." if d['lost_gbps'] > 0 else '.'))
    s.append(f"Q-Route moved {f['flows_moved']} of {f['flows']} flows: peak load {d['peak_load_pct']}% → {q['peak_load_pct']}%, "
             f"loss {d['lost_gbps']} → {q['lost_gbps']} Gbps, average latency {d['avg_latency_ms']} → {q['avg_latency_ms']} ms.")
    if f['biggest_reroutes']:
        m = f['biggest_reroutes'][0]
        s.append(f"Biggest change: {m['flow']} ({m['gbps']} Gbps) now takes {m['new']} instead of {m['old']}, leaving {m['left_hot_link']} ({m['latency_ms']} ms).")
    if f['operator_constraints']:
        s.append(f"Your rules are respected: {q['sla_violations']} latency violations for Q-Route vs {d['sla_violations']} for Dijkstra.")
    return ' '.join(s)


def explain(f):
    sys = ("You are Q-Route's network-operations assistant. Explain to a NOC engineer, in at most 90 words of plain English "
           "and no markdown, why Q-Route's routes beat shortest-path routing in this run. Use only the numbers in the JSON; never invent data. "
           "Mention the cause, the biggest reroute and the trade-off.")
    text, src = _try([{'role': 'system', 'content': sys}, {'role': 'user', 'content': json.dumps(f)}], max_tokens=220)
    return (text, src) if text else (template_explain(f), 'offline')


def answer(question, res, scn, cons):
    f = facts(res, scn, cons)
    t = _norm(question); names = scn['topo']['names']
    hit = [n for n in sorted(names, key=len, reverse=True) if re.search(rf'\b{re.escape(n)}\b', t)]
    flow = None
    for m in res['moved']:
        if {m['src'], m['dst']} <= set(hit): flow = m; break
    if flow is None and len(hit) >= 2:
        for i, fl in enumerate(res['flows']):
            if {fl['src'], fl['dst']} <= set(hit):
                flow = dict(src=fl['src'], dst=fl['dst'], gbps=fl['gbps'], old=res['classical']['paths'][i], new=res['qiea']['paths'][i],
                            lat_old=round(res['classical']['flow_latency'][i], 1), lat_new=round(res['qiea']['flow_latency'][i], 1), hot_link=None); break
    ctx = dict(f, asked_flow=None if flow is None else dict(flow=f"{flow['src']}->{flow['dst']}", gbps=flow['gbps'],
                                                               dijkstra_path='-'.join(flow['old']), q_route_path='-'.join(flow['new']),
                                                               latency_ms=f"{flow['lat_old']} -> {flow['lat_new']}",
                                                               left_hot_link=flow.get('hot_link') and f"{flow['hot_link']} at {round(flow['hot_util'] * 100)}%"))
    sys = ("You are Q-Route's network-operations assistant. Answer the operator's question in at most 80 words of plain English, "
           "no markdown, using only facts in the JSON. If the JSON does not contain the answer, say so.")
    text, src = _try([{'role': 'system', 'content': sys}, {'role': 'user', 'content': f'Facts: {json.dumps(ctx)}\nQuestion: {question}'}], max_tokens=200)
    if text: return text, src
    if flow is None:
        return ("I can explain any flow by its two end points, e.g. “Why did CA1→PA move?”. " + template_explain(f)), 'offline'
    if flow['old'] == flow['new']:
        return (f"{flow['src']}→{flow['dst']} did not move: its shortest path {'–'.join(flow['old'])} stays within capacity "
                f"({flow['lat_new']} ms)."), 'offline'
    if flow.get('hot_link') and flow['hot_link'] not in {'-'.join(sorted(e)) for e in zip(flow['new'], flow['new'][1:])}:
        why = f"its shortest path crosses {flow['hot_link']}, which would run at {round(flow['hot_util'] * 100)}% of capacity"
    elif flow.get('hot_link'):
        why = f"spreading traffic brings {flow['hot_link']} down from {round(flow['hot_util'] * 100)}% to {round(flow.get('hot_util_new', 0) * 100)}%"
    else:
        why = 'it relieves a busy link'
    dl = flow['lat_old'] - flow['lat_new']
    return (f"{flow['src']}→{flow['dst']} ({flow['gbps']} Gbps) moved from {'–'.join(flow['old'])} to {'–'.join(flow['new'])} because {why}. "
            f"The new path is {abs(dl):.1f} ms {'faster' if dl >= 0 else 'slower'} and no packets are dropped."), 'offline'


def explain_generic(domain, facts, fallback):
    """Explain a non-network optimisation result in plain English; deterministic fallback if the LLM is unreachable."""
    sys = ("You are the Q-Route Engine assistant. In at most 80 words of plain English, no markdown, explain to a hackathon judge why the "
           f"quantum-inspired result beats the classical baseline for this {domain} problem. Use only the numbers in the JSON; never invent data. "
           "If the model is a toy proof of concept, say so briefly.")
    text, src = _try([{'role': 'system', 'content': sys}, {'role': 'user', 'content': json.dumps(facts)}], max_tokens=200)
    return (text, src) if text else (fallback, 'offline')
