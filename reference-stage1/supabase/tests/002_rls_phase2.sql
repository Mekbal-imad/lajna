-- Phase 2 permission tests. Development databases only:
--   psql "$DATABASE_URL" -f supabase/tests/002_rls_phase2.sql
-- Creates temporary users, asserts, then ROLLBACKs.
begin;

insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'assigner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'target@test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'root@test.local',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- A role that may assign roles but is not super admin.
insert into public.roles (code, name_ar) values ('role_assigner', 'مفوّض الأدوار');
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.code = 'role_assigner' and p.code in ('roles.assign', 'users.view');

insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000c1', id from public.roles where code = 'role_assigner';
insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000c3', id from public.roles where code = 'super_admin';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$
begin
  -- allowed: assign a normal role to someone else
  insert into public.user_roles (user_id, role_id)
  select '00000000-0000-0000-0000-0000000000c2', id from public.roles where code = 'member';

  -- denied: assign super_admin
  begin
    insert into public.user_roles (user_id, role_id)
    select '00000000-0000-0000-0000-0000000000c2', id from public.roles where code = 'super_admin';
    raise exception 'FAIL: non-super-admin granted super_admin';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- denied: change own roles
  begin
    insert into public.user_roles (user_id, role_id)
    select '00000000-0000-0000-0000-0000000000c1', id from public.roles where code = 'member';
    raise exception 'FAIL: user changed own roles';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- denied: revoke super_admin from someone
  begin
    delete from public.user_roles
    where user_id = '00000000-0000-0000-0000-0000000000c3'
      and role_id = (select id from public.roles where code = 'super_admin');
    raise exception 'FAIL: non-super-admin revoked super_admin';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  assert 'roles.assign' = any (public.my_permissions()), 'my_permissions should list roles.assign';
  assert not ('users.manage' = any (public.my_permissions())), 'my_permissions must not list users.manage';
end $$;

rollback;
select 'RLS phase 2 tests passed' as result;
