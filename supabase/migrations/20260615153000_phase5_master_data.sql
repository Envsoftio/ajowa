alter table users
  add column if not exists is_whatsapp_same_as_mobile boolean not null default true;

alter table flat_residents
  add column if not exists security_deposit_note text;

create or replace function ensure_valid_flat_resident()
returns trigger
language plpgsql
as $$
declare
  v_sum numeric(7,2);
  v_count integer;
  v_percent_count integer;
  v_requires_lease boolean;
  v_supports_ownership boolean;
begin
  v_requires_lease = new.relationship_type in ('TENANT', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT');
  v_supports_ownership = new.relationship_type in ('OWNER', 'CO_OWNER', 'SHOP_OWNER');

  if v_requires_lease and (new.lease_start_date is null or new.lease_end_date is null) then
    raise exception 'lease-backed relationships require lease_start_date and lease_end_date';
  end if;

  if not v_requires_lease and (new.lease_start_date is not null or new.lease_end_date is not null) then
    raise exception 'lease dates are only valid for tenant or commercial occupant relationships';
  end if;

  if not v_supports_ownership and (new.ownership_percent is not null or new.owner_type is not null) then
    raise exception 'ownership fields are only valid for owner relationships';
  end if;

  if new.relationship_type in ('OWNER', 'SHOP_OWNER') and new.owner_type is null then
    new.owner_type = 'PRIMARY_OWNER';
  elsif new.relationship_type = 'CO_OWNER' and new.owner_type is null then
    new.owner_type = 'CO_OWNER';
  end if;

  if v_supports_ownership and new.access_scope is null then
    new.access_scope = 'OWNERSHIP';
  elsif new.relationship_type in ('TENANT', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT') and new.access_scope is null then
    new.access_scope = 'TENANCY';
  elsif new.relationship_type = 'FAMILY_MEMBER' and new.access_scope is null then
    new.access_scope = 'HOUSEHOLD';
  end if;

  select
    coalesce(sum(ownership_percent), 0),
    count(*),
    count(ownership_percent)
  into v_sum, v_count, v_percent_count
  from flat_residents
  where flat_id = new.flat_id
    and relationship_type in ('OWNER', 'CO_OWNER', 'SHOP_OWNER')
    and is_active = true
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_supports_ownership and new.is_active then
    v_count = v_count + 1;
    if new.ownership_percent is not null then
      v_sum = v_sum + new.ownership_percent;
      v_percent_count = v_percent_count + 1;
    end if;
  end if;

  if v_sum > 100.00 then
    raise exception 'active owner ownership percentages cannot exceed 100 for flat %', new.flat_id;
  end if;

  return new;
end;
$$;

create or replace function validate_owner_percentages_complete()
returns trigger
language plpgsql
as $$
declare
  v_flat_id uuid;
  v_sum numeric(7,2);
  v_count integer;
  v_percent_count integer;
begin
  v_flat_id = coalesce(new.flat_id, old.flat_id);

  if v_flat_id is null then
    return coalesce(new, old);
  end if;

  select
    coalesce(sum(ownership_percent), 0),
    count(*),
    count(ownership_percent)
  into v_sum, v_count, v_percent_count
  from flat_residents
  where flat_id = v_flat_id
    and relationship_type in ('OWNER', 'CO_OWNER', 'SHOP_OWNER')
    and is_active = true;

  if v_count > 0 and v_percent_count = v_count and v_sum <> 100.00 then
    raise exception 'active owner ownership percentages must total exactly 100 for flat %', v_flat_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop index if exists flat_residents_one_billing_contact_idx;
create unique index if not exists flat_residents_one_billing_contact_idx
  on flat_residents (flat_id)
  where is_active = true and is_billing_contact = true;

create unique index if not exists flat_residents_one_primary_contact_idx
  on flat_residents (flat_id)
  where is_active = true and is_primary_contact = true;

create unique index if not exists flat_residents_one_active_tenant_household_idx
  on flat_residents (flat_id)
  where is_active = true and relationship_type in ('TENANT', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT');
