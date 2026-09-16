#!/bin/bash
# Start the Python FastAPI orchestrator on port 8000

cd "$(dirname "$0")"

export PYTHONPATH="${PYTHONPATH}:$(pwd)"
export MAIFARM_HOST="127.0.0.1"
export MAIFARM_PORT="8000"
export LOG_LEVEL="INFO"

# Set environment for tmux
export TMUX_TMPDIR=/tmp
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export PYTHONUTF8=1

echo "Starting MaiFarm Python Orchestrator on port 8000..."
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
