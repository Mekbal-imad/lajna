# Committee Management Platform (Organisation, Maintenance & Cleaning)

Arabic (RTL) web app for a Quranic school / mosque committee: meetings, decisions, tasks, projects, maintenance reports, public suggestions and reports.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Supabase (PostgreSQL, Auth, Storage, RLS) · Zod.
UI text is Arabic. Code, comments and technical docs are English.

## Run locally
1. Node.js 20+, and a Supabase project (use a dev project, separate from production).
2. `npm install`, then `cp .env.example .env.local` and fill the three variables (see `.env.example`).
3. Apply every file in `supabase/migrations/` in filename order (SQL editor, or `supabase link` + `supabase db push`).
4. Create the first user in Supabase > Authentication > Users, then make them super admin:
   ```sql
   insert into public.user_roles (user_id, role_id)
   select '<USER_UUID>', id from public.roles where code = 'super_admin';
   ```
5. `npm run dev` and open http://localhost:3000.

## Checks
- `npm run typecheck`, `npm run lint`, `npm run build`
- Permission tests (dev DB only, they roll back): `psql "$DATABASE_URL" -f supabase/tests/001_rls_foundation.sql` and `…/002_rls_phase2.sql`

## Security rules
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (used by `lib/supabase/admin.ts`). Never prefix it with `NEXT_PUBLIC_`, never commit it.
- Authorization is enforced by RLS and DB triggers; hiding UI elements is not security. See `docs/PERMISSIONS.md`.

## Docs
`PROJECT_STATUS.md` · `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/PERMISSIONS.md` · `docs/DEPLOYMENT.md`
