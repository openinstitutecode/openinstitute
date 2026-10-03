#!/bin/bash
# Batch 47 — completes installation of the plugins baked into this image
# by moodle/Dockerfile (auth_userkey, mod_bigbluebuttonbn, tool_trigger).
#
# On a completely fresh `docker compose up` (empty moodledata volume)
# Moodle's own installer already picks these up automatically and this
# script is a harmless no-op. It exists for the other case: you added
# these plugins to an image that's running against an ALREADY-INSTALLED
# Moodle site, so the installer already ran once without them.
#
# Usage:  docker compose exec moodle bash /finish-plugin-install.sh
set -euo pipefail

MOODLE_ROOT="$(cat /moodle-root.txt 2>/dev/null || true)"
if [ -z "$MOODLE_ROOT" ]; then
  echo "Could not find /moodle-root.txt — was this image built from moodle/Dockerfile?" >&2
  exit 1
fi

cd "$MOODLE_ROOT"
echo "Running Moodle's own upgrade CLI to install any plugins found on disk..."
php admin/cli/upgrade.php --non-interactive

cat <<'EOF'

Plugin files are installed. Two things are still manual — Moodle has no
CLI for either, and they're config, not code:
  1. mod_bigbluebuttonbn: Site administration > Plugins > Activity
     modules > BigBlueButtonBN — set your BBB server URL + shared
     secret (matches BBB_SERVER_URL / BBB_SHARED_SECRET in .env).
  2. tool_trigger: Site administration > Server > Trigger rules — add a
     rule posting to /api/moodle/webhooks/events with the header
     X-Webhook-Secret matching MOODLE_WEBHOOK_SECRET in backend/.env.

Then run:  docker compose exec moodle php /provision-moodle.php
to create the web service tokens (MOODLE_WS_TOKEN, MOODLE_SSO_WS_TOKEN)
without touching the Web services admin screens by hand.
EOF
