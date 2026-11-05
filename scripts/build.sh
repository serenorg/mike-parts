#!/usr/bin/env bash
# ABOUTME: Bundles the two command-line tools into single files in dist/ that run on Node 22 with no node_modules.
# ABOUTME: Run from anywhere after npm ci; dist/ is committed.
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in docx-tracked-changes verify-quotes; do
  npx --no-install esbuild "cli/$tool.ts" --bundle --platform=node --target=node22 --format=cjs \
    --log-level=warning --outfile="dist/$tool.js"
done
ls -l dist
