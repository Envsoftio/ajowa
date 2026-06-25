update storage.buckets
set file_size_limit = 104857600
where id = 'report-exports';

alter table public.file_objects
  drop constraint if exists file_objects_size_bytes_check;

alter table public.file_objects
  add constraint file_objects_size_bytes_check
  check (
    size_bytes > 0
    and (
      (storage_target_key = 'report_exports' and size_bytes <= 104857600)
      or (storage_target_key <> 'report_exports' and size_bytes <= 10485760)
    )
  );
