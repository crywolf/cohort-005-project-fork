#!/usr/bin/env bash
#
# One-command setup for the Cadence in-app notifications in Knock.
#
# Creates the 7 workflows (workflow.json files live in .knock/workflows/,
# version-controlled in this repo) and pushes them to Knock.
#
# Prerequisites:
#   1. An in-app feed channel exists in the Knock dashboard (its UUID is
#      already wired into .env as KNOCK_FEED_CHANNEL_ID).
#   2. A service token from the dashboard (Developer tools → Service tokens).
#      This is NOT the sk_… secret API key — the CLI uses service tokens.
#      Either export KNOCK_SERVICE_TOKEN=<token> or put
#      { "serviceToken": "<token>" } in ~/.config/knock/config.json.
#
# Usage:
#   ./scripts/knock-setup.sh
#   KNOCK_ENVIRONMENT=development ./scripts/knock-setup.sh   # default
#   KNOCK_ENVIRONMENT=production  ./scripts/knock-setup.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENVIRONMENT="${KNOCK_ENVIRONMENT:-development}"

if ! command -v knock >/dev/null 2>&1; then
  echo "==> Installing the Knock CLI (npm install -g @knocklabs/cli)…"
  npm install -g @knocklabs/cli
fi

echo "==> Checking CLI authentication…"
if ! knock whoami >/dev/null 2>&1; then
  echo "ERROR: not authenticated with the Knock CLI."
  echo "  Create a service token in the dashboard (Developer tools → Service tokens), then either:"
  echo "    export KNOCK_SERVICE_TOKEN=<token>"
  echo "  or put { \"serviceToken\": \"<token>\" } in ~/.config/knock/config.json"
  exit 1
fi

echo "==> Ensuring the three preference categories exist…"
# Categories must exist in the project's catalog before a workflow can
# reference them — the workflow push fails otherwise. Knock's Management API
# upserts them by name; it needs the same service token the CLI uses.
SERVICE_TOKEN="${KNOCK_SERVICE_TOKEN:-$(node -e '
  try {
    const fs = require("fs");
    const os = require("os");
    const config = JSON.parse(
      fs.readFileSync(os.homedir() + "/.config/knock/config.json", "utf8")
    );
    console.log(config.serviceToken ?? "");
  } catch {
    console.log("");
  }
')}"
if [ -z "$SERVICE_TOKEN" ]; then
  echo "ERROR: no service token found for the Management API."
  echo "  Export KNOCK_SERVICE_TOKEN=<token> or put it in ~/.config/knock/config.json."
  exit 1
fi
for CATEGORY in discussion-activity purchases-refunds new-students; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    "https://control.knock.app/v1/preference_categories/$CATEGORY" \
    -H "Authorization: Bearer $SERVICE_TOKEN")
  if [ "$STATUS" != "200" ]; then
    echo "ERROR: creating category '$CATEGORY' failed (HTTP $STATUS)."
    echo "  Create it in the dashboard instead (Settings → Categories), then re-run."
    exit 1
  fi
  echo "    ✓ $CATEGORY"
done

echo "==> Finding the in-app feed channel…"
CHANNEL_JSON="$(knock channel list --json 2>/dev/null || knock channel list)"
FEED_CHANNEL_KEY="$(node -e '
  const raw = JSON.parse(process.argv[1]);
  const channels = Array.isArray(raw) ? raw : raw.channels ?? raw.entries ?? [];
  const feed = channels.find(
    (c) => c.type === "in_app_feed" || c.channel_type === "in_app_feed"
  );
  if (!feed) {
    console.error("ERROR: no in-app feed channel found. Create one in the dashboard first.");
    console.error("Raw channel list: " + JSON.stringify(channels));
    process.exit(1);
  }
  console.log(feed.key);
' "$CHANNEL_JSON")"

echo "    Using feed channel: $FEED_CHANNEL_KEY"

echo "==> Wiring the feed channel into the workflow definitions…"
node -e '
  const fs = require("fs");
  const path = require("path");
  const key = process.argv[1];
  if (!key) {
    console.error("ERROR: empty feed channel key — refusing to write it.");
    process.exit(1);
  }
  const dir = ".knock/workflows";
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, "workflow.json");
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const step of json.steps) {
      if (step.channel_type === "in_app_feed") step.channel_key = key;
    }
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }
' "$FEED_CHANNEL_KEY"

echo "==> Validating workflows…"
knock workflow validate --all --workflows-dir=.knock/workflows

echo "==> Pushing workflows to the '$ENVIRONMENT' environment…"
knock workflow push --all \
  --workflows-dir=.knock/workflows \
  --environment="$ENVIRONMENT" \
  --commit -m "Set up Cadence in-app notification workflows"

echo ""
echo "Done. The 7 workflows are live in '$ENVIRONMENT'."
echo "If push reported a category error, create the category in the dashboard"
echo "(Settings → Categories) and re-run this script."
