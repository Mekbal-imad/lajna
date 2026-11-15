-- Ordinary members can view meetings and decisions (read only).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('meetings.view', 'decisions.view') where r.code = 'member'
on conflict do nothing;
