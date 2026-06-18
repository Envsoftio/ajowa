set storage.allow_delete_query = 'true';

delete from public.file_objects
where storage_target_key = 'society_logos';

delete from storage.objects
where bucket_id = 'society-logos';

delete from storage.buckets
where id = 'society-logos';

reset storage.allow_delete_query;

alter table public.society_profile
  drop column if exists logo_path;

alter table public.file_objects
  drop constraint if exists file_objects_storage_target_key_check;

alter table public.file_objects
  add constraint file_objects_storage_target_key_check
  check (
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
  );
