update users
set staff_permissions = array_append(staff_permissions, 'dues.manage')
where role = 'MANAGER'
  and deleted_at is null
  and not ('dues.manage' = any(staff_permissions));
