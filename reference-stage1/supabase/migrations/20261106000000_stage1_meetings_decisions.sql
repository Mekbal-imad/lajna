-- Stage 1: meetings, agenda, attendance, minutes, decisions, attachments, change history.
-- Principles: everything editable from the UI, permissions enforced here (RLS + triggers),
-- no hard delete of meaningful records (archive instead), every important change is recorded.

-- ───────── Permissions ─────────
insert into public.permissions (code, description_ar) values
  ('meetings.view',             'عرض الاجتماعات'),
  ('meetings.manage',           'إدارة جميع الاجتماعات (إنشاء وتعديل وأرشفة وحضور ومحاضر)'),
  ('meetings.manage_committee', 'إدارة اجتماعات اللجنة الفرعية التي يرأسها فقط'),
  ('meetings.delete',           'حذف اجتماع مجدول أو ملغى'),
  ('decisions.view',            'عرض القرارات'),
  ('decisions.manage',          'إنشاء القرارات وتعديلها وأرشفتها'),
  ('decisions.approve',         'اعتماد القرارات'),
  ('settings.manage',           'تعديل إعدادات المنصة (أنواع الاجتماعات وغيرها)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'super_admin' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('meetings.view','meetings.manage','meetings.delete','decisions.view','decisions.manage','decisions.approve','settings.manage')
where r.code = 'chair' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('meetings.view','meetings.manage','decisions.view','decisions.manage')
where r.code in ('vice_chair','secretary') on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in
  ('meetings.view','meetings.manage_committee','decisions.view')
where r.code = 'sub_head' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in ('meetings.view','decisions.view')
where r.code in ('member','administration') on conflict do nothing;

-- ───────── Helpers ─────────
create or replace function public.is_committee_head(p_committee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.committee_members
    where committee_id = p_committee and user_id = auth.uid() and member_role = 'head');
$$;

-- Names only (no phone) so every signed-in member can see who attended; profiles stays restricted.
create or replace view public.member_directory as
  select id, full_name, is_active from public.profiles;

-- ───────── Tables ─────────
create table public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger meeting_types_updated_at before update on public.meeting_types
  for each row execute function public.set_updated_at();

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  meeting_type_id uuid references public.meeting_types(id) on delete set null,
  committee_id uuid references public.committees(id) on delete restrict,  -- null = whole committee
  scheduled_at timestamptz not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled')),
  minutes text,
  minutes_approved_at timestamptz,
  minutes_approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_scheduled_idx on public.meetings (scheduled_at desc);
create index meetings_committee_idx on public.meetings (committee_id);
create index meetings_status_idx on public.meetings (status) where archived_at is null;
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) > 0),
  discussion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agenda_items_meeting_idx on public.agenda_items (meeting_id, position);
create trigger agenda_items_updated_at before update on public.agenda_items
  for each row execute function public.set_updated_at();

-- A row = the member was invited. status 'pending' = attendance not recorded yet.
create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'present', 'late', 'excused', 'absent')),
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index meeting_attendees_user_idx on public.meeting_attendees (user_id);

create table public.decision_counters (
  year int primary key,
  last_no int not null default 0
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  title text not null check (length(trim(title)) > 0),
  details text,
  meeting_id uuid references public.meetings(id) on delete restrict,
  decided_on date not null default current_date,
  committee_id uuid references public.committees(id) on delete set null,  -- responsible body
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'in_progress', 'executed', 'postponed', 'cancelled')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= decided_on)
);
create index decisions_meeting_idx on public.decisions (meeting_id);
create index decisions_status_idx on public.decisions (status) where archived_at is null;
create trigger decisions_updated_at before update on public.decisions
  for each row execute function public.set_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('meeting', 'decision')),
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 4194304),
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

create table public.change_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index change_history_row_idx on public.change_history (table_name, row_id, changed_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 4194304)
on conflict (id) do nothing;
-- No storage.objects policies on purpose: files are reached only through server code
-- (authorised via the attachments table), never directly from the browser.

-- ───────── Functions & triggers ─────────
create or replace function public.can_manage_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting
      and (public.has_permission('meetings.manage')
           or (m.committee_id is not null
               and public.has_permission('meetings.manage_committee')
               and public.is_committee_head(m.committee_id)))
  );
$$;
revoke all on function public.is_committee_head(uuid) from public, anon;
revoke all on function public.can_manage_meeting(uuid) from public, anon;
grant execute on function public.is_committee_head(uuid) to authenticated;
grant execute on function public.can_manage_meeting(uuid) to authenticated;

-- Generic row history (who / when / before / after).
create or replace function public.record_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.change_history (table_name, row_id, op, changed_by, old_data, new_data)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'))::uuid,
    tg_op, auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger meetings_history after insert or update or delete on public.meetings
  for each row execute function public.record_change();
create trigger decisions_history after insert or update or delete on public.decisions
  for each row execute function public.record_change();

-- Meeting guards: approved minutes are locked; held/approved meetings cannot be deleted.
create or replace function public.guard_meeting()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'held' or old.minutes_approved_at is not null then
      raise exception 'لا يمكن حذف اجتماع منعقد أو محضره معتمد؛ استخدم الأرشفة';
    end if;
    return old;
  end if;
  if old.minutes_approved_at is not null and new.minutes_approved_at is not null
     and new.minutes is distinct from old.minutes then
    raise exception 'المحضر معتمد ولا يمكن تعديله؛ ألغِ الاعتماد أولًا';
  end if;
  if new.minutes_approved_at is distinct from old.minutes_approved_at then
    new.minutes_approved_by := case when new.minutes_approved_at is not null then auth.uid() end;
  end if;
  return new;
end $$;
create trigger meetings_guard before update or delete on public.meetings
  for each row execute function public.guard_meeting();

create or replace function public.stamp_attendance()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.note is distinct from old.note) then
    new.recorded_by := auth.uid();
    new.recorded_at := now();
  end if;
  return new;
end $$;
create trigger meeting_attendees_stamp before update on public.meeting_attendees
  for each row execute function public.stamp_attendance();

-- Decision numbering: YYYY-NNN, sequential per year, gap-free under concurrency (row lock on counter).
create or replace function public.assign_decision_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year int; v_no int;
begin
  v_year := extract(year from coalesce(new.decided_on, current_date))::int;
  insert into public.decision_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = public.decision_counters.last_no + 1
  returning last_no into v_no;
  new.number := v_year::text || '-' || lpad(v_no::text, 3, '0');
  return new;
end $$;
create trigger decisions_number before insert on public.decisions
  for each row execute function public.assign_decision_number();

-- Decision guards. Calls without a JWT user (SQL editor / migrations) are trusted.
create or replace function public.guard_decision()
returns trigger language plpgsql as $$
declare v_protected text[] := array['approved', 'in_progress', 'executed'];
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.status <> 'proposed' then
      raise exception 'لا يمكن حذف قرار تجاوز مرحلة الاقتراح؛ استخدم الأرشفة';
    end if;
    return old;
  end if;
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.status = any (v_protected) and not public.has_permission('decisions.approve') then
      raise exception 'اعتماد القرار يتطلب صلاحية الاعتماد';
    end if;
  else
    if new.status is distinct from old.status and new.status = 'approved'
       and not public.has_permission('decisions.approve') then
      raise exception 'اعتماد القرار يتطلب صلاحية الاعتماد';
    end if;
    if old.status = any (v_protected) and not public.has_permission('decisions.approve') then
      if new.title is distinct from old.title or new.details is distinct from old.details then
        raise exception 'تعديل نص قرار معتمد يتطلب صلاحية الاعتماد';
      end if;
      if new.status = 'proposed' then
        raise exception 'إعادة قرار معتمد إلى مقترح تتطلب صلاحية الاعتماد';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger decisions_guard before insert or update or delete on public.decisions
  for each row execute function public.guard_decision();

-- Remove attachment rows when their owner row is deleted (stored files are cleaned by the app).
create or replace function public.delete_entity_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.attachments where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end $$;
create trigger meetings_attachments_cleanup after delete on public.meetings
  for each row execute function public.delete_entity_attachments('meeting');
create trigger decisions_attachments_cleanup after delete on public.decisions
  for each row execute function public.delete_entity_attachments('decision');

-- ───────── RLS ─────────
grant select on public.member_directory to authenticated;
revoke all on public.member_directory from anon, public;

alter table public.meeting_types enable row level security;
alter table public.meetings enable row level security;
alter table public.agenda_items enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.decision_counters enable row level security;  -- no policies: trigger-only
alter table public.decisions enable row level security;
alter table public.attachments enable row level security;
alter table public.change_history enable row level security;

create policy meeting_types_select on public.meeting_types for select to authenticated using (public.is_active_user());
create policy meeting_types_write on public.meeting_types for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create policy meetings_select on public.meetings for select to authenticated
  using (public.has_permission('meetings.view'));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (created_by = auth.uid() and (
    public.has_permission('meetings.manage')
    or (committee_id is not null and public.has_permission('meetings.manage_committee')
        and public.is_committee_head(committee_id))));
create policy meetings_update on public.meetings for update to authenticated
  using (public.can_manage_meeting(id))
  with check (public.has_permission('meetings.manage')
    or (committee_id is not null and public.has_permission('meetings.manage_committee')
        and public.is_committee_head(committee_id)));
create policy meetings_delete on public.meetings for delete to authenticated
  using (public.has_permission('meetings.delete'));

create policy agenda_select on public.agenda_items for select to authenticated using (public.has_permission('meetings.view'));
create policy agenda_write on public.agenda_items for all to authenticated
  using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id));

create policy attendees_select on public.meeting_attendees for select to authenticated using (public.has_permission('meetings.view'));
create policy attendees_write on public.meeting_attendees for all to authenticated
  using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id));

create policy decisions_select on public.decisions for select to authenticated using (public.has_permission('decisions.view'));
create policy decisions_insert on public.decisions for insert to authenticated
  with check (created_by = auth.uid() and public.has_permission('decisions.manage'));
create policy decisions_update on public.decisions for update to authenticated
  using (public.has_permission('decisions.manage')) with check (public.has_permission('decisions.manage'));
create policy decisions_delete on public.decisions for delete to authenticated
  using (status = 'proposed' and public.has_permission('decisions.manage'));

create policy attachments_select on public.attachments for select to authenticated
  using ((entity_type = 'meeting' and public.has_permission('meetings.view'))
      or (entity_type = 'decision' and public.has_permission('decisions.view')));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and (
    (entity_type = 'meeting' and public.can_manage_meeting(entity_id))
    or (entity_type = 'decision' and public.has_permission('decisions.manage'))));
create policy attachments_delete on public.attachments for delete to authenticated
  using ((entity_type = 'meeting' and public.can_manage_meeting(entity_id))
      or (entity_type = 'decision' and public.has_permission('decisions.manage')));

create policy change_history_select on public.change_history for select to authenticated
  using (public.has_permission('audit.view')
      or (table_name = 'meetings' and public.has_permission('meetings.manage'))
      or (table_name = 'decisions' and public.has_permission('decisions.manage')));

-- ───────── Reference data (editable from Settings > meeting types) ─────────
insert into public.meeting_types (name_ar, sort_order) values
  ('اجتماع دوري', 1), ('اجتماع طارئ', 2), ('اجتماع لجنة فرعية', 3);
