#!/usr/bin/env bash
# Runs the room server under `wrangler dev` from a mirror on local disk. On the Drive mount,
# rclone rewrites file times after each upload, and wrangler takes every touch for an edit and
# restarts the server, dropping every connection mid-game (about once a minute). The mirror is
# refreshed by content (rsync --checksum, no times), so only real edits reach wrangler.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mirror="${INKDUEL_API_MIRROR:-$HOME/Storage/Developer/build-inkduel/api}"
mkdir -p "$mirror"
# .wrangler holds wrangler's own bundles inside the mirror; never sync over it.
refresh() { rsync -r --checksum --delete --exclude .wrangler "$root/worker" "$root/shared" "$mirror/"; }
refresh
(while sleep 1; do refresh; done) &
loop=$!
trap 'kill $loop 2>/dev/null || true' EXIT
cd "$mirror"
"$root/node_modules/.bin/wrangler" dev --config worker/wrangler.toml --port 8787 --ip 0.0.0.0 --persist-to "$mirror/.state"
