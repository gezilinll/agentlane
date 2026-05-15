#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run check:repo
npm run check:commit-message
npm run check:db
npm run check:backend
npm run check:quick
npm run check:build
npm run check:deploy
npm run check:e2e
npm run check:e2e:auth

echo "verify: ok"
