-- Give every due a stable, database-assigned invoice serial. The serial is
-- intentionally independent of the flat number so regenerated PDFs retain the
-- same accounting identity while different dues cannot reuse an invoice number.
alter table public.maintenance_dues
  add column invoice_sequence_number bigint generated always as identity;

alter table public.maintenance_dues
  add constraint maintenance_dues_invoice_sequence_number_key
  unique (invoice_sequence_number);

comment on column public.maintenance_dues.invoice_sequence_number is
  'Immutable global serial used to construct unique CAM, DG, and dues invoice numbers.';
