-- The sidebar and the committees pages ask for `committees.view`, which never existed, so the
-- "اللجان الفرعية" item was hidden for everyone. Create it and give it to every role that can open tasks.
insert into public.permissions (code, description_ar)
select 'committees.view', 'عرض اللجان الفرعية' where not exists (select 1 from public.permissions where code = 'committees.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code = 'committees.view'
where r.code in ('super_admin', 'chair', 'vice_chair', 'secretary', 'sub_head', 'member', 'administration')
on conflict do nothing;
