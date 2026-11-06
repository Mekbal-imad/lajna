-- المرحلة 3: الاجتماعات والقرارات والمهام والمشاريع وقياس الأداء
-- جميع الجداول مرتبطة بالمستخدمين واللجان الحالية، مع صلاحيات مستقلة وRLS.

insert into public.permissions(code, description_ar) values
 ('meetings.view','عرض الاجتماعات'),('meetings.manage','إدارة الاجتماعات'),
 ('decisions.view','عرض القرارات'),('decisions.manage','إدارة القرارات'),
 ('tasks.view','عرض المهام'),('tasks.manage','إدارة المهام'),('tasks.update_assigned','تحديث المهام المسندة'),
 ('projects.view','عرض المشاريع'),('projects.manage','إدارة المشاريع'),
 ('performance.view','عرض تقييم الأعضاء'),('performance.manage','إدارة تقييم الأعضاء')
on conflict (code) do nothing;

-- الأدوار الإدارية الحالية تحصل على صلاحيات الإدارة التشغيلية، وتظل قابلة للتخصيص من واجهة الأدوار.
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('super_admin','chair','vice_chair','secretary')
 and p.code in ('meetings.view','meetings.manage','decisions.view','decisions.manage','tasks.view','tasks.manage','projects.view','projects.manage','performance.view','performance.manage')
on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('sub_head') and p.code in ('meetings.view','decisions.view','tasks.view','tasks.update_assigned','projects.view','performance.view')
on conflict do nothing;

create table public.meetings (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 3 and 180),
 meeting_type text not null default 'regular', status text not null default 'draft' check(status in ('draft','scheduled','held','completed','cancelled')),
 starts_at timestamptz not null, location text, description text, created_by uuid not null references public.profiles(id),
 minutes text, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.meeting_attendees (
 meeting_id uuid not null references public.meetings(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete restrict,
 invited boolean not null default true,
 attendance_status text not null default 'invited' check(attendance_status in ('present','absent','excused','late','invited')),
 notes text, primary key(meeting_id,user_id)
);
create table public.agenda_items (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.meetings(id) on delete cascade,
 title text not null check(length(trim(title))>0), details text, position integer not null default 0,
 discussion_notes text, created_at timestamptz not null default now()
);
create table public.decisions (
 id uuid primary key default gen_random_uuid(), decision_no bigint generated always as identity unique,
 meeting_id uuid references public.meetings(id) on delete set null,
 title text not null check(length(trim(title)) between 3 and 180), body text not null,
 status text not null default 'proposed' check(status in ('proposed','approved','in_progress','completed','postponed','cancelled')),
 committee_id uuid references public.committees(id) on delete set null,
 assignee_id uuid references public.profiles(id) on delete set null,
 due_date date, approved_at timestamptz, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 3 and 180),
 description text, committee_id uuid references public.committees(id) on delete set null,
 project_id uuid, decision_id uuid references public.decisions(id) on delete set null,
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
 status text not null default 'new' check(status in ('new','todo','in_progress','blocked','completed','cancelled')),
 progress numeric(5,2) not null default 0 check(progress between 0 and 100),
 due_date date, starts_on date, weight numeric(8,2) not null default 1 check(weight > 0),
 created_by uuid not null references public.profiles(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.task_assignees (
 task_id uuid not null references public.tasks(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete restrict,
 responsibility_weight numeric(5,2) not null default 100 check(responsibility_weight > 0 and responsibility_weight <= 100),
 primary key(task_id,user_id)
);
create table public.task_progress_updates (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
 old_progress numeric(5,2) not null, new_progress numeric(5,2) not null check(new_progress between 0 and 100),
 note text, submitted_by uuid not null references public.profiles(id), reviewed_by uuid references public.profiles(id),
 approved boolean not null default false, created_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 3 and 180),
 description text, objectives text, committee_id uuid references public.committees(id) on delete set null,
 manager_id uuid references public.profiles(id) on delete set null,
 starts_on date, ends_on date, budget numeric(14,2) check(budget is null or budget >= 0),
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
 status text not null default 'planning' check(status in ('planning','active','on_hold','completed','cancelled','archived')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_on is null or starts_on is null or ends_on >= starts_on)
);
alter table public.tasks add constraint tasks_project_fk foreign key(project_id) references public.projects(id) on delete set null;
create table public.project_milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 title text not null, description text, due_date date, position integer not null default 0,
 status text not null default 'pending' check(status in ('pending','in_progress','completed','cancelled')),
 created_at timestamptz not null default now()
);
create table public.performance_settings (
 id boolean primary key default true check(id), attendance_weight numeric(5,2) not null default 30 check(attendance_weight between 0 and 100),
 participation_weight numeric(5,2) not null default 20 check(participation_weight between 0 and 100),
 tasks_weight numeric(5,2) not null default 50 check(tasks_weight between 0 and 100), updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
 check(attendance_weight + participation_weight + tasks_weight = 100)
);
insert into public.performance_settings(id) values(true) on conflict do nothing;
create table public.meeting_participation_scores (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null, user_id uuid not null,
 score smallint not null check(score between 0 and 5), note text not null,
 scored_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(meeting_id,user_id), foreign key(meeting_id,user_id) references public.meeting_attendees(meeting_id,user_id) on delete cascade
);
create table public.performance_snapshots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 period_start date not null, period_end date not null, attendance_score numeric(5,2) not null,
 participation_score numeric(5,2) not null, tasks_score numeric(5,2) not null, total_score numeric(5,2) not null,
 metrics jsonb not null default '{}'::jsonb, calculated_at timestamptz not null default now(),
 unique(user_id,period_start,period_end), check(period_end >= period_start)
);

create index meetings_starts_idx on public.meetings(starts_at desc);
create index decisions_status_idx on public.decisions(status,created_at desc);
create index tasks_status_due_idx on public.tasks(status,due_date);
create index tasks_project_idx on public.tasks(project_id);
create index projects_status_idx on public.projects(status,starts_on);
create index performance_user_period_idx on public.performance_snapshots(user_id,period_start desc);

create trigger meetings_updated before update on public.meetings for each row execute function public.set_updated_at();
create trigger decisions_updated before update on public.decisions for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();

-- يحسب تقدم المشروع تلقائيًا من متوسط المهام المرجح، ولا يسمح بتعيين نسبة مستقلة للمشروع.
create or replace function public.project_progress(p_project uuid)
returns numeric language sql stable security invoker set search_path=public as $$
 select coalesce(round(sum(t.progress*t.weight)/nullif(sum(t.weight),0),2),0)
 from public.tasks t where t.project_id=p_project and t.status <> 'cancelled';
$$;

-- RLS: القراءة والكتابة حسب الصلاحيات. إدارة التقييمات منفصلة.
do $$ declare tbl text; begin
 foreach tbl in array array['meetings','meeting_attendees','agenda_items','decisions','tasks','task_assignees','task_progress_updates','projects','project_milestones','performance_settings','meeting_participation_scores','performance_snapshots'] loop
  execute format('alter table public.%I enable row level security',tbl);
 end loop;
end $$;
create policy meetings_read on public.meetings for select to authenticated using(public.has_permission('meetings.view') or public.has_permission('meetings.manage'));
create policy meetings_write on public.meetings for all to authenticated using(public.has_permission('meetings.manage')) with check(public.has_permission('meetings.manage'));
create policy attendees_read on public.meeting_attendees for select to authenticated using(public.has_permission('meetings.view') or public.has_permission('meetings.manage'));
create policy attendees_write on public.meeting_attendees for all to authenticated using(public.has_permission('meetings.manage')) with check(public.has_permission('meetings.manage'));
create policy agenda_read on public.agenda_items for select to authenticated using(public.has_permission('meetings.view') or public.has_permission('meetings.manage'));
create policy agenda_write on public.agenda_items for all to authenticated using(public.has_permission('meetings.manage')) with check(public.has_permission('meetings.manage'));
create policy decisions_read on public.decisions for select to authenticated using(public.has_permission('decisions.view') or public.has_permission('decisions.manage'));
create policy decisions_write on public.decisions for all to authenticated using(public.has_permission('decisions.manage')) with check(public.has_permission('decisions.manage'));
create policy tasks_read on public.tasks for select to authenticated using(public.has_permission('tasks.view') or public.has_permission('tasks.manage') or exists(select 1 from public.task_assignees a where a.task_id=id and a.user_id=auth.uid()));
create policy tasks_manage on public.tasks for all to authenticated using(public.has_permission('tasks.manage')) with check(public.has_permission('tasks.manage'));
create policy tasks_assigned_update on public.tasks for update to authenticated using(public.has_permission('tasks.update_assigned') and exists(select 1 from public.task_assignees a where a.task_id=id and a.user_id=auth.uid())) with check(public.has_permission('tasks.update_assigned') and exists(select 1 from public.task_assignees a where a.task_id=id and a.user_id=auth.uid()));
create policy task_assignees_read on public.task_assignees for select to authenticated using(public.has_permission('tasks.view') or public.has_permission('tasks.manage') or user_id=auth.uid());
create policy task_assignees_write on public.task_assignees for all to authenticated using(public.has_permission('tasks.manage')) with check(public.has_permission('tasks.manage'));
create policy task_updates_read on public.task_progress_updates for select to authenticated using(public.has_permission('tasks.view') or public.has_permission('tasks.manage') or submitted_by=auth.uid());
create policy task_updates_insert on public.task_progress_updates for insert to authenticated with check(submitted_by=auth.uid() and (public.has_permission('tasks.update_assigned') or public.has_permission('tasks.manage')));
create policy projects_read on public.projects for select to authenticated using(public.has_permission('projects.view') or public.has_permission('projects.manage'));
create policy projects_write on public.projects for all to authenticated using(public.has_permission('projects.manage')) with check(public.has_permission('projects.manage'));
create policy milestones_read on public.project_milestones for select to authenticated using(public.has_permission('projects.view') or public.has_permission('projects.manage'));
create policy milestones_write on public.project_milestones for all to authenticated using(public.has_permission('projects.manage')) with check(public.has_permission('projects.manage'));
create policy perf_settings_read on public.performance_settings for select to authenticated using(public.has_permission('performance.view') or public.has_permission('performance.manage'));
create policy perf_settings_write on public.performance_settings for all to authenticated using(public.has_permission('performance.manage')) with check(public.has_permission('performance.manage'));
create policy participation_read on public.meeting_participation_scores for select to authenticated using(public.has_permission('performance.view') or public.has_permission('performance.manage'));
create policy participation_write on public.meeting_participation_scores for all to authenticated using(public.has_permission('performance.manage')) with check(public.has_permission('performance.manage'));
create policy snapshots_read on public.performance_snapshots for select to authenticated using(public.has_permission('performance.view') or public.has_permission('performance.manage') or user_id=auth.uid());
create policy snapshots_write on public.performance_snapshots for all to authenticated using(public.has_permission('performance.manage')) with check(public.has_permission('performance.manage'));

grant select,insert,update,delete on public.meetings,public.meeting_attendees,public.agenda_items,public.decisions,public.tasks,public.task_assignees,public.task_progress_updates,public.projects,public.project_milestones,public.performance_settings,public.meeting_participation_scores,public.performance_snapshots to authenticated;
grant usage,select on all sequences in schema public to authenticated;
