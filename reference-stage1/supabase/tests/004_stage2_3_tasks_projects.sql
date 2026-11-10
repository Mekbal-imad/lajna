-- Stage 2–3 tests (development DB only; rolls back):
--   psql "$DATABASE_URL" -f supabase/tests/004_stage2_3_tasks_projects.sql
begin;

insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'chair@t.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'worker@t.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'subhead@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e4', 'vice@t.local',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.user_roles (user_id, role_id)
select u.id::uuid, r.id from (values
  ('00000000-0000-0000-0000-0000000000e1', 'chair'),
  ('00000000-0000-0000-0000-0000000000e2', 'member'),
  ('00000000-0000-0000-0000-0000000000e3', 'sub_head'),
  ('00000000-0000-0000-0000-0000000000e4', 'vice_chair')) as u(id, code)
join public.roles r on r.code = u.code;

insert into public.committee_members (committee_id, user_id, member_role)
select id, '00000000-0000-0000-0000-0000000000e3', 'head' from public.committees where slug = 'cleaning';

-- Fixture created as superuser (no JWT user): project with the worked example 20/30/40/10 → 70%.
insert into public.projects (id, name) values ('10000000-0000-0000-0000-000000000001', 'مشروع الاختبار');
insert into public.tasks (id, title, project_id, weight, progress, status) values
  ('20000000-0000-0000-0000-000000000001', 'خطة',     '10000000-0000-0000-0000-000000000001', 20, 100, 'completed'),
  ('20000000-0000-0000-0000-000000000002', 'معدات',   '10000000-0000-0000-0000-000000000001', 30, 100, 'completed'),
  ('20000000-0000-0000-0000-000000000003', 'أشغال',   '10000000-0000-0000-0000-000000000001', 40, 50,  'in_progress'),
  ('20000000-0000-0000-0000-000000000004', 'تقييم',   '10000000-0000-0000-0000-000000000001', 10, 0,   'not_started');
insert into public.tasks (id, title, status) values ('20000000-0000-0000-0000-000000000009', 'مهمة العامل', 'in_progress');
insert into public.task_assignees (task_id, user_id) values
  ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000e2');

set local role authenticated;

-- ===== project progress (view) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$
begin
  assert (select progress from public.project_progress where project_id = '10000000-0000-0000-0000-000000000001') = 70.0,
    'worked example must give 70%';
  assert (select weights_total from public.project_progress where project_id = '10000000-0000-0000-0000-000000000001') = 100,
    'weights total 100';

  -- approve distribution (sum = 100), then changing a weight withdraws the approval
  update public.projects set weights_approved_at = now() where id = '10000000-0000-0000-0000-000000000001';
  assert (select weights_approved_at from public.projects where id = '10000000-0000-0000-0000-000000000001') is not null;
  update public.tasks set weight = 25 where id = '20000000-0000-0000-0000-000000000004';
  assert (select weights_approved_at from public.projects where id = '10000000-0000-0000-0000-000000000001') is null,
    'changing a weight must withdraw approval';

  -- cannot approve a distribution that does not total 100
  begin
    update public.projects set weights_approved_at = now() where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: approved weights totalling 115';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  assert exists (select 1 from public.project_progress_snapshots where project_id = '10000000-0000-0000-0000-000000000001'),
    'snapshot should exist';
end $$;

-- ===== assignee: progress only, 100% = submitted =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$
begin
  update public.tasks set progress = 40, last_update_note = 'بدأت' where id = '20000000-0000-0000-0000-000000000009';
  begin
    update public.tasks set title = 'تغيير' where id = '20000000-0000-0000-0000-000000000009';
    raise exception 'FAIL: assignee edited the title';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.tasks set status = 'completed' where id = '20000000-0000-0000-0000-000000000009';
    raise exception 'FAIL: assignee completed own task';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  update public.tasks set progress = 100 where id = '20000000-0000-0000-0000-000000000009';
  assert (select status from public.tasks where id = '20000000-0000-0000-0000-000000000009') = 'awaiting_approval',
    '100% must become awaiting_approval';
  assert (select count(*) from public.task_progress_updates where task_id = '20000000-0000-0000-0000-000000000009') >= 2,
    'progress log should record updates';
end $$;

-- ===== approver completes; approval fields are stamped =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);
do $$
begin
  update public.tasks set status = 'completed' where id = '20000000-0000-0000-0000-000000000009';
  assert (select completion_approved_at from public.tasks where id = '20000000-0000-0000-0000-000000000009') is not null,
    'approval timestamp';
  assert (select progress from public.tasks where id = '20000000-0000-0000-0000-000000000009') = 100;
end $$;

-- ===== sub-committee head: own committee only =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
do $$
begin
  insert into public.tasks (title, committee_id)
  select 'own', id from public.committees where slug = 'cleaning';
  begin
    insert into public.tasks (title, committee_id)
    select 'other', id from public.committees where slug = 'maintenance';
    raise exception 'FAIL: sub head created a task for another committee';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

-- ===== member cannot create tasks or projects =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.tasks (title) values ('x');
    raise exception 'FAIL: member created a task';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.projects (name) values ('x');
    raise exception 'FAIL: member created a project';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

rollback;
select 'stage 2-3 tests passed' as result;
