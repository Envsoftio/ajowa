alter table user_access_status
  add column if not exists override_state text,
  add column if not exists override_reason text,
  add column if not exists override_by_user_id uuid references users(id) on delete set null,
  add column if not exists override_at timestamptz,
  add column if not exists override_expires_at timestamptz,
  add constraint user_access_status_override_state_chk
    check (override_state is null or override_state in ('GRANTED', 'BLOCKED'));

alter table access_tokens
  add column if not exists qr_image_path text,
  add column if not exists valid_until timestamptz;

create index if not exists access_tokens_active_lookup_idx
  on access_tokens (token_hash, status, is_valid);

create index if not exists user_access_status_lookup_idx
  on user_access_status (user_id, billing_period_id, is_access_granted);

create index if not exists gate_scan_logs_guard_user_id_idx on gate_scan_logs (guard_user_id);
create index if not exists gate_scan_logs_result_idx on gate_scan_logs (scan_result);
