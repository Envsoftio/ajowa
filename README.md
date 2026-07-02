# AJOWA

AJOWA is a Nuxt 3 + Nitro SSR application for society management, built with PrimeVue, Pinia, Better Auth, and Supabase.

## Prerequisites

- Node.js `22.x` or newer
- npm `10.x` or newer
- Docker Desktop for local Supabase
- Supabase CLI available through `npx supabase`

## Getting Started

1. Copy `.env.example` to `.env` and fill in the required values.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Use `npm run db:reset` only when you intentionally want to rebuild the local database from scratch.

## Scripts

- `npm run dev` starts the Nuxt development server.
- `npm run build` creates the production Nitro bundle.
- `npm run preview` serves the production build locally.
- `npm run netlify:dev` starts the app through Netlify Dev with production-context env.
- `npm run netlify:serve` builds and serves the Netlify production bundle locally.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs Nuxt type checking.
- `npm run db:reset` resets the local Supabase database.

## Local Database Migrations

To apply new migration files to the local Supabase database without resetting
local data, make sure Supabase is running and then run:

```bash
npx supabase start
npx supabase migration list --local
npx supabase migration up --local
npx supabase migration list --local
```

Use `npm run db:reset` only when you want to drop and recreate the local
database, including seed data.

## Production Database

For Netlify functions, set `DATABASE_URL` to the Supabase Shared Pooler
transaction URL on port `6543`:

```text
postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:6543/postgres?sslmode=require
```

Do not use `db.<project-ref>.supabase.co:5432` for Netlify production unless the
Supabase project has the IPv4 add-on. That direct endpoint is IPv6 by default,
while serverless functions commonly need the IPv4 pooler.

Load `.env` before running production database commands:

```bash
set -a
source .env
set +a
```

### Production backup and restore

Before risky production changes, take a logical backup of the application
schema. The backup script loads `.env`, creates a timestamped backup directory,
and writes a custom-format `pg_dump` archive plus a restore contents listing.
For `pg_dump`, prefer the Supabase direct database URL on port `5432` when your
network supports it. If `PROD_BACKUP_DATABASE_URL` is not set, the script falls
back to `DATABASE_URL` or `SUPABASE_DB_URL`.

```bash
# Optional, recommended for pg_dump:
# export PROD_BACKUP_DATABASE_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"

npm run backup:db
```

This creates:

```text
~/ajowa-prod-backups/<timestamp>/ajowa-prod-public.dump
~/ajowa-prod-backups/<timestamp>/ajowa-prod-public.contents.txt
```

Restore only into a local, scratch, or new Supabase project database first.
Never point `RESTORE_DATABASE_URL` at the current production database unless
you intentionally want to replace production data and have planned downtime.

```bash
BACKUP_FILE="$HOME/ajowa-prod-backups/<timestamp>/ajowa-prod-public.dump"

# Local Supabase restore target:
RESTORE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable"

# Or use a new/scratch Supabase project:
# RESTORE_DATABASE_URL="postgresql://postgres:<db-password>@db.<new-project-ref>.supabase.co:5432/postgres?sslmode=require"

pg_restore --list "$BACKUP_FILE"

psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "drop schema if exists public cascade;"

pg_restore \
  --dbname "$RESTORE_DATABASE_URL" \
  --no-owner \
  --verbose \
  "$BACKUP_FILE"

psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select count(*) as users_count from public.users;"

psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select count(*) as dues_count from public.maintenance_dues;"
```

For a production incident, prefer Supabase Dashboard backups or Point-in-Time
Recovery when available. The logical dump above is useful for manual recovery
and verification, but it does not back up the actual files stored in Supabase
Storage buckets. Back up Storage objects separately for buckets such as
`resident-documents`, `payment-proofs`, `receipts`, `qr-images`,
`finance-attachments`, `ticket-attachments`, `notice-attachments`, and
`report-exports`.

To copy Storage objects into a timestamped local backup directory, run:

```bash
# Optional, recommended for storage metadata reads:
# export STORAGE_BACKUP_DATABASE_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"

npm run backup:storage
```

The script loads `.env`, reads bucket/object metadata from the `storage` schema,
downloads object bytes through the Supabase Storage API using
`SUPABASE_SERVICE_ROLE_KEY`, and writes:

```text
~/ajowa-storage-backups/<timestamp>/storage-buckets.json
~/ajowa-storage-backups/<timestamp>/storage-policies.json
~/ajowa-storage-backups/<timestamp>/storage-objects-metadata.jsonl
~/ajowa-storage-backups/<timestamp>/storage-objects-manifest.jsonl
~/ajowa-storage-backups/<timestamp>/manifest.json
~/ajowa-storage-backups/<timestamp>/objects/<bucket>/<object path>
```

You can limit a test run to one bucket:

```bash
npm run backup:storage -- --bucket receipts
```

Example daily cron entry:

```cron
0 2 * * * cd /path/to/ajowa && npm run backup:storage >> "$HOME/ajowa-storage-backups/backup.log" 2>&1
```

Preview and apply pending production migrations:

```bash
npx supabase migration list --db-url "$DATABASE_URL"
npx supabase db push --db-url "$DATABASE_URL" --dry-run
npx supabase db push --db-url "$DATABASE_URL" --yes
npx supabase migration list --db-url "$DATABASE_URL"
```

If `db push` fails through the Supabase transaction pooler with a prepared
statement error, apply the single migration with `psql` and record it in
Supabase migration history in the same transaction:

```bash
MIGRATION_VERSION=20260622144953
MIGRATION_NAME=allow_zero_period_variable_charges
MIGRATION_FILE="supabase/migrations/${MIGRATION_VERSION}_${MIGRATION_NAME}.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 \
  -f "$MIGRATION_FILE" \
  -c "insert into supabase_migrations.schema_migrations (version, name) values ('$MIGRATION_VERSION', '$MIGRATION_NAME') on conflict (version) do update set name = excluded.name;"
```

Verify the production migration after applying it:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt \
  -c "select version, name from supabase_migrations.schema_migrations where version = '20260622144953';"
```

Run advisors after schema changes:

```bash
npx supabase db advisors --db-url "$DATABASE_URL" --type all --level warn --fail-on none
```

`supabase/seed.sql` is an initial-load seed. It rewrites society, resident, auth, service, and billing seed data, so do not rerun it on a live production database with real activity unless you intentionally want to refresh those rows.

## Delivery Guardrails

- Supabase service-role access is server-only via `server/utils/supabase.ts`.
- Runtime configuration is validated on Nitro startup.
- Theme preference is cookie-backed, not stored in `localStorage`.
- CI must pass install, lint, type-check, and production build before merge.
