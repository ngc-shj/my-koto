#!/usr/bin/env bash
# Install the my-koto systemd units (app + hourly push dispatch). The units
# reference two directories:
#   CLONE_DIR — the git checkout holding deploy/ scripts (this repo)
#   RUN_DIR   — the standalone run dir build-and-ship.sh rsyncs server.js into,
#               and where the runtime .env.production.local lives
# Keeping them separate stops `rsync --delete` from wiping .git.
#
#   sudo ./deploy/install-systemd.sh
#
# Overridable via env:
#   RUN_DIR  (default: /srv/my-koto)
#   RUN_USER (default: current SUDO_USER or the owner of CLONE_DIR)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLONE_DIR="$ROOT"
RUN_DIR="${RUN_DIR:-/srv/my-koto}"
RUN_USER="${RUN_USER:-${SUDO_USER:-$(stat -c '%U' "$CLONE_DIR")}}"
RUN_GROUP="$(id -gn "$RUN_USER")"
UNIT_DIR="/etc/systemd/system"

if [[ $EUID -ne 0 ]]; then
  echo "error: run with sudo." >&2
  exit 1
fi

if [[ ! -f "$RUN_DIR/.env.production.local" ]]; then
  echo "error: $RUN_DIR/.env.production.local not found." >&2
  echo "       Create the run dir and put the runtime env there:" >&2
  echo "         sudo mkdir -p $RUN_DIR && sudo chown $RUN_USER $RUN_DIR" >&2
  echo "         cp deploy/env.production.example.txt $RUN_DIR/.env.production.local && edit it" >&2
  exit 1
fi

render() {
  # Substitute the placeholder paths/user from the templated unit files.
  # /srv/my-koto is the RUN_DIR placeholder; /opt/koto-city is the CLONE_DIR
  # placeholder (only push-dispatch.service references the clone, for the script).
  sed \
    -e "s#/srv/my-koto#${RUN_DIR}#g" \
    -e "s#/opt/koto-city#${CLONE_DIR}#g" \
    -e "s#^User=mykoto#User=${RUN_USER}#" \
    -e "s#^Group=mykoto#Group=${RUN_GROUP}#" \
    "$1"
}

echo "==> Installing units to ${UNIT_DIR} (RUN_DIR=${RUN_DIR}, CLONE_DIR=${CLONE_DIR}, user=${RUN_USER})"
render "$ROOT/deploy/my-koto.service"        > "$UNIT_DIR/my-koto.service"
render "$ROOT/deploy/push-dispatch.service"  > "$UNIT_DIR/push-dispatch.service"
install -m 0644 "$ROOT/deploy/push-dispatch.timer" "$UNIT_DIR/push-dispatch.timer"

systemctl daemon-reload
systemctl enable --now my-koto.service
systemctl enable --now push-dispatch.timer

echo "==> Done."
systemctl --no-pager status my-koto.service | head -n 12 || true
echo
echo "Next: on your build machine run"
echo "    ./deploy/build-and-ship.sh ${RUN_USER}@<host> ${RUN_DIR}"
echo "then 'sudo systemctl restart my-koto' and check 'tailscale funnel status'."
