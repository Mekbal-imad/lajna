-- Stage 1, migration A (additive): archive columns, decision numbering, approval rights,
-- locked minutes, attendance stamps. Written against the REAL production schema:
--   meetings.starts_at / meeting_type (text) / statuses draft|scheduled|held|completed|cancelled
--   decisions.decision_no / body / statuses proposed|approved|in_progress|completed|postponed|cancelled
--   meeting_attendees.invited + attendance_status
-- Nothing is dropped or renamed. Safe to re-run. Runs in one transaction (all or nothing).
-- NOT included yet (next migration): attachments, change history (will reuse audit_logs/log_action),
-- meeting types table, committee-head permissions.

begin;

-- ───────── 1. Permission: decisions.approve ─────────
-- Granted to every role that can already manage decisions today, so nobody loses a right
-- when the guard below starts to enforce it. Tighten it later from the roles page.
insert into public.permissions (code, description_ar)
select 'decisions.approve', 'اعتماد القرارات'
where not exists (select 1 from public.permissions where code = 'decisions.approve');

insert into public.role_permissions (role_id, permission_id)
select rp.role_id, pnew.id
from public.role_permissions rp
join public.permissions pold on pold.id = rp.permission_id and pold.code = 'decisions.manage'
join public.permissions pnew on pnew.code = 'decisions.approve'
where not exists (
  select 1 from public.role_permissions x
  where x.role_id = rp.role_id and x.permission_id = pnew.id);

-- ───────── 2. New columns ─────────
alter table public.meetings
  add column if not exists committee_id uuid references public.committees(id) on delete restrict, -- null = whole committee
  add column if not exists minutes_approved_at timestamptz,
  add column if not exists minutes_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.agenda_items
  add column if not exists updated_at timestamptz not null default now();

alter table public.meeting_attendees
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists recorded_at timestamptz;

alter table public.decisions
  add column if not exists number text,
  add column if not exists decided_on date,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

update public.decisions set decided_on = created_at::date where decided_on is null;
alter table public.decisions alter column decided_on set default current_date;
alter table public.decisions alter column decided_on set not null;

create index if not exists meetings_committee_idx on public.meetings (committee_id);
create index if not exists meetings_active_idx on public.meetings (starts_at desc) where archived_at is null;
create index if not exists decisions_active_idx on public.decisions (status) where archived_at is null;

-- ───────── 3. Decision numbering YYYY-NNN (sequential per year, safe under concurrency) ─────────
create table if not exists public.decision_counters (
  year int primary key,
  last_no int not null default 0
);
alter table public.decision_counters enable row level security; -- no policies: trigger-only

-- Number the existing decisions (by year, oldest first), then seed the counters.
with ranked as (
  select id,
         extract(year from decided_on)::int as y,
         row_number() over (partition by extract(year from decided_on) order by created_at, id) as rn
  from public.decisions
  where number is null)
update public.decisions d
   set number = ranked.y::text || '-' || lpad(ranked.rn::text, 3, '0')
  from ranked
 where d.id = ranked.id;

insert into public.decision_counters (year, last_no)
select extract(year from decided_on)::int, count(*) from public.decisions group by 1
on conflict (year) do update set last_no = greatest(public.decision_counters.last_no, excluded.last_no);

alter table public.decisions alter column number set not null;
create unique index if not exists decisions_number_key on public.decisions (number);

create or replace function public.assign_decision_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_year int; v_no int;
begin
  if new.number is not null then return new; end if;
  v_year := extract(year from coalesce(new.decided_on, current_date))::int;
  insert into public.decision_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = public.decision_counters.last_no + 1
  returning last_no into v_no;
  new.number := v_year::text || '-' || lpad(v_no::text, 3, '0');
  return new;
end $$;

drop trigger if exists decisions_number on public.decisions;
create trigger decisions_number before insert on public.decisions
  for each row execute function public.assign_decision_number();

-- ───────── 4. Meeting guard: approved minutes are locked, held meetings are not deletable ─────────
-- Calls without a logged-in user (SQL editor, migrations) are trusted.
create or replace function public.guard_meeting()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null
       and (old.status in ('held', 'completed') or old.minutes_approved_at is not null) then
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

drop trigger if exists meetings_guard on public.meetings;
create trigger meetings_guard before update or delete on public.meetings
  for each row execute function public.guard_meeting();

-- ───────── 5. Decision guard: approval needs decisions.approve; no hard delete after proposal ─────────
create or replace function public.guard_decision()
returns trigger language plpgsql as $$
declare v_protected text[] := array['approved', 'in_progress', 'completed'];
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
      if new.title is distinct from old.title or new.body is distinct from old.body then
        raise exception 'تعديل نص قرار معتمد يتطلب صلاحية الاعتماد';
      end if;
      if new.status = 'proposed' then
        raise exception 'إعادة قرار معتمد إلى مقترح تتطلب صلاحية الاعتماد';
      end if;
    end if;
  end if;

  -- Record who approved and when.
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists decisions_guard on public.decisions;
create trigger decisions_guard before insert or update or delete on public.decisions
  for each row execute function public.guard_decision();

-- ───────── 6. Attendance stamp: who recorded it and when ─────────
create or replace function public.stamp_attendance()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.attendance_status <> 'invited')
     or (tg_op = 'UPDATE' and (new.attendance_status is distinct from old.attendance_status
                               or new.notes is distinct from old.notes)) then
    new.recorded_by := auth.uid();
    new.recorded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists meeting_attendees_stamp on public.meeting_attendees;
create trigger meeting_attendees_stamp before insert or update on public.meeting_attendees
  for each row execute function public.stamp_attendance();

-- ───────── 7. agenda_items.updated_at ─────────
drop trigger if exists agenda_items_updated on public.agenda_items;
create trigger agenda_items_updated before update on public.agenda_items
  for each row execute function public.set_updated_at();

commit;

-- ───────── Checks to run after the migration (read-only) ─────────
-- select id, number, decision_no, status, decided_on from public.decisions order by decided_on, number;
-- select year, last_no from public.decision_counters order by year;
-- select code from public.permissions where code = 'decisions.approve';
-- select tgname from pg_trigger where not tgisinternal and tgrelid in
--   ('public.meetings'::regclass, 'public.decisions'::regclass, 'public.meeting_attendees'::regclass);
