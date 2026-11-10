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

## Stage 1 tables
| Table | Purpose |
|---|---|
| meeting_types | editable list of meeting types (Settings > meeting types) |
| meetings | meeting, status (`scheduled/held/cancelled`), minutes + approval, soft-archive (`archived_at`) |
| agenda_items | ordered agenda with the discussion text per item |
| meeting_attendees | one row per invited member; status `pending/present/late/excused/absent`, note, who/when recorded. **No row = not invited** (needed for fair scoring later) |
| decisions | numbered `YYYY-NNN` (trigger + `decision_counters`), status `proposed/approved/in_progress/executed/postponed/cancelled`, optional meeting, committee, assignee, due date, soft-archive |
| attachments | file metadata for meetings/decisions (≤ 4 MB); files live in the private `attachments` bucket, served via signed URLs only |
| change_history | generic before/after JSON for meetings and decisions, written by trigger |
| member_directory (view) | id + full name + active flag |

Why some statuses are code, not tables: attendance/decision/meeting status codes drive rules (locking, scoring), so they are constrained in SQL and labelled in `lib/labels.ts`. Purely descriptive lists (meeting types) are tables edited from the UI.

## Stages 2–3 tables
| Table | Purpose |
|---|---|
| task_priorities, project_categories | editable lookups (Settings) |
| projects | name, objective, committee, owner, category, priority, dates, budget, status, `weights_approved_at`, soft-archive |
| project_goals / project_milestones | ordered lists (`position`), goals `is_met`, milestones `pending/done` |
| project_notes | progress notes / reports |
| project_progress_snapshots | one row per project per day (feeds the timeline), written by trigger |
| tasks | committee, optional project, priority, dates, status, `progress` 0–100, `weight` (% of project), approval stamp, soft-archive |
| task_assignees | assignees with `share_pct` (responsibility share; must total 100% per task — enforced in the app action) |
| task_progress_updates | log of progress/status changes (trigger) |
| committees.duties | new column |
| project_progress (view) | automatic progress = Σ(weight × effective progress) ÷ Σ weights; equal weights if none set; `security_invoker` so RLS applies |

Effective task progress: completed = 100; awaiting_approval = min(progress, 99); cancelled and archived tasks are excluded.
