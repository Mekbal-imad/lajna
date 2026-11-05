-- اختبار صلاحيات المرحلة 1. يُشغَّل على قاعدة تطوير فقط:
--   psql "$DATABASE_URL" -f supabase/tests/001_rls_foundation.sql
-- ينشئ مستخدمين مؤقتين، يتحقق، ثم يتراجع عن كل شيء (ROLLBACK).
begin;

insert into auth.users (id, email, instance_id, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a1', id from public.roles where code = 'super_admin';
insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000b2', id from public.roles where code = 'member';

-- ===== العضو العادي =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  assert n = 1, 'العضو يجب أن يرى ملفه فقط، رأى ' || n;

  select count(*) into n from public.audit_logs;
  assert n = 0, 'العضو لا يجب أن يرى سجل النشاطات';

  begin
    insert into public.user_roles (user_id, role_id)
    select '00000000-0000-0000-0000-0000000000b2', id from public.roles where code = 'super_admin';
    raise exception 'FAIL: العضو عيّن لنفسه دور مدير';
  exception when insufficient_privilege or others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  begin
    update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'FAIL: العضو عطّل حسابه دون صلاحية';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  update public.committees set name_ar = 'x' where slug = 'cleaning';
  get diagnostics n = row_count;
  assert n = 0, 'العضو لا يجب أن يعدّل اللجان';
end $$;

-- ===== مدير النظام =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  assert n >= 2, 'المدير يجب أن يرى جميع الملفات';
  update public.committees set description = description where slug = 'cleaning';
  get diagnostics n = row_count;
  assert n = 1, 'المدير يجب أن يعدّل اللجان';
end $$;

rollback;
select 'RLS foundation tests passed' as result;
