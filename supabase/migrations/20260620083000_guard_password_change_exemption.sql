update users
set must_change_password = false,
    email_verified = true,
    updated_at = now()
where role = 'GUARD'
  and deleted_at is null
  and (must_change_password = true or email_verified = false);

update auth_users au
set email_verified = true,
    updated_at = now()
from users u
where u.auth_user_id = au.id
  and u.role = 'GUARD'
  and u.deleted_at is null
  and au.email_verified = false;
