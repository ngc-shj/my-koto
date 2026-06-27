#!/usr/bin/env bash
# Build + (re)start my-koto on the VPS, then publish it over Tailscale Funnel.
#
# Run from the repo root on the VPS:
#   ./deploy/deploy.sh
#
# Assumes:
#   - .env.production.local exists at the repo root (see env.production.example.txt)
#   - Node 20+ and npm are installed
#   - tailscale is up and Funnel/HTTPS is enabled for this tailnet
#
# This script is idempotent: it pulls, installs, builds, and restarts the
# systemd service if one is installed (see install-systemd.sh), otherwise it
# falls back to a foreground `npm run start`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/my-koto}"
PORT="${PORT:-3000}"
SERVICE="my-koto"

if [[ ! -f .env.production.local ]]; then
  echo "error: .env.production.local not found at repo root." >&2
  echo "       cp deploy/env.production.example.txt .env.production.local && edit it." >&2
  exit 1
fi

echo "==> Pulling latest"
git pull --ff-only

echo "==> Installing dependencies (npm ci)"
npm ci

# prebuild runs scripts/ensure-data.ts; build emits .next and PWA assets.
# `next build` can exceed Node's default heap on small VPS instances and OOM.
# On a small VPS (~768 MB RAM + swap), cap the heap modestly and let swap
# absorb the rest. Override NODE_OPTIONS to tune for a bigger box.
echo "==> Building (npm run build)"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
npm run build

# Publish over Tailscale Funnel at the app's basePath. Safe to re-run; Tailscale
# just overwrites the existing mapping. Requires Funnel to be allowed for the node.
echo "==> Configuring Tailscale Funnel ${BASE_PATH} -> localhost:${PORT}"
if command -v tailscale >/dev/null 2>&1; then
  tailscale funnel --bg --set-path "${BASE_PATH}" "${PORT}" \
    || echo "warn: 'tailscale funnel' failed — configure it manually (funnel may need an admin approval)."
  tailscale funnel status || true
else
  echo "warn: tailscale CLI not found; skipping Funnel setup."
fi

if systemctl list-unit-files "${SERVICE}.service" >/dev/null 2>&1 \
   && systemctl is-enabled "${SERVICE}.service" >/dev/null 2>&1; then
  echo "==> Restarting systemd service ${SERVICE}"
  sudo systemctl restart "${SERVICE}.service"
  sudo systemctl --no-pager status "${SERVICE}.service" | head -n 12
else
  echo "==> No systemd service installed; starting in the foreground."
  echo "    (Install the service with deploy/install-systemd.sh for a managed daemon.)"
  exec npm run start
fi
