update users
set staff_permissions = array[
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'defaulters.view',
  'finance.view',
  'finance.manage',
  'notifications.view',
  'notifications.manage'
]
where role = 'MANAGER'
  and deleted_at is null
  and cardinality(staff_permissions) = 0;

update users
set staff_permissions = '{}'::text[]
where role in ('SERVICE_STAFF', 'GUARD')
  and deleted_at is null
  and cardinality(staff_permissions) > 0;

update users
set email_verified = true,
    updated_at = now()
where role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
  and deleted_at is null
  and email_verified = false;

update auth_users au
set email_verified = true,
    updated_at = now()
from users u
where u.auth_user_id = au.id
  and u.role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
  and u.deleted_at is null
  and au.email_verified = false;
