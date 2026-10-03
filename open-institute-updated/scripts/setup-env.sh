#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_ENV="backend/.env"
ROOT_ENV=".env"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate secrets. Install it and re-run." >&2
  exit 1
fi

JWT_SECRET="$(openssl rand -hex 32)"
MOODLE_WEBHOOK_SECRET="$(openssl rand -hex 24)"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
INTEGRATION_SECRET_ENCRYPTION_KEY="$(openssl rand -hex 32)"

replace_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local expression="s|^${key}=.*|${key}=${value}|"
  if sed --version >/dev/null 2>&1; then
    sed -i "$expression" "$file"
  else
    sed -i '' "$expression" "$file"
  fi
}

if [ -f "$ROOT_ENV" ]; then
  echo "$ROOT_ENV already exists — leaving it alone."
else
  cp .env.compose.example "$ROOT_ENV"
  replace_env_value "$ROOT_ENV" POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  replace_env_value "$ROOT_ENV" JWT_SECRET "$JWT_SECRET"
  replace_env_value "$ROOT_ENV" MOODLE_WEBHOOK_SECRET "$MOODLE_WEBHOOK_SECRET"
  replace_env_value "$ROOT_ENV" INTEGRATION_SECRET_ENCRYPTION_KEY "$INTEGRATION_SECRET_ENCRYPTION_KEY"
  chmod 600 "$ROOT_ENV"
  echo "Created $ROOT_ENV with generated database, JWT, and webhook secrets."
fi

if [ -f "$BACKEND_ENV" ]; then
  echo "$BACKEND_ENV already exists — leaving it alone."
else
  cp backend/.env.example "$BACKEND_ENV"
  replace_env_value "$BACKEND_ENV" JWT_SECRET "\"${JWT_SECRET}\""
  replace_env_value "$BACKEND_ENV" MOODLE_WEBHOOK_SECRET "$MOODLE_WEBHOOK_SECRET"
  chmod 600 "$BACKEND_ENV"
  echo "Created $BACKEND_ENV for local backend development."
fi

echo "Before docker compose up, set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and FRONTEND_ORIGIN in $ROOT_ENV."
echo "Moodle is not bundled in this Compose stack. Set its URL and service tokens in $ROOT_ENV when available."
