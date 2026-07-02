#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  npm run backup:db
  ./scripts/backup-prod-db.sh

Environment overrides:
  ENV_FILE=...                 Path to env file. Defaults to ./.env.
  PROD_BACKUP_DATABASE_URL=... Direct Supabase DB URL for pg_dump.
  DATABASE_URL=...             Fallback DB URL.
  SUPABASE_DB_URL=...          Fallback DB URL.
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

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

parse_env_value() {
  local value
  value="$(trim_whitespace "$1")"

  if [[ "${#value}" -ge 2 ]]; then
    local first="${value:0:1}"
    local last="${value: -1}"

    if [[ "$first" == "'" && "$last" == "'" ]]; then
      printf '%s' "${value:1:${#value}-2}"
      return
    fi

    if [[ "$first" == '"' && "$last" == '"' ]]; then
      value="${value:1:${#value}-2}"
      value="${value//\\n/$'\n'}"
      value="${value//\\r/$'\r'}"
      value="${value//\\t/$'\t'}"
      value="${value//\\\"/\"}"
      value="${value//\\\\/\\}"
      printf '%s' "$value"
      return
    fi
  fi

  value="${value%%[[:space:]]#*}"
  trim_whitespace "$value"
}

load_env_file() {
  local env_file="$1"
  local raw_line line normalized_line key value

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="$(trim_whitespace "$raw_line")"

    if [[ -z "$line" || "$line" == \#* ]]; then
      continue
    fi

    if [[ "$line" == export[[:space:]]* ]]; then
      normalized_line="$(trim_whitespace "${line#export}")"
    else
      normalized_line="$line"
    fi

    if [[ "$normalized_line" != *=* ]]; then
      continue
    fi

    key="$(trim_whitespace "${normalized_line%%=*}")"
    value="${normalized_line#*=}"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    if [[ -n "${!key+x}" ]]; then
      continue
    fi

    case "$key" in
      BACKUP_ROOT | DATABASE_URL | PROD_BACKUP_DATABASE_URL | SUPABASE_DB_URL) ;;
      *) continue ;;
    esac

    value="$(parse_env_value "$value")"
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$env_file"
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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create it from .env.example or pass ENV_FILE=/path/to/.env." >&2
  exit 1
fi

load_env_file "$ENV_FILE"

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/ajowa-prod-backups}"
BACKUP_DATABASE_URL="${PROD_BACKUP_DATABASE_URL:-${DATABASE_URL:-${SUPABASE_DB_URL:-}}}"

if [[ -z "$BACKUP_DATABASE_URL" ]]; then
  echo "DATABASE_URL, SUPABASE_DB_URL, or PROD_BACKUP_DATABASE_URL is required." >&2
  exit 1
fi

if [[ "$BACKUP_DATABASE_URL" == *"<"* || "$BACKUP_DATABASE_URL" == *">"* ]]; then
  echo "Backup database URL still contains placeholder text like <project-ref>." >&2
  echo "Set PROD_BACKUP_DATABASE_URL or DATABASE_URL to a real database URL." >&2
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
