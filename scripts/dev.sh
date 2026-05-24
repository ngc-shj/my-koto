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

# `ps -o lstart=` prints the process's wall-clock start time (e.g.
# "Sat May 24 14:30:01 2026"). Stable across macOS and Linux. Used as a
# PID-reuse fingerprint: if the OS recycled our recorded PID to an
# unrelated process, its lstart will not match what we wrote at start.
# LC_ALL=C pins the format to English; without it macOS localises the
# weekday/month and start vs. stop can run under different locales.
pid_lstart() {
  local pid=$1
  LC_ALL=C ps -o lstart= -p "$pid" 2>/dev/null \
    | sed -e 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# True iff $1's current working directory equals $ROOT. Used to skip
# killing port-3000 holders that belong to some other project — a
# common collision because 3000 is the default for half the JS world.
pid_cwd_matches_root() {
  local pid=$1
  local cwd
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null \
    | awk '/^n/ { print substr($0,2); exit }')
  [[ -n "$cwd" && "$cwd" == "$ROOT" ]]
}

# Reads PID file and returns 0 iff the recorded process is alive. Both
# the legacy 1-line (PID) and the current 2-line (PID + lstart) formats
# are accepted so an in-flight upgrade does not strand a running server.
is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid recorded_lstart
  pid=$(sed -n '1p' "$PID_FILE" 2>/dev/null) || return 1
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  recorded_lstart=$(sed -n '2p' "$PID_FILE" 2>/dev/null || true)
  if [[ -n "$recorded_lstart" ]]; then
    [[ "$(pid_lstart "$pid")" == "$recorded_lstart" ]]
  fi
}

# Print a PID and every descendant, leaves first. `pgrep -P` only walks
# one level, so without recursion we leave Turbopack workers and the
# predev tsx subprocess alive — they reparent to init when npm exits
# and survive past `stop`. Leaves-first ordering means parents see
# their children gone before they get signalled themselves, so they
# don't spend their grace window spawning replacements.
collect_descendants() {
  local root=$1
  local child
  for child in $(pgrep -P "$root" 2>/dev/null || true); do
    collect_descendants "$child"
  done
  echo "$root"
}

# TERM (or KILL with -k) every pid in the given newline-separated list.
# Loops in shell rather than piping to xargs so we don't depend on
# `xargs -r` (GNU-only on older macOS) and so empty input is a no-op.
signal_pids() {
  local signal=$1
  shift
  local pids=$1
  local p
  for p in $pids; do
    [[ -n "$p" ]] || continue
    kill "-$signal" "$p" 2>/dev/null || true
  done
}

cmd_init() {
  cd "$ROOT"
  echo "[dev] npm install"
  npm install
  echo "[dev] ensure-data"
  npx tsx scripts/ensure-data.ts
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
  # Two-line PID file: pid on line 1, lstart on line 2. cmd_stop checks
  # line 2 before signalling so we never kill a process that just
  # happens to have inherited our old PID after a crash.
  {
    echo "$pid"
    pid_lstart "$pid"
  } >"$PID_FILE"
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

# Reaps the npm process, every descendant in its tree, and anything
# else still holding the port. The lsof fallback catches orphaned
# listeners left behind by an earlier crashed run that didn't unbind
# cleanly. Both kill paths guard against killing unrelated processes:
# the tree path verifies the root PID's start-time fingerprint, the
# port path verifies each holder's CWD before signalling it.
cmd_stop() {
  local pid="" recorded_lstart="" stopped=0
  if [[ -f "$PID_FILE" ]]; then
    pid=$(sed -n '1p' "$PID_FILE" 2>/dev/null || true)
    recorded_lstart=$(sed -n '2p' "$PID_FILE" 2>/dev/null || true)
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    # PID-reuse guard. If recorded_lstart is present and doesn't match
    # the live process, the OS has assigned our old PID to something
    # unrelated since the last start. Refuse to kill, drop the stale
    # file, and let the port-cleanup path below handle the orphan (if
    # any) via the CWD-scoped lsof sweep.
    local current_lstart=""
    current_lstart=$(pid_lstart "$pid")
    if [[ -n "$recorded_lstart" && "$current_lstart" != "$recorded_lstart" ]]; then
      echo "[dev] PID $pid is now a different process (start time mismatch); skipping tree kill."
    else
      # Snapshot the entire tree before signalling — once npm exits, the
      # grandchildren reparent to init and `pgrep -P <npm>` no longer
      # surfaces them.
      local tree
      tree=$(collect_descendants "$pid")
      signal_pids TERM "$tree"
      # Up to 5s for graceful shutdown of the root npm process.
      for _ in 1 2 3 4 5; do
        sleep 1
        kill -0 "$pid" 2>/dev/null || break
      done
      # Hard-kill any stragglers (parent or descendant) still standing.
      signal_pids KILL "$tree"
      stopped=1
    fi
  fi
  # Port cleanup. We only kill holders whose CWD matches $ROOT so that a
  # collision with another project's dev server on the same port doesn't
  # nuke it. Unrelated holders are logged with their command line and
  # left running.
  local port_pids
  port_pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [[ -n "$port_pids" ]]; then
    local ours="" p cmd
    for p in $port_pids; do
      if pid_cwd_matches_root "$p"; then
        ours+="$p"$'\n'
      else
        cmd=$(ps -o command= -p "$p" 2>/dev/null | head -c 80 || true)
        echo "[dev] skipping port $PORT pid $p (CWD not $ROOT): ${cmd:-<unknown>}"
      fi
    done
    ours=${ours%$'\n'}
    if [[ -n "$ours" ]]; then
      echo "[dev] freeing port $PORT (pids: $(echo "$ours" | tr '\n' ' '))"
      signal_pids TERM "$ours"
      sleep 1
      local still=""
      for p in $ours; do
        kill -0 "$p" 2>/dev/null && still+="$p"$'\n'
      done
      still=${still%$'\n'}
      [[ -n "$still" ]] && signal_pids KILL "$still"
      stopped=1
    fi
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
  npx tsx scripts/ensure-data.ts "$@"
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
