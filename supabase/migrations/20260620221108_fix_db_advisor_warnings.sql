create schema if not exists extensions;

grant usage on schema extensions to postgres, anon, authenticated, service_role;

alter extension citext set schema extensions;
alter extension pg_trgm set schema extensions;

alter function public.set_updated_at()
  set search_path = public, extensions, pg_temp;

alter function public.prevent_immutable_change()
  set search_path = public, extensions, pg_temp;

alter function public.next_yearly_sequence(public.document_sequence_type, integer)
  set search_path = public, extensions, pg_temp;

alter function public.ensure_valid_flat_resident()
  set search_path = public, extensions, pg_temp;

alter function public.assert_open_billing_period()
  set search_path = public, extensions, pg_temp;

alter function public.assert_open_financial_period()
  set search_path = public, extensions, pg_temp;

alter function public.assert_allocation_due_period_open()
  set search_path = public, extensions, pg_temp;

alter function public.validate_posted_journal_entry()
  set search_path = public, extensions, pg_temp;
