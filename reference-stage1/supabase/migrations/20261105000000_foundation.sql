-- المرحلة 1: الأساس — الأدوار والصلاحيات والملفات الشخصية واللجان وسجل النشاطات
-- ملاحظة: الصلاحيات تُفرض هنا عبر RLS. إخفاء الأزرار في الواجهة ليس حماية.

create extension if not exists pgcrypto;

-- ───────── دوال مساعدة عامة ─────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────── الأدوار والصلاحيات ─────────
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name_ar text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description_ar text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create index role_permissions_permission_idx on public.role_permissions(permission_id);

-- ───────── الملفات الشخصية ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_idx on public.user_roles(role_id);

-- ───────── اللجان ─────────
create table public.committees (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_ar text not null,
  description text,
  head_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger committees_updated_at before update on public.committees
  for each row execute function public.set_updated_at();

create table public.committee_members (
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('head', 'member')),
  joined_at timestamptz not null default now(),
  primary key (committee_id, user_id)
);
create index committee_members_user_idx on public.committee_members(user_id);

-- ───────── سجل النشاطات ─────────
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- ───────── دوال الصلاحيات (security definer لتفادي تكرار RLS) ─────────
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where pr.id = auth.uid() and pr.is_active and p.code = p_code
  );
$$;

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- تسجيل عملية في السجل (الإدراج المباشر في الجدول غير مسموح)
create or replace function public.log_action(
  p_action text, p_entity_type text, p_entity_id uuid default null, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  select auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb)
  where public.is_active_user();
$$;
revoke all on function public.log_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_action(text, text, uuid, jsonb) to authenticated;

-- منع المستخدم من تفعيل/تعطيل حسابه (أو أي حساب) دون صلاحية users.manage
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active and not public.has_permission('users.manage') then
    raise exception 'غير مصرح بتغيير حالة الحساب';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- إنشاء ملف شخصي تلقائيًا عند إنشاء مستخدم؛ لا يحصل على أي دور افتراضيًا
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email, 'مستخدم جديد'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── تفعيل RLS ─────────
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.audit_logs enable row level security;

-- الأدوار والصلاحيات: قراءة للمستخدمين النشطين، كتابة لمن يملك roles.manage
create policy roles_select on public.roles for select to authenticated using (public.is_active_user());
create policy roles_write on public.roles for all to authenticated
  using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

create policy permissions_select on public.permissions for select to authenticated using (public.is_active_user());
create policy permissions_write on public.permissions for all to authenticated
  using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

create policy role_permissions_select on public.role_permissions for select to authenticated using (public.is_active_user());
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

-- الملفات الشخصية: الشخص يرى ويعدّل ملفه، ومن يملك users.view يرى الجميع، ومن يملك users.manage يعدّل الجميع
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('users.view'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));
-- لا إدراج ولا حذف مباشر: الإنشاء عبر المشغّل، والحذف عبر auth.users

-- أدوار المستخدمين: لا يستطيع أحد تعيين دور لنفسه إلا من يملك roles.assign
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.view'));
create policy user_roles_write on public.user_roles for all to authenticated
  using (public.has_permission('roles.assign')) with check (public.has_permission('roles.assign'));

-- اللجان
create policy committees_select on public.committees for select to authenticated using (public.is_active_user());
create policy committees_write on public.committees for all to authenticated
  using (public.has_permission('committees.manage')) with check (public.has_permission('committees.manage'));

create policy committee_members_select on public.committee_members for select to authenticated using (public.is_active_user());
create policy committee_members_write on public.committee_members for all to authenticated
  using (public.has_permission('committees.manage')) with check (public.has_permission('committees.manage'));

-- سجل النشاطات: قراءة فقط لمن يملك audit.view، والإدراج عبر log_action حصرًا
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission('audit.view'));

-- ───────── بيانات مرجعية (ليست بيانات وهمية) ─────────
insert into public.roles (code, name_ar, description, is_system) values
  ('super_admin',   'مدير النظام',       'تحكم كامل في المنصة', true),
  ('chair',         'رئيس اللجنة',       'إدارة أعمال اللجنة واعتماد القرارات', true),
  ('vice_chair',    'نائب الرئيس',       'مساعدة الرئيس ومتابعة التنفيذ', true),
  ('secretary',     'أمين اللجنة',       'المحاضر والقرارات والأرشيف والتقارير', true),
  ('sub_head',      'رئيس لجنة فرعية',   'إدارة أعضاء لجنته ومهامها', true),
  ('member',        'عضو اللجنة',        'تنفيذ المهام وتحديثها', true),
  ('administration','الإدارة',           'الاطلاع على التقارير والقرارات', true);

insert into public.permissions (code, description_ar) values
  ('dashboard.view_all', 'عرض لوحة القيادة لجميع اللجان'),
  ('users.view',         'عرض المستخدمين'),
  ('users.manage',       'إدارة المستخدمين وتفعيل الحسابات'),
  ('roles.manage',       'تعديل الأدوار والصلاحيات'),
  ('roles.assign',       'تعيين الأدوار للمستخدمين'),
  ('committees.manage',  'إدارة اللجان والأعضاء'),
  ('audit.view',         'عرض سجل النشاطات');

-- مدير النظام: كل الصلاحيات
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.code = 'super_admin';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('dashboard.view_all', 'users.view', 'committees.manage', 'audit.view') where r.code = 'chair';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('dashboard.view_all', 'users.view') where r.code in ('vice_chair', 'secretary');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'dashboard.view_all'
where r.code = 'administration';

insert into public.committees (slug, name_ar, description) values
  ('cleaning',     'لجنة النظافة',  'نظافة المدرسة والمسجد ومرافقهما'),
  ('maintenance',  'لجنة الصيانة',  'متابعة الأعطال وأعمال الإصلاح والصيانة الدورية'),
  ('organization', 'لجنة التنظيم',  'تنظيم الدخول والخروج والفعاليات والمواقف');
