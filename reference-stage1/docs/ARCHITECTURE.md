# Architecture

- **UI:** Next.js App Router. Pages are Server Components reading through the Supabase server client; interactivity lives in small `"use client"` components.
- **Session:** `@supabase/ssr` cookies; `middleware.ts` refreshes the session and redirects signed-out users to `/login`. The app always uses `auth.getUser()` (server-validated), never `getSession()`.
- **Auth:** email + password; accounts are created by an admin (no self sign-up). Disabled accounts are signed out via `/auth/inactive`.
- **Authorization:** `lib/auth/session.ts` (`requirePermission`) guards pages; server actions re-check permissions and then run through the user's own Supabase client, so RLS applies again. The service-role client (`lib/supabase/admin.ts`) is used only to create users / read emails, after a permission check.
- **Errors:** `lib/errors.ts` maps DB/auth errors to safe Arabic messages. Server actions return `{ error?, ok? }` and are rendered by `components/ui/action-form.tsx`.
- **Validation:** Zod schemas in `lib/validation/`.
- **Audit:** `log_action()` RPC after each sensitive change.
- **Later:** public form via a Route Handler with rate limiting (phase 5); private Storage buckets with signed URLs.

```
app/            routes: login, (app)/dashboard, users, account, forbidden; auth/inactive
components/     layout / ui
lib/            auth, supabase, validation, errors, navigation, mock (demo data only)
supabase/       migrations, tests
docs/
```
