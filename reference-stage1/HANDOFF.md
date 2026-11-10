# Handoff — read this first

Phases 1–2 plus Stage 1 (meetings & decisions) of a committee management platform (Arabic RTL, Next.js + Supabase), written without the ability to run anything. **Treat it as an untested first draft.**

## 1. First hour
1. `npm install && npm run typecheck && npm run build` — fix whatever breaks (expect small type/import issues).
2. Create a **dev** Supabase project, apply `supabase/migrations/*.sql` in order.
3. Run `supabase/tests/001…`, `002…`, `003_stage1_meetings_decisions.sql` on the dev DB (they roll back).
4. Create the first user in Supabase Auth, make them `super_admin` (SQL in README), then click through: login → /users/new → assign a role → committee membership → deactivate.

## 2. Deploy (details in docs/DEPLOYMENT.md)
- Separate production Supabase project; disable public sign-ups; set Site URL.
- Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`).

## 3. Know before shipping
- The dashboard shows real meetings/decisions counts; tasks, projects and activity are still **mock data** (`lib/mock/dashboard.ts`), labelled "تجريبي".
- Meetings and decisions exist; tasks, projects, maintenance, public form, reports, archive, notifications, scoring are not built yet (greyed out in the sidebar).
- File uploads need `SUPABASE_SERVICE_ROLE_KEY` and are capped at 4 MB (Vercel body limit). Set `APP_TIMEZONE` if not Africa/Algiers.
- No invitation / password-reset email flow yet; the admin sets a temporary password.
- shadcn/ui was not initialised; components are plain Tailwind.
- Authorization lives in RLS + triggers (docs/PERMISSIONS.md). Do not rely on hidden buttons.

## 4. Where things are
`PROJECT_STATUS.md` (state + next steps) · `docs/` (architecture, database, permissions, deployment, `design-preview.html` = static look of login/dashboard) · `supabase/migrations`, `supabase/tests`.
