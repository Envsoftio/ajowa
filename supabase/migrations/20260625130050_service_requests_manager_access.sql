update users
set staff_permissions = array_append(staff_permissions, 'service-requests.manage'),
    updated_at = now()
where role = 'MANAGER'
  and deleted_at is null
  and cardinality(staff_permissions) > 0
  and not ('service-requests.manage' = any(staff_permissions));
