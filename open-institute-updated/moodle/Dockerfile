# Batch 47 — extends the stock bitnami/moodle image with the three
# third-party plugins backend/src/moodle/*.ts already assumes exist:
#   auth/userkey          — sso.ts (SSO launch URLs)
#   mod/bigbluebuttonbn    — liveClasses.ts (live class listing)
#   admin/tool/trigger     — webhooks.ts's counterpart (outbound events)
#
# HOW THIS WORKS: Moodle's own installer scans every plugin-type folder
# (auth/, mod/, admin/tool/, ...) and installs whatever it finds there
# the first time it runs — that's what happens on a completely fresh
# `docker compose up` (empty moodledata volume): no manual step needed.
#
# If you're rebuilding this image against an ALREADY-INSTALLED Moodle
# (an existing moodledata volume from before these plugins existed),
# Moodle's installer has already run and won't notice new files on
# disk by itself — run this once after rebuilding:
#   docker compose exec moodle bash /finish-plugin-install.sh
# That command is non-interactive and safe to re-run (idempotent).
#
# VERIFY BEFORE PRODUCTION USE: the plugin repos/refs below are pinned
# to each project's default branch for a working dev setup. For
# production, check https://moodle.org/plugins for the release that
# matches your exact Moodle version and pin ARG accordingly — plugin
# authors don't guarantee `master`/`main` HEAD is always compatible
# with every Moodle version.

FROM bitnami/moodle:latest

USER root

RUN install_packages curl ca-certificates

ARG AUTH_USERKEY_REF=master
ARG BBB_REF=main
ARG TOOL_TRIGGER_REF=master

# Moodle's app root varies slightly by bitnami image version (some tag
# it /opt/bitnami/moodle, others /bitnami/moodle) — detected instead of
# hardcoded so this Dockerfile doesn't silently no-op on a version
# where the assumption is wrong.
RUN set -eux; \
    MOODLE_ROOT="$(dirname "$(find / -maxdepth 5 -type f -name version.php 2>/dev/null \
        | grep -E '/(bitnami|opt)/moodle/version\.php$' | head -n1)")"; \
    if [ -z "$MOODLE_ROOT" ] || [ "$MOODLE_ROOT" = "." ]; then \
        echo "ERROR: could not locate the Moodle application root in this base image." >&2; \
        echo "The bitnami/moodle image layout may have changed — find version.php" >&2; \
        echo "manually (docker run --rm -it bitnami/moodle:latest find / -name version.php)" >&2; \
        echo "and hardcode MOODLE_ROOT below." >&2; \
        exit 1; \
    fi; \
    echo "$MOODLE_ROOT" > /moodle-root.txt; \
    echo "Detected Moodle root: $MOODLE_ROOT"; \
    mkdir -p "$MOODLE_ROOT/auth/userkey" "$MOODLE_ROOT/mod/bigbluebuttonbn" "$MOODLE_ROOT/admin/tool/trigger"; \
    curl -fsSL "https://github.com/catalyst/moodle-auth_userkey/archive/refs/heads/${AUTH_USERKEY_REF}.tar.gz" \
        | tar xz --strip-components=1 -C "$MOODLE_ROOT/auth/userkey"; \
    curl -fsSL "https://github.com/bigbluebutton/moodle-mod_bigbluebuttonbn/archive/refs/heads/${BBB_REF}.tar.gz" \
        | tar xz --strip-components=1 -C "$MOODLE_ROOT/mod/bigbluebuttonbn"; \
    curl -fsSL "https://github.com/catalyst/moodle-tool_trigger/archive/refs/heads/${TOOL_TRIGGER_REF}.tar.gz" \
        | tar xz --strip-components=1 -C "$MOODLE_ROOT/admin/tool/trigger"; \
    chown -R 1001:0 "$MOODLE_ROOT/auth/userkey" "$MOODLE_ROOT/mod/bigbluebuttonbn" "$MOODLE_ROOT/admin/tool/trigger"; \
    chmod -R g+rwX "$MOODLE_ROOT/auth/userkey" "$MOODLE_ROOT/mod/bigbluebuttonbn" "$MOODLE_ROOT/admin/tool/trigger"

COPY finish-plugin-install.sh /finish-plugin-install.sh
COPY provision-moodle.php /provision-moodle.php
RUN chmod +x /finish-plugin-install.sh

USER 1001
