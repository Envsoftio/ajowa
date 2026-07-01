#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/backup-prod-db.sh

Environment overrides:
  ENV_FILE=...                 Path to env file. Defaults to ./.env.
  PROD_BACKUP_DATABASE_URL=... Direct Supabase DB URL for pg_dump. Falls back to DATABASE_URL.
  BACKUP_ROOT=...              Backup parent directory. Defaults to ~/ajowa-prod-backups.

The script creates:
  <BACKUP_ROOT>/<utc-timestamp>/ajowa-prod-public.dump
  <BACKUP_ROOT>/<utc-timestamp>/ajowa-prod-public.contents.txt
USAGE
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    echo "Install PostgreSQL client tools, then run this script again." >&2
    exit 127
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 0 ]]; then
  echo "Unknown argument: $1" >&2
  usage >&2
  exit 64
fi

require_command pg_dump
require_command pg_restore

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/ajowa-prod-backups}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create it from .env.example or pass ENV_FILE=/path/to/.env." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

BACKUP_DATABASE_URL="${PROD_BACKUP_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$BACKUP_DATABASE_URL" ]]; then
  echo "DATABASE_URL or PROD_BACKUP_DATABASE_URL is required." >&2
  exit 1
fi

if [[ "$BACKUP_DATABASE_URL" == *"localhost"* || "$BACKUP_DATABASE_URL" == *"127.0.0.1"* ]]; then
  echo "Warning: backup URL looks local, not production." >&2
fi

if [[ "$BACKUP_DATABASE_URL" == *"pooler.supabase.com:6543"* ]]; then
  echo "Warning: DATABASE_URL uses the Supabase transaction pooler on 6543." >&2
  echo "For pg_dump, prefer setting PROD_BACKUP_DATABASE_URL to the direct 5432 URL." >&2
fi

BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_STAMP"
DUMP_FILE="$BACKUP_DIR/ajowa-prod-public.dump"
CONTENTS_FILE="$BACKUP_DIR/ajowa-prod-public.contents.txt"

mkdir -p "$BACKUP_DIR"

echo "Loading env from: $ENV_FILE"
echo "Backup directory: $BACKUP_DIR"
echo "Creating public application schema backup..."

pg_dump \
  --format=custom \
  --schema=public \
  --no-owner \
  --verbose \
  --file "$DUMP_FILE" \
  "$BACKUP_DATABASE_URL"

pg_restore --list "$DUMP_FILE" > "$CONTENTS_FILE"

echo
echo "Backup complete."
echo "Dump file: $DUMP_FILE"
echo "Contents file: $CONTENTS_FILE"
