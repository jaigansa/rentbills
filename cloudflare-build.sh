#!/usr/bin/env bash
# RentBill Pro — Cloudflare Pages build.
#
# Produces a static site in ./dist that CF Pages publishes. Real Supabase
# credentials are injected from CF Pages *encrypted* environment variables
# (RENTBILL_SUPABASE_URL / RENTBILL_SUPABASE_KEY) at build time — they are never
# committed to GitHub and never shipped as plaintext in the repo.
#
# Cloudflare Pages configuration:
#   Build command:   bash cloudflare-build.sh
#   Build output:    dist
#   Environment vars (Production + Preview):
#     RENTBILL_SUPABASE_URL  e.g. https://abcd1234.supabase.co
#     RENTBILL_SUPABASE_KEY  your anon/publishable key
set -euo pipefail

DIST=dist

rm -rf "$DIST"
mkdir -p "$DIST"

# 1) Copy static application assets (the Go binary / tests / scripts are excluded).
cp index.html "$DIST/index.html"
cp _headers "$DIST/_headers"
cp _redirects "$DIST/_redirects"
cp -r css "$DIST/css"
cp -r js "$DIST/js"
cp -r layout "$DIST/layout"
cp -r i18n "$DIST/i18n"

# 2) Inject Supabase config from env vars (overwrites the committed safe stub).
node scripts/generate-build-config.js "$DIST/js/core/build-config.js"

# 3) Inject build timestamp cache-buster for build-config.js in output HTML files
node -e "
const fs = require('fs');
const v = Date.now();
['$DIST/index.html', '$DIST/paid.html', '$DIST/receipt.html'].forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/js\/core\/build-config\.js(\?v=\d+)?/g, 'js/core/build-config.js?v=' + v);
    fs.writeFileSync(f, content, 'utf8');
  }
});
"

echo "Cloudflare Pages build complete -> $DIST"
