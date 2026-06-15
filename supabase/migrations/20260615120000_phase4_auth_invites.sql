create table auth_invites (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references society_profile(id) on delete restrict,
  email citext not null,
  role app_role not null,
  full_name text,
  mobile_number text,
  relationship_type relationship_type,
  access_scope access_scope,
  flat_ids uuid[] not null default '{}'::uuid[],
  flat_labels text[] not null default '{}'::text[],
  department_ids uuid[] not null default '{}'::uuid[],
  department_names text[] not null default '{}'::text[],
  token_hash text not null unique,
  invited_by_user_id uuid not null references users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth_users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index auth_invites_email_idx on auth_invites (email);
create index auth_invites_role_idx on auth_invites (role);
create index auth_invites_expires_at_idx on auth_invites (expires_at);
create trigger auth_invites_set_updated_at before update on auth_invites for each row execute function set_updated_at();
