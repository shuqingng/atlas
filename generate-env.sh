#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  generate-env.sh  –  Local development: generate atlas-env.js from .env.local
#
#  Usage:
#    ./generate-env.sh          # generates atlas-env.js
#
#  In production, GitHub Actions runs the equivalent Python block in deploy.yml
#  and bakes secrets directly — you never need to run this script in CI.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "       Create it and add:"
  echo "         APPS_SCRIPT_URL=<your Apps Script web app URL>"
  echo "         APPS_SCRIPT_TOKEN=<your secret token>"
  exit 1
fi

python3 - "$ENV_FILE" << 'PY'
import json, os, sys

env = {}
with open(sys.argv[1]) as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, val = line.partition("=")
            key = key.strip()
            # strip optional surrounding quotes
            val = val.strip().strip('"').strip("'")
            env[key] = val

required = ["APPS_SCRIPT_URL", "APPS_SCRIPT_TOKEN"]
missing  = [k for k in required if not env.get(k)]
if missing:
    print(f"ERROR: missing keys in .env.local: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

cfg = {k: env[k] for k in required}

with open("atlas-env.js", "w", encoding="utf-8") as out:
    out.write("// AUTO-GENERATED — do not edit by hand.\n")
    out.write("// Run ./generate-env.sh to regenerate from .env.local\n")
    out.write("window.__ATLAS_ENV__ = ")
    json.dump(cfg, out, indent=2)
    out.write(";\n")

print("✓  atlas-env.js generated from .env.local")
for k in required:
    print(f"   {k} = {cfg[k][:40]}{'…' if len(cfg[k]) > 40 else ''}")
PY
