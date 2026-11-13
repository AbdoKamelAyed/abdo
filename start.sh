#!/usr/bin/env bash
# Builds the site for this computer and opens it in your browser. Press Ctrl+C to stop.
# (Tested on Linux only; the browser-opening line is a best effort on macOS.)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required. Install it from https://nodejs.org and run this again." >&2
  exit 1
fi
( sleep 4; (open http://localhost:4173/ || xdg-open http://localhost:4173/) >/dev/null 2>&1 ) &
npm run dev
