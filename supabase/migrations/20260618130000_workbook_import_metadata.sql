alter table flats
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table flat_residents
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;
