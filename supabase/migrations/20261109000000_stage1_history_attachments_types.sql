-- Stage 1, migration B (additive): sub-committee heads, change history, attachments, meeting types.
-- Builds on migration A. Nothing is dropped or renamed. Safe to re-run. One transaction.
--
-- Decisions taken from the real schema:
--   * History is written into the EXISTING audit_logs table (actor_id, action, entity_type, entity_id, details),
--     so the activity-log page keeps working and no second history system is created.
--   * A committee head is committees.head_id (kept in sync with committee_members by your existing trigger).
--   * meetings.meeting_type stays a plain text code (no foreign key, so nothing in the app can break);
--     meeting_types only supplies the editable list of choices.

begin;

-- ───────── 1. Permissions ─────────
insert into public.permissions (code, description_ar)
select v.code, v.descr
from (values
  ('meetings.manage_committee', 'إدارة اجتماعات اللجنة الفرعية التي يرأسها فقط'),
  ('settings.manage',           'تعديل إعدادات المنصة (أنواع الاجتماعات وغيرها)')
) as v(code, descr)
where not exists (select 1 from public.permissions p where p.code = v.code);

-- Sub-committee heads: manage only the meetings of the committee they head.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = 'meetings.manage_committee'
where r.code = 'sub_head'
  and not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- Settings: super admin and chair.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = 'settings.manage'
where r.code in ('super_admin', 'chair')
  and not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- ───────── 2. Helpers ─────────
create or replace function public.is_committee_head(p_committee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.committees c where c.id = p_committee and c.head_id = auth.uid());
$$;

create or replace function public.can_manage_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting
      and (public.has_permission('meetings.manage')
           or (m.committee_id is not null
               and public.has_permission('meetings.manage_committee')
               and public.is_committee_head(m.committee_id))));
$$;

revoke all on function public.is_committee_head(uuid) from public, anon;
revoke all on function public.can_manage_meeting(uuid) from public, anon;
grant execute on function public.is_committee_head(uuid) to authenticated;
grant execute on function public.can_manage_meeting(uuid) to authenticated;

-- ───────── 3. Sub-committee head policies (added next to the existing ones, which stay as they are) ─────────
drop policy if exists meetings_committee_insert on public.meetings;
create policy meetings_committee_insert on public.meetings for insert to authenticated
  with check (created_by = auth.uid() and committee_id is not null
              and public.has_permission('meetings.manage_committee')
              and public.is_committee_head(committee_id));

drop policy if exists meetings_committee_update on public.meetings;
create policy meetings_committee_update on public.meetings for update to authenticated
  using (public.can_manage_meeting(id))
  with check (committee_id is not null
              and public.has_permission('meetings.manage_committee')
              and public.is_committee_head(committee_id));

drop policy if exists agenda_committee_write on public.agenda_items;
create policy agenda_committee_write on public.agenda_items for all to authenticated
  using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id));

drop policy if exists attendees_committee_write on public.meeting_attendees;
create policy attendees_committee_write on public.meeting_attendees for all to authenticated
  using (public.can_manage_meeting(meeting_id)) with check (public.can_manage_meeting(meeting_id));

-- ───────── 4. Change history (who, when, before, after) into audit_logs ─────────
create or replace function public.record_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_id uuid;
  v_diff_old jsonb := '{}'::jsonb; v_diff_new jsonb := '{}'::jsonb; k text;
begin
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_id  := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k) then
        v_diff_old := v_diff_old || jsonb_build_object(k, v_old -> k);
        v_diff_new := v_diff_new || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if v_diff_new = '{}'::jsonb then return null; end if;   -- nothing meaningful changed
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), tg_table_name || '.update', tg_table_name, v_id,
            jsonb_build_object('op', tg_op, 'old', v_diff_old, 'new', v_diff_new));
  elsif tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), tg_table_name || '.insert', tg_table_name, v_id,
            jsonb_build_object('op', tg_op, 'new', v_new));
  else
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), tg_table_name || '.delete', tg_table_name, v_id,
            jsonb_build_object('op', tg_op, 'old', v_old));
  end if;
  return null;
end $$;

drop trigger if exists meetings_history on public.meetings;
create trigger meetings_history after insert or update or delete on public.meetings
  for each row execute function public.record_change();

drop trigger if exists decisions_history on public.decisions;
create trigger decisions_history after insert or update or delete on public.decisions
  for each row execute function public.record_change();

-- Meeting and decision managers can read the history of their own entities (audit.view still sees all).
drop policy if exists audit_logs_entity_select on public.audit_logs;
create policy audit_logs_entity_select on public.audit_logs for select to authenticated
  using ((entity_type = 'meetings'  and (public.has_permission('meetings.manage')  or public.can_manage_meeting(entity_id)))
      or (entity_type = 'decisions' and public.has_permission('decisions.manage')));

-- ───────── 5. Attachments (private bucket; files are reached only through server code) ─────────
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('meeting', 'decision')),
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (length(trim(file_name)) > 0),
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 4194304),   -- 4 MB
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_entity_idx on public.attachments (entity_type, entity_id);
alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using ((entity_type = 'meeting'  and (public.has_permission('meetings.view')  or public.has_permission('meetings.manage')))
      or (entity_type = 'decision' and (public.has_permission('decisions.view') or public.has_permission('decisions.manage'))));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and (
       (entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
    or (entity_type = 'decision' and public.has_permission('decisions.manage'))));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using ((entity_type = 'meeting'  and public.can_manage_meeting(entity_id))
      or (entity_type = 'decision' and public.has_permission('decisions.manage')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
-- No storage.objects policies on purpose: the browser can never read or write the bucket directly.

-- Remove attachment rows when their owner row is deleted (stored files are cleaned by the app).
create or replace function public.delete_entity_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.attachments where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end $$;

drop trigger if exists meetings_attachments_cleanup on public.meetings;
create trigger meetings_attachments_cleanup after delete on public.meetings
  for each row execute function public.delete_entity_attachments('meeting');

drop trigger if exists decisions_attachments_cleanup on public.decisions;
create trigger decisions_attachments_cleanup after delete on public.decisions
  for each row execute function public.delete_entity_attachments('decision');

-- ───────── 6. Meeting types (editable list; meetings keep storing the text code) ─────────
create table if not exists public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name_ar text not null unique check (length(trim(name_ar)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.meeting_types enable row level security;

drop trigger if exists meeting_types_updated on public.meeting_types;
create trigger meeting_types_updated before update on public.meeting_types
  for each row execute function public.set_updated_at();

drop policy if exists meeting_types_select on public.meeting_types;
create policy meeting_types_select on public.meeting_types for select to authenticated
  using (public.is_active_user());

drop policy if exists meeting_types_write on public.meeting_types;
create policy meeting_types_write on public.meeting_types for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

-- Seed from what already exists: the default code plus every code already used by a meeting.
-- The Arabic name of any code other than "regular" is the code itself until someone renames it in settings.
insert into public.meeting_types (code, name_ar, sort_order)
select c.code,
       case when c.code = 'regular' then 'اجتماع دوري' else c.code end,
       row_number() over (order by (c.code = 'regular') desc, c.code)
from (select 'regular' as code
      union
      select distinct meeting_type from public.meetings where meeting_type is not null) c
where not exists (select 1 from public.meeting_types t where t.code = c.code);

commit;

-- ───────── Checks (read-only) ─────────
-- select code from public.meeting_types order by sort_order;
-- select p.code, count(rp.role_id) from public.permissions p
--   left join public.role_permissions rp on rp.permission_id = p.id
--   where p.code in ('meetings.manage_committee','settings.manage') group by 1;
-- select id, public, file_size_limit from storage.buckets where id = 'attachments';
