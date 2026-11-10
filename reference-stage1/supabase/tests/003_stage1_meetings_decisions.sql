-- Stage 1 tests (development DB only; rolls back):
--   psql "$DATABASE_URL" -f supabase/tests/003_stage1_meetings_decisions.sql
begin;

insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'chair@t.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'secr@t.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'subhead@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d4', 'member@t.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.user_roles (user_id, role_id)
select u.id::uuid, r.id from (values
  ('00000000-0000-0000-0000-0000000000d1', 'chair'),
  ('00000000-0000-0000-0000-0000000000d2', 'secretary'),
  ('00000000-0000-0000-0000-0000000000d3', 'sub_head'),
  ('00000000-0000-0000-0000-0000000000d4', 'member')) as u(id, code)
join public.roles r on r.code = u.code;

insert into public.committee_members (committee_id, user_id, member_role)
select id, '00000000-0000-0000-0000-0000000000d3', 'head' from public.committees where slug = 'cleaning';

set local role authenticated;

-- ===== member: read-only =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.meetings (title, scheduled_at) values ('x', now());
    raise exception 'FAIL: member created a meeting';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  assert (select count(*) from public.meeting_types) >= 3, 'member should read meeting types';
end $$;

-- ===== sub-committee head: own committee only =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
do $$
begin
  insert into public.meetings (title, scheduled_at, committee_id)
  select 'own committee', now(), id from public.committees where slug = 'cleaning';
  begin
    insert into public.meetings (title, scheduled_at, committee_id)
    select 'other committee', now(), id from public.committees where slug = 'maintenance';
    raise exception 'FAIL: sub head created a meeting for another committee';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.meetings (title, scheduled_at) values ('no committee', now());
    raise exception 'FAIL: sub head created a committee-wide meeting';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

-- ===== secretary: meetings + decisions (no approval) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$
declare v_dec uuid; v_meet uuid; v_no text;
begin
  insert into public.decisions (title) values ('proposal') returning id, number into v_dec, v_no;
  assert v_no ~ '^[0-9]{4}-[0-9]{3}$', 'decision number format: ' || v_no;

  begin
    update public.decisions set status = 'approved' where id = v_dec;
    raise exception 'FAIL: secretary approved a decision';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  insert into public.meetings (title, scheduled_at, minutes) values ('m', now(), 'draft') returning id into v_meet;
  update public.meetings set minutes_approved_at = now() where id = v_meet;
  begin
    update public.meetings set minutes = 'tampered' where id = v_meet;
    raise exception 'FAIL: approved minutes were edited';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update public.meetings set status = 'held' where id = v_meet;
end $$;

-- ===== chair: approves; approved decisions are protected =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare v_dec uuid; n int;
begin
  select id into v_dec from public.decisions where title = 'proposal';
  update public.decisions set status = 'approved' where id = v_dec;

  delete from public.decisions where id = v_dec;
  get diagnostics n = row_count;
  assert n = 0, 'approved decision must not be deletable';
  assert exists (select 1 from public.decisions where id = v_dec), 'approved decision vanished';

  assert (select count(*) from public.change_history where table_name = 'decisions' and row_id = v_dec) >= 2,
    'decision history should record insert and update';

  delete from public.meetings where title = 'm';
  get diagnostics n = row_count;
  assert n = 0 or exists (select 1 from public.meetings where title = 'm'), 'held meeting must survive';
end $$;

rollback;
select 'stage 1 tests passed' as result;
