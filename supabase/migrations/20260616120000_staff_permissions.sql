alter table users
  add column if not exists staff_permissions text[] not null default '{}';

update users
set staff_permissions = array[
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'dues.manage',
  'defaulters.view',
  'staff.manage'
]
where role = 'ADMIN'
  and cardinality(staff_permissions) = 0;

update users
set staff_permissions = array[
  'society.manage',
  'blocks.manage',
  'flats.manage',
  'residents.manage',
  'billing.view',
  'billing.manage',
  'defaulters.view'
]
where role = 'MANAGER'
  and cardinality(staff_permissions) = 0;
