insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'resident-documents',
    'resident-documents',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'payment-proofs',
    'payment-proofs',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'receipts',
    'receipts',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'qr-images',
    'qr-images',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'finance-attachments',
    'finance-attachments',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'ticket-attachments',
    'ticket-attachments',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'notice-attachments',
    'notice-attachments',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  (
    'report-exports',
    'report-exports',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.file_objects (
  id uuid primary key,
  storage_target_key text not null check (
    storage_target_key in (
      'resident_documents',
      'payment_proofs',
      'receipts',
      'qr_images',
      'finance_attachments',
      'ticket_attachments',
      'notice_attachments',
      'report_exports'
    )
  ),
  storage_object_key text not null unique,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  checksum text,
  uploaded_by text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  related_record_type text not null,
  related_record_id text not null,
  upload_status text not null default 'PENDING' check (upload_status in ('PENDING', 'READY', 'FAILED')),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists file_objects_related_record_idx
  on public.file_objects (related_record_type, related_record_id);

create index if not exists file_objects_uploaded_by_idx
  on public.file_objects (uploaded_by);

create index if not exists file_objects_upload_status_idx
  on public.file_objects (upload_status, updated_at);
