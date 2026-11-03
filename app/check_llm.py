"""Check the Qualcomm Cloud AI Playground connection:  python3 check_llm.py
Reads app/.env (IMAGINE_API_KEY, IMAGINE_ENDPOINT, IMAGINE_MODEL). Prints what works and what to fix."""
import httpx, llm

s = llm.status()
print(f"endpoint : {s['endpoint']}\nmodel    : {s['model']}\nkey set  : {s['configured']}")
if not s['configured']:
    raise SystemExit("\n✗ No key. Open app/.env and paste your key after IMAGINE_API_KEY=  (then run this again).")

try:
    p = httpx.get(f"{llm.ENDPOINT}/ping", headers={'Authorization': f'Bearer {llm.KEY}'}, timeout=15)
    print('ping     :', p.status_code, '(200 = key accepted, 401 = key rejected)')
    r = httpx.get(f"{llm.ENDPOINT}/models", headers={'Authorization': f'Bearer {llm.KEY}'}, timeout=15)
    if r.status_code == 200:
        j = r.json()   # Imagine API: {"<model_type>": ["model", ...]}; OpenAI style: {"data": [{"id": ...}]}
        ids = [m.get('id') for m in j.get('data', [])] if isinstance(j.get('data'), list) else [n for v in j.values() if isinstance(v, list) for n in v]
        print('models   :', ', '.join(map(str, ids)) or '(none listed)')
        if ids and llm.MODEL not in ids:
            print(f"! {llm.MODEL} not in the list — set IMAGINE_MODEL in app/.env to one of the names above")
    else:
        print(f'models   : HTTP {r.status_code} (listing not available — continuing)')
except Exception as e:
    print('models   : could not list —', e)

try:
    out = llm.chat([{'role': 'user', 'content': 'Reply with exactly: Q-Route LLM online'}], max_tokens=12)
    print('\n✓ chat works →', out)
except Exception as e:
    msg = str(e)
    hint = ('wrong/expired key' if '401' in msg or '403' in msg else
            'endpoint path wrong — check IMAGINE_ENDPOINT on the Playground API page' if '404' in msg else
            'model name wrong — set IMAGINE_MODEL' if 'model' in msg.lower() else 'network / Wi-Fi')
    print(f'\n✗ chat failed ({hint}):', msg[:300])
    print('The console still works fully offline; only the explanation text falls back to the template.')
