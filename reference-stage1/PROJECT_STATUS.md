# Project status

Last update: 2026-11-09 — Stages 2–3 (committees, tasks, projects) written on top of Stage 1. **Nothing has been run yet** (no install, build, migration or test could be executed where this was written). Only a syntax-level parse of the TS/TSX files was possible. Treat as an untested draft and follow `docs/QUICKSTART_TEST.md`.

## Written
- Phases 1–2, Stage 1: see earlier notes (auth, users/roles, meetings, agenda, attendance, minutes, decisions, attachments, history).
- **Committees**: list with counts, create, edit (description + duties), members (add / change role / remove, one head), linked projects with progress, open tasks, meetings, history, deactivate / delete (refused when referenced).
- **Tasks**: table + board, filters (search, status, committee, priority, assignee, overdue, archived), create (with assignees), edit, doer progress update with note, 100% → "awaiting approval", approve / send back (back = 90%), assignees with responsibility shares (must total 100%), progress log, attachments, history, archive, delete (only new/not started).
- **Projects**: list with filters (status, committee, category, year, archived), create/edit, goals and milestones (add/edit/delete/reorder/mark done), notes, task weights (save / equalize / approve at exactly 100%), automatic progress (SQL view + TS mirror), "why this %" table, donut / bar / timeline charts (Recharts), overdue and not-started lists, attachments, history, archive / delete (delete only with no tasks).
- **Settings**: editable lists — meeting types, task priorities, project categories (`/settings/lookups/<kind>`).
- **Dashboard**: now 100% real data (counts, overdue + awaiting approval, status distribution, project progress, latest decisions, upcoming meetings). Mock data removed.
- Migration `20261108000000_stage2_3_committees_tasks_projects.sql`, SQL tests `004_*`, unit tests `tests/progress.test.ts` (vitest; includes the 20/30/40/10 → 70% example).

## Rules implemented in the database
- Task completion needs an approver; assignees can only change progress/status/note; a task cannot be approved by its own assignee (except super admin); 100% from the doer = "awaiting approval"; unapproved 100% counts as 99% in project progress.
- A weight distribution can be approved only at exactly 100%; any weight / task change withdraws the approval; daily progress snapshots feed the timeline.
- Sub-committee heads manage tasks/projects/meetings of the committee they head only.
- Overdue = due date passed AND still new / not started / in progress / on hold.

## Decisions to confirm with the client
- Members and administration can **see all tasks** (`tasks.view`), not only their own. Narrowing it is a policy change.
- Task statuses, meeting statuses and attendance statuses stay code + SQL constraints because they drive rules; priorities, project categories and meeting types are editable lists.
- Time zone `Africa/Algiers` (`APP_TIMEZONE`).

## Not done
- Everything is untested (see above).
- Decision → task conversion button (tasks now exist; not wired yet).
- Notifications, reports + PDF export, archive page, activity-log page, public maintenance / suggestions form, member scoring (Stage 4+).
- Kanban is read-only (status changes happen on the task page). No drag and drop.
- Project image, budget breakdown, per-project permissions beyond committee head.
- Orphaned storage files if a row is hard-deleted (rows are cleaned, objects are not).
- `shadcn/ui` not initialised; no invitation / password-reset email flow; `SUPABASE_SERVICE_ROLE_KEY` required.

## Next
1. Run the test script in `docs/QUICKSTART_TEST.md` on a separate test environment; send results + phone screenshots.
2. Fix what fails; then Stage 4 (member evaluation) — attendance and task-share data it needs is already stored.
