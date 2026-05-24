#!/usr/bin/env bash
# scripts/dev.sh — start / stop / restart / status / logs / init for the
# Next.js dev server, running detached. PID and log live under .run/
# (gitignored).
#
# Usage:
#   ./scripts/dev.sh init             # one-time: npm install + ensure-data
#   ./scripts/dev.sh start            # boot dev server in background
#   ./scripts/dev.sh stop             # graceful kill, falls back to KILL,
#                                     # frees port 3000 if anything still
#                                     # holds it
#   ./scripts/dev.sh restart          # stop + start
#   ./scripts/dev.sh status           # exit 0 if alive, 1 otherwise
#   ./scripts/dev.sh logs             # tail -f the log file
#   ./scripts/dev.sh data [flags]     # ensure-data; conditional upstream
#                                     # check runs by default.
#                                     # --force                regen all
#                                     # --skip-upstream-check  presence-only
#
# Configurable env: PORT (default 3000).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/dev.pid"
LOG_FILE="$RUN_DIR/dev.log"
PORT="${PORT:-3000}"

mkdir -p "$RUN_DIR"

# Reads PID file and returns 0 iff the recorded process is alive.
is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null) || return 1
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

cmd_init() {
  cd "$ROOT"
  echo "[dev] npm install"
  npm install
  echo "[dev] ensure-data"
  node scripts/ensure-data.mjs
  echo "[dev] init complete — run \`./scripts/dev.sh start\` next."
}

cmd_start() {
  if is_running; then
    echo "[dev] already running (pid=$(cat "$PID_FILE")), http://localhost:$PORT"
    return 0
  fi
  # Stale PID from a previous crash — drop it before spawning.
  rm -f "$PID_FILE"
  cd "$ROOT"
  # Detach: nohup keeps it alive past this shell, & backgrounds. PORT is
  # honoured by Next.js.
  PORT="$PORT" nohup npm run dev >"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  # Give Next.js a moment to bind the port so `status` immediately after
  # `start` reports something useful.
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    echo "[dev] started (pid=$pid), http://localhost:$PORT"
    echo "[dev] logs: $LOG_FILE"
  else
    echo "[dev] FAILED to start — last log lines:"
    tail -n 20 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    return 1
  fi
}

# Reaps the npm process, its descendants, and anything else holding the
# port. The lsof fallback catches orphaned `next dev` processes left
# behind by an earlier crashed run that didn't unbind cleanly.
cmd_stop() {
  local pid="" stopped=0
  if [[ -f "$PID_FILE" ]]; then
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    # Take a snapshot of children before signalling the parent — once npm
    # exits, the children may reparent to init and disappear from `pgrep -P`.
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    kill -TERM "$pid" 2>/dev/null || true
    [[ -n "$children" ]] && echo "$children" | xargs -r kill -TERM 2>/dev/null || true
    # Up to 5s for graceful shutdown.
    for _ in 1 2 3 4 5; do
      sleep 1
      kill -0 "$pid" 2>/dev/null || break
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
      [[ -n "$children" ]] && echo "$children" | xargs -r kill -KILL 2>/dev/null || true
    fi
    stopped=1
  fi
  # Free the port even if no recorded PID matched — common after a crash.
  local port_pids
  port_pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [[ -n "$port_pids" ]]; then
    echo "[dev] freeing port $PORT (pids: $(echo "$port_pids" | tr '\n' ' '))"
    echo "$port_pids" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    port_pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
    [[ -n "$port_pids" ]] && echo "$port_pids" | xargs kill -KILL 2>/dev/null || true
    stopped=1
  fi
  rm -f "$PID_FILE"
  if [[ "$stopped" -eq 1 ]]; then
    echo "[dev] stopped"
  else
    echo "[dev] not running"
  fi
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  if is_running; then
    echo "[dev] running (pid=$(cat "$PID_FILE")), http://localhost:$PORT"
    return 0
  fi
  # Detect orphaned listeners that aren't tracked by our PID file.
  local port_pids
  port_pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [[ -n "$port_pids" ]]; then
    echo "[dev] NOT tracked but port $PORT is held by: $(echo "$port_pids" | tr '\n' ' ')"
    echo "[dev] (run \`./scripts/dev.sh stop\` to reap)"
    return 1
  fi
  echo "[dev] not running"
  return 1
}

cmd_logs() {
  if [[ ! -f "$LOG_FILE" ]]; then
    echo "[dev] no log file yet — run \`./scripts/dev.sh start\` first."
    return 1
  fi
  tail -f "$LOG_FILE"
}

# Runs ensure-data with whatever extra args were given (notably --force).
cmd_data() {
  cd "$ROOT"
  node scripts/ensure-data.mjs "$@"
}

case "${1:-}" in
  init) cmd_init ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  data) shift; cmd_data "$@" ;;
  *)
    cat >&2 <<EOF
Usage: $0 {init|start|stop|restart|status|logs|data [flags]}

  init           Install deps + generate baseline data files.
  start          Run \`npm run dev\` detached (logs to .run/dev.log).
  stop           Kill the running dev server + anything still on port $PORT.
  restart        stop + start.
  status         Report PID + URL if running.
  logs           tail -f the dev server log.
  data           Incrementally refresh data/*.json; conditional upstream
                 check (HEAD / CKAN) runs by default and only the groups
                 whose source moved since data/.versions.json get a
                 full body fetch.
       --force                Regenerate every group regardless.
       --skip-upstream-check  Presence-only mode (offline / fast path).

Env: PORT=$PORT (override to run on a different port).
EOF
    exit 1
    ;;
esac
