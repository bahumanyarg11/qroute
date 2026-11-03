# Q-Route — quantum-inspired network route optimizer

**Team ReZero · R V College of Engineering, Bengaluru** — Infosys IGNITE ENG NEXT 2026 Hack-AI-Thon, problem ET-08.
Bahumanya R G (lead), Harshith V M, Cheritha Kaiwar.

A quantum-inspired evolutionary algorithm (QIEA: Q-bit superposition, measurement, rotation gates — simulated on a CPU)
re-plans all traffic flows jointly after surges and fibre cuts, raced live against classical Dijkstra/OSPF routing.
The same engine also solves fleet delivery on real Bengaluru roads, 3D protein folding, drug fragment design and nurse rostering.
An LLM on Qualcomm Cloud AI Playground parses plain-English routing rules and explains results; it never writes routes.

## Run locally (2 commands)
```bash
pip install -r requirements.txt
cd app && uvicorn server:app --port 8000
```
Open http://localhost:8000 (add `?nointro` to skip the loading screen). Works fully offline; for live LLM text,
copy `app/.env.example` to `app/.env` and paste your Qualcomm Imagine API key (never commit `.env`).

## Host it (free, ~3 min)
**Render.com:** New → Blueprint → pick this repo (uses `render.yaml`) → set `IMAGINE_API_KEY` in the dashboard (optional) → Deploy.
**Railway / Heroku-style hosts:** use the `Procfile` (`cd app && uvicorn server:app --host 0.0.0.0 --port $PORT`).
It needs a Python host (FastAPI backend) — GitHub Pages alone cannot run the solver.

Reproduce the benchmark numbers: `python3 benchmark.py` and `python3 scale.py`.

---

# Q-Route — Hack-AI-Thon day runbook (Team ReZero, ET-08)

Everything is built and tested. The console runs **fully offline**; only the LLM explanation
needs Wi-Fi + an API key, and it falls back to a deterministic explainer if the cloud is unreachable.

## The only thing you must do yourself (5 min)
1. Create a free account on **Qualcomm Cloud AI Playground** → https://aisuite.cirrascale.com (Imagine API docs page) and generate an **API key**.
2. Open `qroute/app/.env` and paste it after `IMAGINE_API_KEY=` (no quotes). Save.
3. Check it:
   ```bash
   cd ~/Infosys/qroute/app && python3 check_llm.py
   ```
   ✓ `chat works` → done. If it says *model not in list*, copy a model name it prints into `IMAGINE_MODEL=` in `.env`.
   If it says *endpoint path wrong*, copy the endpoint URL shown on the Playground API page into `IMAGINE_ENDPOINT=`.

No other accounts are needed. Arduino UNO Q is **not** required for ET-08 (its listed platform is Cloud AI Playground) —
it stays a "future: edge mode" item on slide 9. Don't take a UNO Q kit; it adds risk, not points.

## Start the demo
```bash
bash ~/Infosys/qroute/app/run.sh
```
Open **http://localhost:8000** in Chrome → full screen (⌃⌘F). Restart `run.sh` after editing `.env`.

The site has five pages (nav at the top, animated transitions between them):
**Overview** (loading screen → 3D globe hero → scroll story of the problem) · **How it works** · **Live demo** (the console) ·
**Results** (benchmark charts) · **Team**. Add `?nointro` to the URL to skip the loading screen, e.g. `http://localhost:8000/?nointro#/demo`.
The previous single-page console is kept at `/static/console_v3.html`.

**Use cases page — one engine, many problems** (same QIEA core, different encoder + cost; each vs a classical baseline):
| Domain | Classical baseline | Q-Route engine |
|---|---|---|
| Fleet delivery (2 vans, 12 Bengaluru stops, peak ORR traffic) | sweep + nearest-neighbour: 193 km, Hebbal 18 min late | 166 km, all on time, 0.03 s |
| Protein folding (2D HP lattice, 20-mer benchmark) | greedy growth: E = −4 | E = −8 (best known −9), 1.3 s |
| Drug fragments (6 sites × 8 groups, toy scoring) | best fit per site: −6.1, toxicity alert | −8.06 = global optimum (all 262,144 checked) |
| Nurse rostering (6 × 7 days, seniority + rest rules) | greedy day-by-day: 5 rule breaks | 0 rule breaks, 1.5 s |
Say it plainly if asked: these are small proof-of-concept models (optimisation demos), not real drug discovery or clinical scheduling. Code: `app/domains.py`.

| Key | Action |
|---|---|
| **D** / **Present** button | Presenter mode: plays the whole 6-step story with captions (Esc to stop) |
| **R** | Run both routers |
| **M** | Single / split view: one big map; **Space** flips Dijkstra ↔ Q-Route and the hotspots dissolve |
| **T** | Light/dark theme (use **light** if the projector looks washed out) |
| click a link | cut / restore that fibre (auto re-runs) |

## Day plan
| Time | Do |
|---|---|
| Before 10:00 | Laptop charged, `run.sh` started once, key checked with `check_llm.py`, deck open on slide 1 |
| 10:00–13:00 (build window) | Rehearse the 5-minute pitch 3× with a timer. Try 2–3 free-form intents through the real LLM. Optional polish only — don't refactor working code. |
| 13:00–14:00 | Lunch. Close all other apps, Do-Not-Disturb on, battery > 80%. |
| 14:00 demo | Slides 1→7 (~3 min), then **live console** with the autopilot or by hand (~1.5 min), slide 9 (20 s). |

## 5-minute pitch (who says what)
1. **Bahumanya** — slide 1 (15 s): team, ET-08, the hook: *Dijkstra drops 2.2 Gbps; Q-Route drops zero in 0.4 s.*
2. **Harshith** — slide 2 (35 s): shortest path is load-blind; fibre cut; 10²⁷ route sets.
3. **Cheritha** — slide 3 (30 s): what Q-Route does in one sentence.
4. **Bahumanya** — slide 4 (35 s): architecture, numbers 1–7; "the LLM never writes routes".
5. **Harshith** — slides 5–6 (45 s): where AI acts; the quantum-inspired loop (superposition → measure → score → rotate).
6. **Bahumanya** — slide 7 (25 s): benchmark; honest trade-off (+1 ms latency, zero loss).
7. **Cheritha drives the console, Bahumanya narrates** (90 s): press **D** (Present) — or by hand: surge slider → click NY–PA → type intent → Parse → click CA1→PA in the list → Ask why.
8. **Cheritha** — slide 9 (20 s): works now vs next; security.

The talk track is in each slide's speaker notes.

## Judge Q&A cheat sheet
- **Is this really quantum?** No quantum hardware — the brief asks for *quantum-inspired*. We borrow superposition (Q-bit amplitudes), measurement (sampling) and rotation gates (amplitude steering), simulated on a CPU. It's the QIEA family (Han & Kim, 2002).
- **Why not just a genetic algorithm / random search?** Our control is random search with the *same* 4,800 evaluations: cost 621 vs 37. The Q-bit update rule does the work. A GA is a fair future comparison.
- **Why not solve it exactly (ILP)?** Unsplittable multi-commodity flow is NP-hard; 30 flows × 8 paths = 10²⁷ combinations. Exact solvers don't fit a sub-second re-plan; we measured 1.5 s for 120 flows (10¹⁰⁸ sets), growing linearly.
- **Dijkstra has lower latency — isn't it better?** For one flow on an idle network, yes (slide 6, table d). Once flows compete for capacity, its "shortest" paths overload links and drop packets. We trade about 1 ms average latency for zero loss.
- **Where is the AI?** (1) the optimizer that decides routes, (2) the LLM intent parser (free text → JSON rule), (3) the LLM explainer. Rules can't parse free text or balance 10²⁷ coupled choices.
- **What if the LLM hallucinates?** It never touches routes. Its JSON passes a schema + bounds guard (unknown nodes/links/fields are rejected — try "avoid link XX-YY"). If the optimizer misses its budget, we keep Dijkstra routes.
- **What model, which platform?** Llama-3.1-8B (or whatever `check_llm.py` lists) on Qualcomm Cloud AI 100 via the Cloud AI Playground's OpenAI-compatible API.
- **Data?** NSFNET-14 is a standard research topology; India-13 is our own backbone with great-circle × 1.3 fibre distances. Traffic is synthetic (seeded, reproducible) — the brief allows mock data.
- **How do you model latency?** Propagation (1 ms / 200 km of fibre) + an M/M/1-style queueing delay that grows as a link fills; load over 100% is dropped.
- **Scalability?** Linear in flows (0.24 s → 1.55 s for 15 → 120 flows). Next steps: incremental re-plans for affected flows only, and parallel Q-populations on GPU / Cloud AI 100.
- **Real deployment?** A REST plug-in to SDN controllers (ONOS/OpenDaylight), with streaming telemetry (gNMI) replacing the traffic matrix.
- **Security?** The LLM only sees topology metadata, never packet payloads; route changes would be signed and audited; humans approve big reroutes.
- **Front-end stack?** A lightweight HTML/JS + SVG console, no framework, so it runs offline (the deck says React + D3 — say "kept it dependency-free for the demo").
- **The deck's example intent is DC↔NY?** That pair has no flow in this traffic matrix, so the demo uses CA1→PA, which does.

## If something breaks
- **Wi-Fi down / LLM fails** → nothing to do: header shows *LLM offline mode*, explanations come from the deterministic explainer. Say: "the routing is fully local; only the narration needs the cloud."
- **Port busy** → `PORT=8010 bash ~/Infosys/qroute/app/run.sh`, open localhost:8010.
- **Projector washed out** → press **T** (light theme). Cmd + / − to zoom the page.
- **Laptop dies** → the PDF deck has every result; slide 7 *is* the demo evidence.

## Files
```
qroute/benchmark.py   reproducible benchmark behind the deck (python3 benchmark.py)
qroute/scale.py       scaling test (15 → 120 flows)
qroute/app/engine.py  topologies, Dijkstra, QIEA, constraints, scoring
qroute/app/llm.py     Cloud AI Playground client, intent parser, guard, explainer (+ offline fallback)
qroute/app/server.py  FastAPI API
qroute/app/static/index.html   the console UI (index_v2_backup.html = previous design)
qroute/app/check_llm.py        key/endpoint checker
```
