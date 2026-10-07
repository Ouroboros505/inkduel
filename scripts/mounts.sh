#!/usr/bin/env bash
# The source lives on the Google Drive mount (rclone FUSE). The heavy and busy folders live on
# local disk and are bind-mounted in, the same way as Salutt:
#   node_modules  thousands of package files that have no business syncing to Drive
#   dist          build output
#   .wrangler     wrangler's bundles and the local game database (SQLite, which does not belong
#                 on a FUSE mount; on Drive, wrangler dev kept reloading mid-game)
# bindfs because rclone can't hold symlinks. The mounts don't survive a reboot, so every npm
# script that needs them runs this first; it does nothing when they're already in place.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
case "$root" in "$HOME/Drive/"*) ;; *) exit 0 ;; esac
command -v bindfs >/dev/null || { echo "bindfs is missing: sudo dnf install bindfs" >&2; exit 1; }
store="$HOME/Storage/Developer"
declare -A src=(
  [node_modules]="$store/modules/inkduel"
  [dist]="$store/build-inkduel/dist"
  [.wrangler]="$store/build-inkduel/wrangler"
)
for d in node_modules dist .wrangler; do
  mkdir -p "${src[$d]}" "$root/$d"
  mountpoint -q "$root/$d" || bindfs "${src[$d]}" "$root/$d"
done
