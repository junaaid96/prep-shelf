#!/usr/bin/env bash
# Refresh the vendored renderer libraries (run occasionally; the site works offline with them).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor
curl -sSL -o vendor/marked.min.js    https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
curl -sSL -o vendor/highlight.min.js https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
echo "vendor/ refreshed"
