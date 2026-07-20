#!/usr/bin/env sh
set -eu
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst Node.js 24 LTS installieren."
  exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env wurde aus .env.example erstellt."
fi
if [ ! -d node_modules ]; then
  echo "Installiere Projektabhaengigkeiten..."
  npm install
fi
npm run dev:full
