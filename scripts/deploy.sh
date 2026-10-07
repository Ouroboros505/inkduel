#!/usr/bin/env bash
# Ships InkDuel: the room server (Worker + Durable Object, "inkduel-rooms") and the site
# (Cloudflare Pages, "inkduel") at https://inkduel.stipe.app. No CI: this is the deploy.
#
# Needs the stipe Cloudflare token: Pages Edit, Workers Scripts Edit, Account Settings Read,
# DNS Edit on stipe.app. It lives in ~/Hackathon/.env.local (shared with ProMaize); a .env.local
# here, or INKDUEL_ENV=/path, takes precedence. The token is never printed.
#
# Safe to re-run: deploys are incremental; the project, domain and DNS record are made once.
set -euo pipefail
cd "$(dirname "$0")/.."
env_file="${INKDUEL_ENV:-$HOME/Hackathon/.env.local}"
[[ -f .env.local ]] && env_file=.env.local
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
: "${CLOUDFLARE_API_TOKEN:?no CLOUDFLARE_API_TOKEN in $env_file}"

PROJECT=inkduel
DOMAIN=inkduel.stipe.app
ZONE=stipe.app
API=https://api.cloudflare.com/client/v4
WR=node_modules/.bin/wrangler
cf() { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' "$@"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

bash scripts/mounts.sh
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(cf "$API/accounts" | json 'print(d["result"][0]["id"])')}"

echo "==> room server: Worker inkduel-rooms"
"$WR" deploy --config worker/wrangler.toml

echo "==> site: Pages project $PROJECT"
if ! cf "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT" | json 'sys.exit(0 if d.get("success") else 1)'; then
  # Created through the API rather than wrangler, which may try to turn it into a Workers project.
  cf -X POST "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" \
    --data "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}" | json 'print("    created" if d.get("success") else d.get("errors"))'
fi
npm run build
"$WR" pages deploy dist --project-name="$PROJECT" --branch=main --commit-dirty=true

echo "==> domain $DOMAIN"
ZID=$(cf "$API/zones?name=$ZONE" | json 'print(d["result"][0]["id"])')
HAVE=$(cf "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" | json 'print(" ".join(x["name"] for x in d.get("result") or []))')
if grep -qw "$DOMAIN" <<<"$HAVE"; then
  echo "    attached"
else
  cf -X POST "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" --data "{\"name\":\"$DOMAIN\"}" \
    | json 'print("    registered" if d.get("success") else d.get("errors"))'
fi
# Registering the domain with Pages does not create the DNS record.
if cf "$API/zones/$ZID/dns_records?name=$DOMAIN" | json 'sys.exit(0 if d.get("result") else 1)'; then
  echo "    dns record present"
else
  cf -X POST "$API/zones/$ZID/dns_records" \
    --data "{\"type\":\"CNAME\",\"name\":\"${DOMAIN%%.*}\",\"content\":\"$PROJECT.pages.dev\",\"proxied\":true}" \
    | json 'print("    dns record created" if d.get("success") else d.get("errors"))'
fi

echo
echo "Live: https://$DOMAIN  (certificates take a minute or two on the first attach)"
echo "Check: curl -s https://$DOMAIN/api/health"
