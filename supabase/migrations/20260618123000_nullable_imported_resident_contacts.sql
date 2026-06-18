alter table users
  alter column auth_user_id drop not null,
  alter column email drop not null,
  alter column mobile_number drop not null;

alter table users
  add constraint users_login_requires_auth_email
  check (
    can_login = false
    or (auth_user_id is not null and email is not null)
  );
