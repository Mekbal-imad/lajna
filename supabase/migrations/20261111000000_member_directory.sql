-- Names-only view so every signed-in, active member can see WHO was invited / attended a meeting,
-- while public.profiles (phone numbers etc.) stays restricted by its own RLS.
-- Additive and safe to re-run. Until it is applied, the attendance page falls back to reading profiles
-- (works only for users with users.view).
create or replace view public.member_directory as
  select id, full_name, is_active
  from public.profiles
  where public.is_active_user();

revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;
