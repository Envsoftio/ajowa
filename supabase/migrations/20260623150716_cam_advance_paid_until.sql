alter table flats
  add column if not exists cam_advance_paid_until date,
  add column if not exists cam_advance_note text,
  add column if not exists cam_advance_updated_at timestamptz,
  add column if not exists cam_advance_updated_by_user_id uuid references users(id) on delete set null;

create index if not exists flats_society_cam_advance_paid_until_idx
  on flats (society_id, cam_advance_paid_until)
  where cam_advance_paid_until is not null;
