#!/usr/bin/env bash
# Lasa Hub — start API + Expo as fully detached daemons.
# They will survive shell exits, Claude Code turns, terminal close, etc.
# Stop them with: scripts/dev-stop.sh
# Check them with: scripts/dev-status.sh

set -euo pipefail

# Always resolve to the repo root, regardless of where this script is called from.
ROOT="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/expo.log"
API_PID_FILE="$LOG_DIR/api.pid"
WEB_PID_FILE="$LOG_DIR/expo.pid"

# Find pnpm regardless of how this script was invoked.
if ! command -v pnpm >/dev/null 2>&1; then
    # Try common install locations
    for p in /opt/homebrew/bin/pnpm /usr/local/bin/pnpm "$HOME/.local/share/pnpm/pnpm" "$HOME/Library/pnpm/pnpm"; do
        if [ -x "$p" ]; then
            export PATH="$(dirname "$p"):$PATH"
            break
        fi
    done
fi
if ! command -v pnpm >/dev/null 2>&1; then
    echo "❌ pnpm not found on PATH. Install it (brew install pnpm) and try again."
    exit 1
fi

# ----------------------------------------------------------------------------
# Step 1: kill anything currently listening on our ports.
# ----------------------------------------------------------------------------
for port in 8080 8081; do
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Killing existing process on :$port (pids: $pids)"
        kill -9 $pids 2>/dev/null || true
    fi
done
# Give the OS a moment to release the sockets.
sleep 1

# ----------------------------------------------------------------------------
# Step 2: launch the servers in a fresh session (fully detached).
# We use Python because macOS's built-in `nohup ... &` + `disown` is not
# enough — Claude Code's harness may still send SIGTERM to the entire
# process group. start_new_session=True calls setsid(2) which puts the
# child in its own session/process-group, so the harness can't reap it.
# ----------------------------------------------------------------------------
launch_detached() {
    local label="$1"; shift
    local logfile="$1"; shift
    local pidfile="$1"; shift
    local workdir="$1"; shift
    # Remaining args are the command + its args.
    python3 - "$label" "$logfile" "$pidfile" "$workdir" "$@" <<'PY'
import os, sys, subprocess

label, logfile, pidfile, workdir, *cmd = sys.argv[1:]

with open(logfile, "a", buffering=1) as lf:
    lf.write(f"\n--- {label} starting (cwd={workdir} cmd={cmd}) ---\n")
    p = subprocess.Popen(
        cmd,
        cwd=workdir,
        stdout=lf, stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,  # the magic: creates a new session, detaches from parent
        env={**os.environ, "FORCE_COLOR": "0"},
    )
with open(pidfile, "w") as pf:
    pf.write(str(p.pid))
print(p.pid)
PY
}

echo "Starting API server on :8080..."
API_PID=$(launch_detached "api"  "$API_LOG" "$API_PID_FILE" "$ROOT" pnpm --filter @workspace/api-server run dev)
echo "  → pid $API_PID, logs: $API_LOG"

echo "Starting Expo web on :8081..."
EXPO_ENV=( PORT=8081 EXPO_PUBLIC_API_BASE=http://localhost:8080 )
WEB_PID=$(launch_detached "expo" "$WEB_LOG" "$WEB_PID_FILE" "$ROOT/artifacts/lasa-hub" env "${EXPO_ENV[@]}" pnpm dev --web)
echo "  → pid $WEB_PID, logs: $WEB_LOG"

# ----------------------------------------------------------------------------
# Step 3: wait until both servers respond.
# ----------------------------------------------------------------------------
echo ""
echo "Waiting for both servers to respond..."
api_ready=0
web_ready=0
for i in $(seq 1 90); do
    if [ "$api_ready" = "0" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/wholesalers 2>/dev/null || echo "000")
        if [ "$code" = "200" ]; then
            echo "  ✓ API up (http://localhost:8080)"
            api_ready=1
        fi
    fi
    if [ "$web_ready" = "0" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/ 2>/dev/null || echo "000")
        if [ "$code" = "200" ]; then
            echo "  ✓ Web up (http://localhost:8081)"
            web_ready=1
        fi
    fi
    if [ "$api_ready" = "1" ] && [ "$web_ready" = "1" ]; then
        echo ""
        echo "=================================================="
        echo "  Both servers running."
        echo "  Open http://localhost:8081 in your browser."
        echo ""
        echo "  They will keep running until you reboot or run:"
        echo "    bash $ROOT/scripts/dev-stop.sh"
        echo "=================================================="
        exit 0
    fi
    sleep 1
done

echo ""
echo "❌ Servers did not come up within 90 seconds. Check the logs:"
echo "    tail -50 $API_LOG"
echo "    tail -50 $WEB_LOG"
exit 1
