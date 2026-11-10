-- Stages 2–3: committees (extended), tasks, projects, editable lookups, automatic project progress.
-- Same principles as stage 1: RLS + triggers enforce rules, soft-archive, change history, no hard delete of linked data.

-- ───────── Permissions ─────────
insert into public.permissions (code, description_ar) values
  ('committees.view',          'عرض اللجان'),
  ('tasks.view',               'عرض المهام'),
  ('tasks.manage',             'إدارة جميع المهام'),
  ('tasks.manage_committee',   'إدارة مهام اللجنة الفرعية التي يرأسها فقط'),
  ('tasks.update_own',         'تحديث تقدم المهام المسندة إليه'),
  ('tasks.approve',            'اعتماد إنجاز المهام'),
  ('projects.view',            'عرض المشاريع'),
  ('projects.manage',          'إدارة جميع المشاريع'),
  ('projects.manage_committee','إدارة مشاريع اللجنة الفرعية التي يرأسها فقط'),
  ('projects.delete',          'حذف مشروع لا ترتبط به مهام')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'super_admin' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','tasks.manage','tasks.update_own','tasks.approve','projects.view','projects.manage','projects.delete')
where r.code = 'chair' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','tasks.manage','tasks.update_own','tasks.approve','projects.view','projects.manage')
where r.code = 'vice_chair' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','tasks.manage','tasks.update_own','projects.view','projects.manage')
where r.code = 'secretary' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','tasks.manage_committee','tasks.update_own','projects.view','projects.manage_committee')
where r.code = 'sub_head' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','tasks.update_own','projects.view')
where r.code = 'member' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('committees.view','tasks.view','projects.view')
where r.code = 'administration' on conflict do nothing;

-- ───────── Committees: duties text ─────────
alter table public.committees add column if not exists duties text;

-- ───────── Editable lookups ─────────
create table public.task_priorities (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger task_priorities_updated_at before update on public.task_priorities
  for each row execute function public.set_updated_at();
create trigger project_categories_updated_at before update on public.project_categories
  for each row execute function public.set_updated_at();

-- ───────── Projects ─────────
create table public.projects (
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
create index projects_committee_idx on public.projects (committee_id);
create index projects_status_idx on public.projects (status) where archived_at is null;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) > 0),
  details text,
  is_met boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_goals_project_idx on public.project_goals (project_id, position);
create trigger project_goals_updated_at before update on public.project_goals
  for each row execute function public.set_updated_at();

create table public.project_milestones (
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
create index project_milestones_project_idx on public.project_milestones (project_id, position);
create trigger project_milestones_updated_at before update on public.project_milestones
  for each row execute function public.set_updated_at();

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index project_notes_project_idx on public.project_notes (project_id, created_at desc);

create table public.project_progress_snapshots (
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_date date not null,
  progress numeric(5, 1) not null,
  primary key (project_id, snapshot_date)
);

-- ───────── Tasks ─────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  committee_id uuid references public.committees(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  priority_id uuid references public.task_priorities(id) on delete set null,
  start_date date,
  due_date date,
  status text not null default 'new'
    check (status in ('new', 'not_started', 'in_progress', 'on_hold', 'awaiting_approval', 'completed', 'cancelled')),
  progress int not null default 0 check (progress between 0 and 100),
  weight numeric(6, 2) not null default 0 check (weight >= 0 and weight <= 100),  -- share of the project, in %
  last_update_note text,                                                          -- copied to the progress log by trigger
  completion_approved_at timestamptz,
  completion_approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_committee_idx on public.tasks (committee_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_due_idx on public.tasks (due_date) where archived_at is null;
create index tasks_status_idx on public.tasks (status) where archived_at is null;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- share_pct: responsibility share, so a shared task is not counted in full for every member (used by scoring later).
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_pct numeric(5, 2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_progress_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  old_progress int, new_progress int,
  old_status text, new_status text,
  note text,
  created_at timestamptz not null default now()
);
create index task_progress_updates_task_idx on public.task_progress_updates (task_id, created_at desc);

-- ───────── Helper functions ─────────
create or replace function public.task_effective_progress(p_status text, p_progress int)
returns numeric language sql immutable as $$
  -- completed (approved) = 100; submitted-but-unapproved never counts as fully done; cancelled is excluded by callers.
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

-- ───────── Automatic project progress ─────────
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

-- ───────── Triggers ─────────
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
create trigger tasks_project_sync after insert or update or delete on public.tasks
  for each row execute function public.task_project_sync();

-- A weight distribution can only be approved when it totals exactly 100%.
create or replace function public.guard_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.weights_approved_at is not null and old.weights_approved_at is null then
    if (select coalesce(sum(weight), 0) from public.tasks
        where project_id = new.id and status <> 'cancelled' and archived_at is null) <> 100 then
      raise exception 'مجموع أوزان المهام يجب أن يساوي 100% قبل اعتماد التوزيع';
    end if;
    new.weights_approved_by := auth.uid();
  end if;
  return new;
end $$;
create trigger projects_guard before update on public.projects
  for each row execute function public.guard_project();

create trigger committees_history after insert or update or delete on public.committees
  for each row execute function public.record_change();
create trigger tasks_history after insert or update or delete on public.tasks
  for each row execute function public.record_change();
create trigger projects_history after insert or update or delete on public.projects
  for each row execute function public.record_change();

create trigger tasks_attachments_cleanup after delete on public.tasks
  for each row execute function public.delete_entity_attachments('task');
create trigger projects_attachments_cleanup after delete on public.projects
  for each row execute function public.delete_entity_attachments('project');

-- ───────── Attachments: allow projects and tasks ─────────
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('meeting', 'decision', 'project', 'task'));

drop policy attachments_select on public.attachments;
drop policy attachments_insert on public.attachments;
drop policy attachments_delete on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using ((entity_type = 'meeting'  and public.has_permission('meetings.view'))
      or (entity_type = 'decision' and public.has_permission('decisions.view'))
      or (entity_type = 'project'  and public.has_permission('projects.view'))
      or (entity_type = 'task'     and public.has_permission('tasks.view')));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and (
       (entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
    or (entity_type = 'decision' and public.has_permission('decisions.manage'))
    or (entity_type = 'project'  and public.can_manage_project(entity_id))
    or (entity_type = 'task'     and (public.can_manage_task(entity_id) or public.is_task_assignee(entity_id)))));
create policy attachments_delete on public.attachments for delete to authenticated
  using ((entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
      or (entity_type = 'decision' and public.has_permission('decisions.manage'))
      or (entity_type = 'project'  and public.can_manage_project(entity_id))
      or (entity_type = 'task'     and public.can_manage_task(entity_id)));

-- ───────── Change history visibility ─────────
drop policy change_history_select on public.change_history;
create policy change_history_select on public.change_history for select to authenticated
  using (public.has_permission('audit.view')
      or (table_name = 'meetings'   and public.has_permission('meetings.manage'))
      or (table_name = 'decisions'  and public.has_permission('decisions.manage'))
      or (table_name = 'committees' and public.has_permission('committees.manage'))
      or (table_name = 'tasks'      and public.has_permission('tasks.manage'))
      or (table_name = 'projects'   and public.has_permission('projects.manage')));

-- ───────── RLS ─────────
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

create policy task_priorities_select on public.task_priorities for select to authenticated using (public.is_active_user());
create policy task_priorities_write on public.task_priorities for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy project_categories_select on public.project_categories for select to authenticated using (public.is_active_user());
create policy project_categories_write on public.project_categories for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

-- committees become readable by everyone with committees.view (members need names in forms)
drop policy committees_select on public.committees;
create policy committees_select on public.committees for select to authenticated using (public.has_permission('committees.view'));

create policy projects_select on public.projects for select to authenticated using (public.has_permission('projects.view'));
create policy projects_insert on public.projects for insert to authenticated
  with check (created_by = auth.uid() and (public.has_permission('projects.manage')
    or (committee_id is not null and public.has_permission('projects.manage_committee') and public.is_committee_head(committee_id))));
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (public.has_permission('projects.manage')
    or (committee_id is not null and public.has_permission('projects.manage_committee') and public.is_committee_head(committee_id)));
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_permission('projects.delete'));

create policy project_goals_select on public.project_goals for select to authenticated using (public.has_permission('projects.view'));
create policy project_goals_write on public.project_goals for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy project_milestones_select on public.project_milestones for select to authenticated using (public.has_permission('projects.view'));
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy project_notes_select on public.project_notes for select to authenticated using (public.has_permission('projects.view'));
create policy project_notes_write on public.project_notes for all to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy project_snapshots_select on public.project_progress_snapshots for select to authenticated using (public.has_permission('projects.view'));

create policy tasks_select on public.tasks for select to authenticated using (public.has_permission('tasks.view'));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and (public.has_permission('tasks.manage')
    or (committee_id is not null and public.has_permission('tasks.manage_committee') and public.is_committee_head(committee_id))));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_task(id) or (public.has_permission('tasks.update_own') and public.is_task_assignee(id)))
  with check (public.has_permission('tasks.manage')
    or (committee_id is not null and public.has_permission('tasks.manage_committee') and public.is_committee_head(committee_id))
    or (public.has_permission('tasks.update_own') and public.is_task_assignee(id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using (status in ('new', 'not_started') and public.can_manage_task(id));

create policy task_assignees_select on public.task_assignees for select to authenticated using (public.has_permission('tasks.view'));
create policy task_assignees_write on public.task_assignees for all to authenticated
  using (public.can_manage_task(task_id)) with check (public.can_manage_task(task_id));
create policy task_progress_select on public.task_progress_updates for select to authenticated using (public.has_permission('tasks.view'));

-- ───────── Reference data (editable in Settings) ─────────
insert into public.task_priorities (name_ar, sort_order) values
  ('منخفضة', 1), ('متوسطة', 2), ('مرتفعة', 3), ('عاجلة', 4);
insert into public.project_categories (name_ar, sort_order) values
  ('تطوير وتحسين', 1), ('صيانة', 2), ('تنظيم وفعاليات', 3);
