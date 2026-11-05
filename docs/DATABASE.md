# Database

UUID primary keys, `timestamptz` dates. Migrations in `supabase/migrations/`, applied in filename order.

| Table | Purpose |
|---|---|
| roles / permissions / role_permissions | RBAC definition |
| profiles | 1:1 with `auth.users`; `is_active` flag |
| user_roles | roles per user |
| committees / committee_members | sub-committees and membership (`head` / `member`) |
| audit_logs | sensitive-operation log (read: `audit.view`; write: `log_action()` only) |

Functions: `has_permission(code)`, `is_active_user()`, `is_super_admin()`, `my_permissions()`, `log_action(...)`.
Triggers: `updated_at`, profile auto-creation on signup (no role by default), `guard_profile_update`, `guard_user_roles`, `sync_committee_head`.

Planned (phases 3–6): meetings, meeting_attendees, agenda_items, decisions, tasks, task_assignees, task_updates, projects, project_milestones, maintenance_reports, submissions, reports, files, notifications.
