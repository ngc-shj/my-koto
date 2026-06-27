#!/usr/bin/env bash
# Build on a beefy machine (your Mac) and ship the standalone bundle to a
# low-RAM VPS that cannot run `next build` itself. Run from the repo root on
# the BUILD machine, not the VPS:
#
#   ./deploy/build-and-ship.sh user@your-vps            # defaults to /srv/my-koto
#   ./deploy/build-and-ship.sh user@your-vps /srv/my-koto
#
# IMPORTANT: the remote dir is the standalone RUN directory, which must be
# SEPARATE from the git checkout. rsync --delete wipes everything there except
# the excludes below — pointing it at the git clone would delete .git and the
# deploy scripts. Keep the clone at e.g. /opt/koto-city and run from /srv/my-koto.
#
# The build bakes NEXT_PUBLIC_* into the client bundle, so this reads them
# from .env.production.local on THIS machine. Keep that file's NEXT_PUBLIC_*
# values (BASE_PATH, SITE_URL, VAPID_PUBLIC_KEY) identical to the VPS's, or the
# shipped client will point at the wrong origin / push key.
#
# With output:'standalone', `next build` emits a self-contained server at
# .next/standalone (incl. a pruned node_modules) — but it does NOT copy
# .next/static or public/, so we rsync those alongside it. The VPS then runs
# `node server.js` with no npm install.
set -euo pipefail

REMOTE="${1:?usage: build-and-ship.sh user@host [/srv/my-koto]}"
REMOTE_DIR="${2:-/srv/my-koto}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production.local ]]; then
  echo "error: .env.production.local missing on the build machine." >&2
  echo "       It supplies build-time NEXT_PUBLIC_* values. Copy the VPS's file here." >&2
  exit 1
fi

echo "==> Building (next build, output: standalone)"
# Clean stale artifacts first: a .next left from a non-standalone build makes
# the standalone trace step fail to copy prerender-manifest.json.
rm -rf .next
# next reads .env.production.local automatically in production builds.
NODE_ENV=production npm run build

if [[ ! -d .next/standalone ]]; then
  echo "error: .next/standalone not found — is output:'standalone' set in next.config.ts?" >&2
  exit 1
fi

# Assemble the runnable tree locally so the remote layout is exactly:
#   <dir>/server.js, <dir>/.next/static, <dir>/public, <dir>/node_modules(pruned)
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
echo "==> Staging standalone bundle in $STAGE"
cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next"
cp -a .next/static "$STAGE/.next/static"
# public/ holds the PWA service worker + workbox assets generated under
# public/<basePath>/. Ship it even if currently sparse.
if [[ -d public ]]; then cp -a public "$STAGE/public"; fi

echo "==> Shipping to ${REMOTE}:${REMOTE_DIR}"
# --delete keeps the remote run dir in sync with this build. Preserve the
# runtime env file and data/ there — they are not part of the bundle. The
# .git/deploy excludes are a guard in case the dir is ever mis-pointed at the
# git checkout; the run dir should not contain them anyway.
rsync -az --delete \
  --exclude='.env.production.local' \
  --exclude='data/' \
  --exclude='.git/' \
  --exclude='deploy/' \
  "$STAGE/" "${REMOTE}:${REMOTE_DIR}/"

echo "==> Done. On the VPS, (re)start with: sudo systemctl restart my-koto"
echo "    (the unit runs 'node server.js' from ${REMOTE_DIR})"
