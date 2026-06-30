#!/usr/bin/env bash
# Lasa Hub — stop the running API + Expo dev servers.

set -euo pipefail
ROOT="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
LOG_DIR="$ROOT/.dev-logs"

stopped_any=0
for port in 8080 8081; do
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping process on :$port (pids: $pids)"
        kill -9 $pids 2>/dev/null || true
        stopped_any=1
    fi
done

# Also kill anything tracked by our pid files (in case the port-based kill missed it).
for f in "$LOG_DIR/api.pid" "$LOG_DIR/expo.pid"; do
    if [ -f "$f" ]; then
        pid=$(cat "$f" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Stopping tracked pid $pid"
            # Kill the whole process group (setsid created one for each)
            kill -9 -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
            stopped_any=1
        fi
        rm -f "$f"
    fi
done

if [ "$stopped_any" = "0" ]; then
    echo "Nothing was running."
else
    echo "Stopped."
fi
