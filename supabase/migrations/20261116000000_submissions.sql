-- Phase 2b: suggestions / complaints / notes / inquiries (fed by the Google Form through a webhook).
-- Additive only. Rows are inserted by the server (service role) from the webhook; signed-in users
-- can read and update them according to permissions. Safe to re-run.

insert into public.permissions (code, description_ar) values
  ('submissions.view',   'عرض الاقتراحات والشكاوى والملاحظات'),
  ('submissions.manage', 'معالجة الاقتراحات والشكاوى (الحالة، الإسناد، التحويل إلى مهمة، الأرشفة)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('submissions.view', 'submissions.manage')
where r.code in ('super_admin', 'chair', 'vice_chair', 'sub_head')
on conflict do nothing;

create table if not exists public.submission_counters (
  year int primary key,
  last_no int not null default 0
);
alter table public.submission_counters enable row level security;   -- no policies: trigger only

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  external_id text unique,                       -- Google Form response id (makes the webhook idempotent)
  source text not null default 'google_form' check (source in ('google_form', 'internal')),
  kind text not null check (kind in ('suggestion', 'complaint', 'note', 'inquiry')),
  title text not null check (length(trim(title)) > 0),
  details text,
  area text,                                     -- «المجال المعني»
  urgent boolean not null default false,
  proposed_solution text,
  submitter_name text,
  submitter_role text,
  contact_requested boolean not null default false,
  contact_info text,
  answers jsonb not null default '[]'::jsonb,    -- every answer exactly as submitted [{q, a}]
  status text not null default 'new'
    check (status in ('new', 'under_review', 'accepted', 'in_progress', 'resolved', 'rejected', 'closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_kind_idx on public.submissions (kind) where archived_at is null;
create index if not exists submissions_status_idx on public.submissions (status) where archived_at is null;
create index if not exists submissions_submitted_idx on public.submissions (submitted_at desc);

create table if not exists public.submission_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists submission_notes_idx on public.submission_notes (submission_id, created_at);

create or replace function public.assign_submission_ref()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year int; v_no int;
begin
  if new.ref is not null and new.ref <> '' then return new; end if;
  v_year := extract(year from coalesce(new.submitted_at, now()))::int;
  insert into public.submission_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = public.submission_counters.last_no + 1
  returning last_no into v_no;
  new.ref := 'SB-' || v_year::text || '-' || lpad(v_no::text, 3, '0');
  return new;
end $$;

drop trigger if exists submissions_ref on public.submissions;
create trigger submissions_ref before insert on public.submissions
  for each row execute function public.assign_submission_ref();
-- ref is NOT NULL, so give the insert a placeholder that the trigger replaces
alter table public.submissions alter column ref set default '';

drop trigger if exists submissions_updated_at on public.submissions;
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();

-- Only status / assignment / archive / task link may change from the app; the submitted content is fixed.
create or replace function public.guard_submission()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.ref is distinct from old.ref or new.kind is distinct from old.kind
    or new.title is distinct from old.title or new.details is distinct from old.details
    or new.answers is distinct from old.answers or new.submitter_name is distinct from old.submitter_name
    or new.external_id is distinct from old.external_id or new.source is distinct from old.source) then
    raise exception 'محتوى الرسالة المستلمة لا يُعدَّل';
  end if;
  if new.status is distinct from old.status then
    if new.status <> 'new' and old.reviewed_at is null then new.reviewed_at := now(); end if;
    if new.status in ('resolved', 'rejected', 'closed') then new.closed_at := coalesce(new.closed_at, now());
    else new.closed_at := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before update on public.submissions
  for each row execute function public.guard_submission();

drop trigger if exists submissions_history on public.submissions;
create trigger submissions_history after insert or update on public.submissions
  for each row execute function public.record_change();

alter table public.submissions enable row level security;
alter table public.submission_notes enable row level security;

drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated
  using (public.has_permission('submissions.view') or public.has_permission('submissions.manage'));
drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update to authenticated
  using (public.has_permission('submissions.manage')) with check (public.has_permission('submissions.manage'));
-- no insert / delete policies: rows arrive only from the server webhook and are archived, never deleted

drop policy if exists submission_notes_select on public.submission_notes;
create policy submission_notes_select on public.submission_notes for select to authenticated
  using (public.has_permission('submissions.view') or public.has_permission('submissions.manage'));
drop policy if exists submission_notes_insert on public.submission_notes;
create policy submission_notes_insert on public.submission_notes for insert to authenticated
  with check (author_id = auth.uid() and public.has_permission('submissions.manage'));

-- History of submissions is readable by whoever manages them.
drop policy if exists audit_logs_entity_select on public.audit_logs;
create policy audit_logs_entity_select on public.audit_logs for select to authenticated
  using ((entity_type = 'meetings'    and (public.has_permission('meetings.manage') or public.can_manage_meeting(entity_id)))
      or (entity_type = 'decisions'   and public.has_permission('decisions.manage'))
      or (entity_type = 'committees'  and public.has_permission('committees.manage'))
      or (entity_type = 'tasks'       and (public.has_permission('tasks.manage') or public.can_manage_task(entity_id)))
      or (entity_type = 'projects'    and (public.has_permission('projects.manage') or public.can_manage_project(entity_id)))
      or (entity_type = 'submissions' and public.has_permission('submissions.manage')));
