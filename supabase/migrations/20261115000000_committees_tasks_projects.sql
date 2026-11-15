-- Stage 2/3 database: committees (extended), tasks, projects, editable lists, committee posts.
-- Written against the REAL production schema (after migrations A and B), not the reference draft.
--
--  * Rebuilds the OLD, EMPTY tasks / task_assignees / task_progress_updates / projects /
--    project_milestones tables in the new shape. It REFUSES (and changes nothing) if any of them
--    holds rows. Re-running it later is safe: the rebuild only happens while the old shape exists.
--  * Keeps migrations A and B untouched: record_change() (writes to audit_logs), is_committee_head(),
--    can_manage_meeting(), member_directory, the decision rules, meetings and attendance.
--  * Existing permission names are kept (tasks.update_assigned, not the draft's tasks.update_own).
--  * Runs as one multi-statement script: any error rolls everything back.

-- ───────── 0. Prerequisites and safe rebuild of the old empty tables ─────────
do $$
declare
  missing text[] := '{}'; f text; t text; n bigint; v_old boolean;
begin
  foreach f in array array['has_permission', 'is_active_user', 'is_super_admin', 'set_updated_at',
                           'record_change', 'delete_entity_attachments', 'is_committee_head', 'can_manage_meeting'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      missing := missing || f;
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'Missing prerequisites (apply migrations A and B first): %', array_to_string(missing, ', ');
  end if;
  if to_regclass('public.attachments') is null or to_regclass('public.committees') is null
     or to_regclass('public.decisions') is null then
    raise exception 'Missing tables attachments / committees / decisions (apply migrations A and B first)';
  end if;

  v_old := to_regclass('public.projects') is not null
           and not exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'projects' and column_name = 'weights_approved_at');
  if v_old then
    foreach t in array array['tasks', 'task_assignees', 'task_progress_updates', 'project_milestones', 'projects'] loop
      if to_regclass('public.' || t) is not null then
        execute format('select count(*) from public.%I', t) into n;
        if n > 0 then
          raise exception 'public.% holds % rows; refusing to rebuild it. Nothing was changed.', t, n;
        end if;
      end if;
    end loop;
    drop table if exists public.task_progress_updates, public.task_assignees, public.tasks,
                         public.project_milestones, public.projects cascade;
    drop function if exists public.project_progress(uuid);   -- replaced by the view below
  end if;
end $$;

-- ───────── 1. Permissions (existing names kept) ─────────
insert into public.permissions (code, description_ar) values
  ('tasks.manage_committee',    'إدارة مهام اللجنة الفرعية التي يرأسها فقط'),
  ('tasks.approve',             'اعتماد إنجاز المهام'),
  ('projects.manage_committee', 'إدارة مشاريع اللجنة الفرعية التي يرأسها فقط'),
  ('projects.delete',           'حذف مشروع لا ترتبط به مهام')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'super_admin' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('tasks.approve', 'projects.delete') where r.code = 'chair' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code = 'tasks.approve' where r.code = 'vice_chair' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('tasks.manage_committee', 'projects.manage_committee') where r.code = 'sub_head' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('tasks.view', 'tasks.update_assigned', 'projects.view') where r.code = 'member' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('tasks.view', 'projects.view') where r.code = 'administration' on conflict do nothing;

-- ───────── 2. Committees: duties text ─────────
alter table public.committees add column if not exists duties text;

-- ───────── 3. Editable lists ─────────
create table if not exists public.task_priorities (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists task_priorities_updated_at on public.task_priorities;
create trigger task_priorities_updated_at before update on public.task_priorities
  for each row execute function public.set_updated_at();
drop trigger if exists project_categories_updated_at on public.project_categories;
create trigger project_categories_updated_at before update on public.project_categories
  for each row execute function public.set_updated_at();

insert into public.task_priorities (name_ar, sort_order) values
  ('منخفضة', 1), ('متوسطة', 2), ('مرتفعة', 3), ('عاجلة', 4)
on conflict (name_ar) do nothing;
insert into public.project_categories (name_ar, sort_order) values
  ('تطوير وتحسين', 1), ('صيانة', 2), ('تنظيم وفعاليات', 3)
on conflict (name_ar) do nothing;

-- ───────── 4. Projects ─────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  objective text,
  committee_id uuid references public.committees(id) on delete restrict,
  owner_id uuid references public.profiles(id) on delete set null,
  category_id uuid references public.project_categories(id) on delete set null,
  priority_id uuid references public.task_priorities(id) on delete set null,
  start_date date,
  end_date date,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  weights_approved_at timestamptz,
  weights_approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists projects_committee_idx on public.projects (committee_id);
create index if not exists projects_status_idx on public.projects (status) where archived_at is null;
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.project_goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) > 0),
  details text,
  is_met boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_goals_project_idx on public.project_goals (project_id, position);
drop trigger if exists project_goals_updated_at on public.project_goals;
create trigger project_goals_updated_at before update on public.project_goals
  for each row execute function public.set_updated_at();

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) > 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_milestones_project_idx on public.project_milestones (project_id, position);
drop trigger if exists project_milestones_updated_at on public.project_milestones;
create trigger project_milestones_updated_at before update on public.project_milestones
  for each row execute function public.set_updated_at();

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists project_notes_project_idx on public.project_notes (project_id, created_at desc);

create table if not exists public.project_progress_snapshots (
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null,
  progress numeric(5, 1) not null,
  primary key (project_id, snapshot_date)
);

-- ───────── 5. Tasks ─────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  committee_id uuid references public.committees(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  decision_id uuid references public.decisions(id) on delete set null,   -- task created from a decision
  priority_id uuid references public.task_priorities(id) on delete set null,
  start_date date,
  due_date date,
  status text not null default 'new'
    check (status in ('new', 'not_started', 'in_progress', 'on_hold', 'awaiting_approval', 'completed', 'cancelled')),
  progress int not null default 0 check (progress between 0 and 100),
  weight numeric(6, 2) not null default 0 check (weight >= 0 and weight <= 100),   -- share of the project, in %
  last_update_note text,                                                           -- copied to the progress log by trigger
  completion_approved_at timestamptz,
  completion_approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index if not exists tasks_committee_idx on public.tasks (committee_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_decision_idx on public.tasks (decision_id);
create index if not exists tasks_due_idx on public.tasks (due_date) where archived_at is null;
create index if not exists tasks_status_idx on public.tasks (status) where archived_at is null;
drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- share_pct: responsibility share, so a shared task is not counted in full for every member.
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_pct numeric(5, 2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id);

create table if not exists public.task_progress_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  old_progress int, new_progress int,
  old_status text, new_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists task_progress_updates_task_idx on public.task_progress_updates (task_id, created_at desc);

-- ───────── 6. Committee communication ─────────
create table if not exists public.committee_posts (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null check (kind in ('directive', 'report', 'note')),
  title text,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists committee_posts_committee_idx on public.committee_posts (committee_id, created_at desc);

-- ───────── 7. Helper functions ─────────
create or replace function public.task_effective_progress(p_status text, p_progress int)
returns numeric language sql immutable as $$
  -- approved completion = 100; submitted-but-unapproved never counts as fully done; cancelled is excluded by callers.
  select (case p_status when 'completed' then 100 when 'awaiting_approval' then least(p_progress, 99) else p_progress end)::numeric;
$$;

create or replace function public.can_manage_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task and (
    public.has_permission('tasks.manage')
    or (t.committee_id is not null and public.has_permission('tasks.manage_committee')
        and public.is_committee_head(t.committee_id))));
$$;

create or replace function public.can_approve_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task and (
    public.has_permission('tasks.approve')
    or (t.committee_id is not null and public.has_permission('tasks.manage_committee')
        and public.is_committee_head(t.committee_id))));
$$;

create or replace function public.is_task_assignee(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.task_assignees where task_id = p_task and user_id = auth.uid());
$$;

create or replace function public.can_manage_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project and (
    public.has_permission('projects.manage')
    or (p.committee_id is not null and public.has_permission('projects.manage_committee')
        and public.is_committee_head(p.committee_id))));
$$;

revoke all on function public.can_manage_task(uuid), public.can_approve_task(uuid),
  public.is_task_assignee(uuid), public.can_manage_project(uuid) from public, anon;
grant execute on function public.can_manage_task(uuid), public.can_approve_task(uuid),
  public.is_task_assignee(uuid), public.can_manage_project(uuid) to authenticated;

-- ───────── 8. Automatic project progress ─────────
-- progress = Σ(weight × effective task progress) ÷ Σ(weights) over non-cancelled, non-archived tasks.
-- If no weights were set (all 0) every task counts equally and is_default_distribution = true.
create or replace view public.project_progress with (security_invoker = true) as
select
  p.id as project_id,
  count(t.id)::int as task_count,
  coalesce(sum(t.weight), 0) as weights_total,
  case
    when count(t.id) = 0 then 0
    when coalesce(sum(t.weight), 0) > 0 then round(sum(t.weight * t.eff) / sum(t.weight), 1)
    else round(avg(t.eff), 1)
  end as progress,
  (count(t.id) > 0 and coalesce(sum(t.weight), 0) = 0) as is_default_distribution
from public.projects p
left join lateral (
  select tk.weight, public.task_effective_progress(tk.status, tk.progress) as eff, tk.id
  from public.tasks tk
  where tk.project_id = p.id and tk.status <> 'cancelled' and tk.archived_at is null
) t on true
group by p.id;
grant select on public.project_progress to authenticated;
revoke all on public.project_progress from anon, public;

-- ───────── 9. Triggers ─────────
create or replace function public.guard_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_manager boolean := false; v_approver boolean := false;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.status in ('completed', 'awaiting_approval', 'cancelled') then
      raise exception 'لا تُنشأ المهمة مكتملة أو ملغاة';
    end if;
    return new;
  end if;

  if auth.uid() is not null then
    v_manager := public.can_manage_task(old.id);
    v_approver := public.can_approve_task(old.id);

    if not v_manager then
      -- assignees may only report progress / status / a note
      if not public.is_task_assignee(old.id) then
        raise exception 'ليست لديك صلاحية على هذه المهمة';
      end if;
      if (to_jsonb(new) - 'progress' - 'status' - 'last_update_note' - 'updated_at' - 'completion_approved_at' - 'completion_approved_by')
         is distinct from
         (to_jsonb(old) - 'progress' - 'status' - 'last_update_note' - 'updated_at' - 'completion_approved_at' - 'completion_approved_by') then
        raise exception 'لا تملك صلاحية تعديل بيانات المهمة؛ يمكنك تحديث التقدم فقط';
      end if;
      if new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
        raise exception 'اعتماد الإنجاز أو الإلغاء ليس من صلاحيتك';
      end if;
      if old.status in ('completed', 'cancelled')
         and (new.progress is distinct from old.progress or new.status is distinct from old.status) then
        raise exception 'المهمة مغلقة ولا يمكن تحديثها';
      end if;
    end if;
  end if;

  -- 100% from the doer means "submitted", not "done"
  if new.progress = 100 and new.status in ('new', 'not_started', 'in_progress', 'on_hold') then
    new.status := 'awaiting_approval';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    if auth.uid() is not null then
      if not v_approver then raise exception 'اعتماد الإنجاز يتطلب صلاحية الاعتماد'; end if;
      if exists (select 1 from public.task_assignees where task_id = old.id and user_id = auth.uid())
         and not public.is_super_admin() then
        raise exception 'لا يمكنك اعتماد إنجاز مهمة أنت مكلّف بها';
      end if;
      new.completion_approved_by := auth.uid();
    end if;
    new.progress := 100;
    new.completion_approved_at := now();
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    if auth.uid() is not null and not v_approver then
      raise exception 'إعادة فتح مهمة معتمدة تتطلب صلاحية الاعتماد';
    end if;
    new.completion_approved_at := null;
    new.completion_approved_by := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.guard_task();

create or replace function public.log_task_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.progress is distinct from old.progress or new.status is distinct from old.status then
    insert into public.task_progress_updates (task_id, user_id, old_progress, new_progress, old_status, new_status, note)
    values (new.id, auth.uid(), old.progress, new.progress, old.status, new.status, new.last_update_note);
  end if;
  return null;
end $$;
drop trigger if exists tasks_progress_log on public.tasks;
create trigger tasks_progress_log after update on public.tasks
  for each row execute function public.log_task_progress();

-- Keep the project in sync: withdraw weight approval when the distribution changes, snapshot progress daily.
create or replace function public.task_project_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_new uuid; v uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.project_id; end if;
  if tg_op <> 'DELETE' then v_new := new.project_id; end if;

  if tg_op in ('INSERT', 'DELETE')
     or new.weight is distinct from old.weight
     or new.project_id is distinct from old.project_id
     or (new.status = 'cancelled') is distinct from (old.status = 'cancelled')
     or (new.archived_at is null) is distinct from (old.archived_at is null) then
    update public.projects set weights_approved_at = null, weights_approved_by = null
    where id in (v_old, v_new) and weights_approved_at is not null;
  end if;

  foreach v in array array[v_old, v_new] loop
    if v is not null then
      insert into public.project_progress_snapshots (project_id, snapshot_date, progress)
      select project_id, current_date, progress from public.project_progress where project_id = v
      on conflict (project_id, snapshot_date) do update set progress = excluded.progress;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists tasks_project_sync on public.tasks;
create trigger tasks_project_sync after insert or update or delete on public.tasks
  for each row execute function public.task_project_sync();

-- A weight distribution can only be approved when it totals exactly 100%.
create or replace function public.guard_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.weights_approved_at is not null and old.weights_approved_at is null then
    if (select coalesce(sum(weight), 0) from public.tasks
        where project_id = new.id and status <> 'cancelled' and archived_at is null) <> 100 then
      raise exception 'مجموع أوزان المهام يجب أن يساوي 100%% قبل اعتماد التوزيع';
    end if;
    new.weights_approved_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists projects_guard on public.projects;
create trigger projects_guard before update on public.projects
  for each row execute function public.guard_project();

-- Change history goes to audit_logs through record_change() from migration B.
drop trigger if exists committees_history on public.committees;
create trigger committees_history after insert or update or delete on public.committees
  for each row execute function public.record_change();
drop trigger if exists tasks_history on public.tasks;
create trigger tasks_history after insert or update or delete on public.tasks
  for each row execute function public.record_change();
drop trigger if exists projects_history on public.projects;
create trigger projects_history after insert or update or delete on public.projects
  for each row execute function public.record_change();

drop trigger if exists tasks_attachments_cleanup on public.tasks;
create trigger tasks_attachments_cleanup after delete on public.tasks
  for each row execute function public.delete_entity_attachments('task');
drop trigger if exists projects_attachments_cleanup on public.projects;
create trigger projects_attachments_cleanup after delete on public.projects
  for each row execute function public.delete_entity_attachments('project');

-- ───────── 10. Attachments: allow projects and tasks (meeting/decision rules from B are kept) ─────────
alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('meeting', 'decision', 'project', 'task'));

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using ((entity_type = 'meeting'  and (public.has_permission('meetings.view')  or public.has_permission('meetings.manage')))
      or (entity_type = 'decision' and (public.has_permission('decisions.view') or public.has_permission('decisions.manage')))
      or (entity_type = 'project'  and (public.has_permission('projects.view')  or public.has_permission('projects.manage')))
      or (entity_type = 'task'     and (public.has_permission('tasks.view') or public.has_permission('tasks.manage')
                                        or public.is_task_assignee(entity_id))));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and (
       (entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
    or (entity_type = 'decision' and public.has_permission('decisions.manage'))
    or (entity_type = 'project'  and public.can_manage_project(entity_id))
    or (entity_type = 'task'     and (public.can_manage_task(entity_id) or public.is_task_assignee(entity_id)))));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using ((entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
      or (entity_type = 'decision' and public.has_permission('decisions.manage'))
      or (entity_type = 'project'  and public.can_manage_project(entity_id))
      or (entity_type = 'task'     and public.can_manage_task(entity_id)));

-- History of every module is readable by whoever manages that module (audit.view still sees all).
drop policy if exists audit_logs_entity_select on public.audit_logs;
create policy audit_logs_entity_select on public.audit_logs for select to authenticated
  using ((entity_type = 'meetings'   and (public.has_permission('meetings.manage') or public.can_manage_meeting(entity_id)))
      or (entity_type = 'decisions'  and public.has_permission('decisions.manage'))
      or (entity_type = 'committees' and public.has_permission('committees.manage'))
      or (entity_type = 'tasks'      and (public.has_permission('tasks.manage') or public.can_manage_task(entity_id)))
      or (entity_type = 'projects'   and (public.has_permission('projects.manage') or public.can_manage_project(entity_id))));

-- ───────── 11. Row level security ─────────
alter table public.task_priorities enable row level security;
alter table public.project_categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_goals enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_notes enable row level security;
alter table public.project_progress_snapshots enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_progress_updates enable row level security;
alter table public.committee_posts enable row level security;

drop policy if exists task_priorities_select on public.task_priorities;
create policy task_priorities_select on public.task_priorities for select to authenticated using (public.is_active_user());
drop policy if exists task_priorities_write on public.task_priorities;
create policy task_priorities_write on public.task_priorities for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
drop policy if exists project_categories_select on public.project_categories;
create policy project_categories_select on public.project_categories for select to authenticated using (public.is_active_user());
drop policy if exists project_categories_write on public.project_categories;
create policy project_categories_write on public.project_categories for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.has_permission('projects.view') or public.has_permission('projects.manage'));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = auth.uid() and (public.has_permission('projects.manage')
    or (committee_id is not null and public.has_permission('projects.manage_committee') and public.is_committee_head(committee_id))));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (public.has_permission('projects.manage')
    or (committee_id is not null and public.has_permission('projects.manage_committee') and public.is_committee_head(committee_id)));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_permission('projects.delete'));

drop policy if exists project_goals_select on public.project_goals;
create policy project_goals_select on public.project_goals for select to authenticated
  using (public.has_permission('projects.view') or public.has_permission('projects.manage'));
drop policy if exists project_goals_write on public.project_goals;
create policy project_goals_write on public.project_goals for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
drop policy if exists project_milestones_select on public.project_milestones;
create policy project_milestones_select on public.project_milestones for select to authenticated
  using (public.has_permission('projects.view') or public.has_permission('projects.manage'));
drop policy if exists project_milestones_write on public.project_milestones;
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
drop policy if exists project_notes_select on public.project_notes;
create policy project_notes_select on public.project_notes for select to authenticated
  using (public.has_permission('projects.view') or public.has_permission('projects.manage'));
drop policy if exists project_notes_write on public.project_notes;
create policy project_notes_write on public.project_notes for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
drop policy if exists project_snapshots_select on public.project_progress_snapshots;
create policy project_snapshots_select on public.project_progress_snapshots for select to authenticated
  using (public.has_permission('projects.view') or public.has_permission('projects.manage'));

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.has_permission('tasks.view') or public.has_permission('tasks.manage') or public.is_task_assignee(id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and (public.has_permission('tasks.manage')
    or (committee_id is not null and public.has_permission('tasks.manage_committee') and public.is_committee_head(committee_id))));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_task(id) or (public.has_permission('tasks.update_assigned') and public.is_task_assignee(id)))
  with check (public.has_permission('tasks.manage')
    or (committee_id is not null and public.has_permission('tasks.manage_committee') and public.is_committee_head(committee_id))
    or (public.has_permission('tasks.update_assigned') and public.is_task_assignee(id)));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (status in ('new', 'not_started') and public.can_manage_task(id));

drop policy if exists task_assignees_select on public.task_assignees;
create policy task_assignees_select on public.task_assignees for select to authenticated
  using (public.has_permission('tasks.view') or public.has_permission('tasks.manage') or user_id = auth.uid());
drop policy if exists task_assignees_write on public.task_assignees;
create policy task_assignees_write on public.task_assignees for all to authenticated
  using (public.can_manage_task(task_id)) with check (public.can_manage_task(task_id));
drop policy if exists task_progress_select on public.task_progress_updates;
create policy task_progress_select on public.task_progress_updates for select to authenticated
  using (public.has_permission('tasks.view') or public.has_permission('tasks.manage') or public.is_task_assignee(task_id));

-- Committee posts: directives come from whoever manages committees; reports/notes also from the committee's head.
drop policy if exists committee_posts_select on public.committee_posts;
create policy committee_posts_select on public.committee_posts for select to authenticated using (public.is_active_user());
drop policy if exists committee_posts_insert on public.committee_posts;
create policy committee_posts_insert on public.committee_posts for insert to authenticated
  with check (author_id = auth.uid() and (
       (kind = 'directive' and public.has_permission('committees.manage'))
    or (kind in ('report', 'note')
        and (public.has_permission('committees.manage') or public.is_committee_head(committee_id)))));
drop policy if exists committee_posts_delete on public.committee_posts;
create policy committee_posts_delete on public.committee_posts for delete to authenticated
  using (public.has_permission('committees.manage') or author_id = auth.uid());
