# Deployment (for whoever ships it)

## 1) Supabase (production)
1. Create a new project, separate from dev. Store the DB password safely.
2. Apply `supabase/migrations/*.sql` in order (`supabase link --project-ref <REF>` then `supabase db push`).
3. Authentication > Providers: keep Email enabled and **disable public sign-ups** (accounts are created by the admin from the app). Authentication > URL Configuration: set Site URL to the final domain.
4. Create the first user in Authentication > Users, then grant `super_admin` with the SQL in the README.
5. Do not run `supabase/tests/*.sql` against production.

## 2) Vercel
1. Import the GitHub repo (framework: Next.js, default build settings).
2. Environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase > Project Settings > API)
   - `SUPABASE_SERVICE_ROLE_KEY` — **required since phase 2** (user creation). Server-only; never `NEXT_PUBLIC_`.
3. Deploy and sign in as the super admin.

## 3) Before real users
- Verify RLS is on for every public table: `select tablename, rowsecurity from pg_tables where schemaname = 'public';`
- Enable Supabase backups.
