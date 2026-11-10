-- Phase 2: permission helpers, privilege-escalation guards, committee head sync.

-- Permissions of the current user, in one round trip (used by the app shell and server actions).
create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.code), '{}'::text[])
  from public.profiles pr
  join public.user_roles ur on ur.user_id = pr.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where pr.id = auth.uid() and pr.is_active;
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.id
    join public.roles r on r.id = ur.role_id
    where pr.id = auth.uid() and pr.is_active and r.code = 'super_admin'
  );
$$;

revoke all on function public.my_permissions() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

alter table public.user_roles alter column assigned_by set default auth.uid();

-- Role-assignment guard:
--  * nobody can change their own roles;
--  * only a super admin can grant or revoke the super_admin role;
--  * the last super admin cannot be removed.
-- Calls without a JWT user (SQL editor / migrations / bootstrap) are allowed.
create or replace function public.guard_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_role uuid;
  v_code text;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id; v_role := old.role_id;
  else
    v_user := new.user_id; v_role := new.role_id;
  end if;

  if auth.uid() is not null then
    if v_user = auth.uid() then
      raise exception 'لا يمكنك تعديل أدوارك بنفسك';
    end if;
    select code into v_code from public.roles where id = v_role;
    if v_code = 'super_admin' and not public.is_super_admin() then
      raise exception 'منح دور مدير النظام أو سحبه من صلاحيات مدير النظام وحده';
    end if;
  end if;

  if tg_op = 'DELETE' then
    select code into v_code from public.roles where id = v_role;
    if v_code = 'super_admin'
       and (select count(*) from public.user_roles ur
            join public.roles r on r.id = ur.role_id where r.code = 'super_admin') <= 1 then
      raise exception 'لا يمكن سحب دور مدير النظام من آخر مدير';
    end if;
    return old;
  end if;
  return new;
end $$;

create trigger user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- One head per committee; committees.head_id mirrors committee_members.
create unique index committee_members_one_head
  on public.committee_members (committee_id) where member_role = 'head';

create or replace function public.sync_committee_head()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_committee uuid;
begin
  if tg_op = 'DELETE' then v_committee := old.committee_id; else v_committee := new.committee_id; end if;
  update public.committees c
     set head_id = (select m.user_id from public.committee_members m
                    where m.committee_id = c.id and m.member_role = 'head' limit 1)
   where c.id = v_committee;
  return null;
end $$;

create trigger committee_members_sync_head
  after insert or update or delete on public.committee_members
  for each row execute function public.sync_committee_head();
