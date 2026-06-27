#!/usr/bin/env bash
# Install the my-koto systemd units (app + hourly push dispatch) with the
# repo path and run-as user substituted in. Run once on the VPS.
#
#   sudo ./deploy/install-systemd.sh
#
# Overridable via env:
#   APP_DIR  (default: repo root this script lives in)
#   RUN_USER (default: current SUDO_USER or the owner of APP_DIR)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT}"
RUN_USER="${RUN_USER:-${SUDO_USER:-$(stat -c '%U' "$APP_DIR")}}"
RUN_GROUP="$(id -gn "$RUN_USER")"
UNIT_DIR="/etc/systemd/system"

if [[ $EUID -ne 0 ]]; then
  echo "error: run with sudo." >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/.env.production.local" ]]; then
  echo "error: $APP_DIR/.env.production.local not found." >&2
  echo "       cp deploy/env.production.example.txt .env.production.local && edit it first." >&2
  exit 1
fi

render() {
  # Substitute the placeholder paths/users from the templated unit files.
  sed \
    -e "s#/opt/koto-city#${APP_DIR}#g" \
    -e "s#^User=mykoto#User=${RUN_USER}#" \
    -e "s#^Group=mykoto#Group=${RUN_GROUP}#" \
    "$1"
}

echo "==> Installing units to ${UNIT_DIR} (APP_DIR=${APP_DIR}, user=${RUN_USER})"
render "$ROOT/deploy/my-koto.service"        > "$UNIT_DIR/my-koto.service"
render "$ROOT/deploy/push-dispatch.service"  > "$UNIT_DIR/push-dispatch.service"
install -m 0644 "$ROOT/deploy/push-dispatch.timer" "$UNIT_DIR/push-dispatch.timer"

systemctl daemon-reload
systemctl enable --now my-koto.service
systemctl enable --now push-dispatch.timer

echo "==> Done."
systemctl --no-pager status my-koto.service | head -n 12 || true
echo
echo "Next: ./deploy/deploy.sh to build, then check 'tailscale funnel status'."
