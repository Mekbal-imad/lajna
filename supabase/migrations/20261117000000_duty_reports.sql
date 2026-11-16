-- Phase 2c: duty shifts (المداومة). One report per shift, sent by the Google Form webhook.
-- Additive only. Rows are inserted by the server; signed-in users read them and manage follow-up.
insert into public.permissions (code, description_ar) values
  ('duty.view',   'عرض تقارير المداومة ولوحة المتابعة'),
  ('duty.manage', 'متابعة تقارير المداومة (النواقص والأعطال، التحويل إلى مهمة)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in ('duty.view', 'duty.manage')
where r.code in ('super_admin', 'chair', 'vice_chair', 'sub_head')
on conflict do nothing;

create table if not exists public.duty_reports (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,                     -- Google Form response id (webhook is idempotent)
  person_name text not null check (length(trim(person_name)) > 0),
  duty_date date not null,                     -- the day of the shift (not the day the form was filled)
  attendance text not null check (attendance in ('on_time', 'late', 'absent_excused', 'absent_unexcused')),
  arrival_time text,
  delay_minutes int check (delay_minutes is null or (delay_minutes >= 0 and delay_minutes <= 600)),
  attendance_note text,                        -- delay duration / reason / substitute, as written
  c1 boolean, c2 boolean, c3 boolean, c4 boolean, c5 boolean, c6 boolean, c7 boolean,   -- the 7 duties: true = done
  rating int check (rating between 1 and 4),   -- 1 weak, 2 average, 3 good (حسن), 4 very good (جيد)
  shortages text,
  shortage_status text not null default 'none' check (shortage_status in ('none', 'open', 'handled')),
  task_id uuid references public.tasks(id) on delete set null,
  notes text,
  answers jsonb not null default '[]'::jsonb,  -- every answer as submitted [{q, a}]
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duty_reports_date_idx on public.duty_reports (duty_date desc);
create index if not exists duty_reports_person_idx on public.duty_reports (person_name);
create index if not exists duty_reports_shortage_idx on public.duty_reports (shortage_status) where shortage_status = 'open';

drop trigger if exists duty_reports_updated_at on public.duty_reports;
create trigger duty_reports_updated_at before update on public.duty_reports
  for each row execute function public.set_updated_at();

-- The submitted report is fixed; only the follow-up of shortages can change from the app.
create or replace function public.guard_duty_report()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
       to_jsonb(new) - 'shortage_status' - 'task_id' - 'updated_at'
       is distinct from to_jsonb(old) - 'shortage_status' - 'task_id' - 'updated_at') then
    raise exception 'محتوى تقرير المداومة المستلم لا يُعدَّل';
  end if;
  return new;
end $$;
drop trigger if exists duty_reports_guard on public.duty_reports;
create trigger duty_reports_guard before update on public.duty_reports
  for each row execute function public.guard_duty_report();

drop trigger if exists duty_reports_history on public.duty_reports;
create trigger duty_reports_history after insert or update on public.duty_reports
  for each row execute function public.record_change();

alter table public.duty_reports enable row level security;
drop policy if exists duty_reports_select on public.duty_reports;
create policy duty_reports_select on public.duty_reports for select to authenticated
  using (public.has_permission('duty.view') or public.has_permission('duty.manage'));
drop policy if exists duty_reports_update on public.duty_reports;
create policy duty_reports_update on public.duty_reports for update to authenticated
  using (public.has_permission('duty.manage')) with check (public.has_permission('duty.manage'));
-- no insert / delete policies: reports arrive only from the server webhook
