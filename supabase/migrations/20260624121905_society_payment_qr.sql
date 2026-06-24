alter table public.society_profile
  add column if not exists payment_qr_file_id uuid
    references public.file_objects(id)
    on delete set null;

create index if not exists society_profile_payment_qr_file_id_idx
  on public.society_profile (payment_qr_file_id)
  where payment_qr_file_id is not null;
