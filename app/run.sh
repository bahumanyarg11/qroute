#!/usr/bin/env bash
# Q-Route Console — start the demo:  ./run.sh   then open http://localhost:8000
cd "$(dirname "$0")"
python3 -m pip install -q fastapi uvicorn httpx networkx numpy >/dev/null 2>&1 || true
exec python3 -m uvicorn server:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
