alter table users
  add column if not exists is_whatsapp_same_as_mobile boolean not null default true;

create or replace function ensure_valid_flat_resident()
returns trigger
language plpgsql
as $$
begin
  if new.relationship_type = 'TENANT' and (new.lease_start_date is null or new.lease_end_date is null) then
    raise exception 'tenant relationships require lease_start_date and lease_end_date';
  end if;

  if new.relationship_type <> 'TENANT' and (new.lease_start_date is not null or new.lease_end_date is not null) then
    raise exception 'lease dates are only valid for tenant relationships';
  end if;

  if new.relationship_type = 'OWNER' and new.access_scope is null then
    new.access_scope = 'OWNERSHIP';
  elsif new.relationship_type = 'TENANT' and new.access_scope is null then
    new.access_scope = 'TENANCY';
  elsif new.relationship_type = 'FAMILY_MEMBER' and new.access_scope is null then
    new.access_scope = 'HOUSEHOLD';
  end if;

  return new;
end;
$$;

drop index if exists flat_residents_one_billing_contact_idx;
create unique index if not exists flat_residents_one_billing_contact_idx
  on flat_residents (flat_id)
  where is_active = true and is_billing_contact = true;

drop index if exists flat_residents_one_primary_contact_idx;
create unique index if not exists flat_residents_one_primary_contact_idx
  on flat_residents (flat_id)
  where is_active = true and is_primary_contact = true;

drop index if exists flat_residents_one_active_tenant_household_idx;
create unique index if not exists flat_residents_one_active_tenant_household_idx
  on flat_residents (flat_id)
  where is_active = true and relationship_type = 'TENANT';

drop index if exists flat_residents_one_active_owner_idx;
