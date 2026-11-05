# Project status

Last update: 2026-11-05 — Phase 2 (auth & permissions) written. **Nothing has been run yet** (no npm install, build, migration or test execution was possible in the authoring environment).

## Written
- Phase 1: Next.js/TS/Tailwind scaffold, Arabic RTL, light theme (Tajawal/Cairo), login, protected routes, responsive shell, dashboard with **mock data** (`lib/mock/dashboard.ts`), foundation migration + RLS.
- Phase 2:
  - Migration `20261105010000_phase2_auth.sql`: `my_permissions()`, `is_super_admin()`, role-assignment guard trigger, one-head-per-committee + head sync.
  - Session helpers (`lib/auth/session.ts`), permission-filtered navigation, `/forbidden`, `/auth/inactive` (signs out disabled accounts), login "disabled" message.
  - User management: list + search (`/users`), create (`/users/new`), detail (`/users/[id]`: profile, roles, committee membership, activate/deactivate), `/account` (change own password). All writes go through server actions with Zod + permission checks + audit log.
  - SQL tests: `supabase/tests/001_rls_foundation.sql`, `002_rls_phase2.sql`.
  - Docs translated to English (README, DEPLOYMENT, PERMISSIONS, DATABASE, ARCHITECTURE).

## Not done
- Everything above is untested. First steps for the integrator: `npm install && npm run typecheck && npm run build`, apply migrations on a dev project, run both SQL test files, then click through login → create user → assign role → committee membership → deactivate.
- `SUPABASE_SERVICE_ROLE_KEY` is now required (user creation).
- shadcn/ui not initialised (plain Tailwind components).
- No email invitation / password-reset flow; admin sets a temporary password.
- Committees pages, meetings, decisions, tasks, etc. (phases 3–6). Dashboard still shows mock data.
- Phase-1 SQL comments are partly Arabic.

## Decisions
- Tailwind 3.4; logical CSS properties (`ms-`, `start-`) for RTL.
- Permissions are DB-driven; navigation hiding is cosmetic.
- No hard delete of users from the app; deactivation only.

## Known issues
- None confirmed (untested).

## Next
Phase 3: dashboard on real data, committees pages, meetings, decisions, minutes.
