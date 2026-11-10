# Next steps for the developer — committee management platform

Read this first, then the two original requirement documents (DEVELOPMENT PROMPT + "dynamic system" addendum) that come with this package. Where they disagree with this file, the original documents win.

## 0. Situation
- Production (Vercel + Supabase) already runs: login, dashboard, users (roles, committee membership), and a **meetings** section with one saved meeting. "Decisions" and the rest are still "قريبًا".
- The meetings section in production was **not** built from `reference-stage1/` (different page structure, fields and statuses). So there are two implementations: the deployed one, and the reference one in this package.
- `reference-stage1/` is an **untested** draft by the assistant (syntax-checked only). It covers phases 1–2 and Stage 1 (meetings, agenda, attendance, minutes, decisions, attachments, change history, meeting-types settings). Use it as a reference to port from; do not assume it runs.
- **Do NOT run `reference-stage1/supabase/migrations/20261106000000_stage1_meetings_decisions.sql` on the production DB as is:** `meetings` already exists there with different columns and it will conflict.

> **Update (Stages 2–3 added to the reference):** `reference-stage1/` now also contains committees, tasks (approval workflow, responsibility shares), projects (weights, automatic progress, charts), editable lookups and a real-data dashboard, plus `docs/QUICKSTART_TEST.md` (separate test environment + manual test script) and `tests/progress.test.ts`. Still **untested**. The remaining stages below are therefore: finish/verify 1–3, then 4–7. Decision → task conversion is not wired yet.

## 1. Ground rules (from the requirements)
1. Never rebuild what exists. Keep stack, structure, palette (#173F32, #F1EBDD, #B69A62, #F7F7F3), Tajawal/Cairo, full RTL, light theme.
2. **Fully dynamic**: every entity is created / read / updated / archived (and deleted where allowed) from the UI. No hard-coded business data. A button must exist only if it works.
3. Permissions enforced in the database (RLS + triggers) and re-checked in server actions. Hiding buttons is not security.
4. No hard delete of meaningful records (approved decisions, held meetings…): archive / soft delete; confirm before deleting anything linked to other rows.
5. History of important changes: who, when, before, after, reason for sensitive operations.
6. Operational values are settings, not code: scoring weights, criteria, priorities, task statuses, meeting types, report periods, progress rules (with validation).
7. Don't claim a feature works until it was run and tested. Update `PROJECT_STATUS.md` after every stage with a pass/fail checklist.
8. No fake data in production; demo/seed data only in dev and clearly labelled.

## 2. Step A — audit and reconcile (before any new feature)
1. Report what the repo and DB contain: tables, columns, policies, pages, server actions, what works.
2. Compare with `reference-stage1/` and decide, per piece, **keep / port / replace**:
   - Meetings: needs agenda items with a discussion text, attendance per invited member (statuses `pending/present/late/excused/absent`; **no row = not invited**, required for fair scoring), minutes with approval lock, attachments (private bucket + signed URLs), archive, change history, meeting types editable in settings.
   - Decisions: auto number `YYYY-NNN`, statuses `proposed/approved/in_progress/executed/postponed/cancelled`, approval needs its own permission, approved decisions cannot be hard-deleted (archive only), link to meeting, responsible committee, assignee, due date, attachments, history.
3. Simplest path if production data is only test data: reset a dev project, apply the reference migrations, fix what breaks, then re-deploy. Otherwise write an additive migration that converts the existing tables.
4. Write the decision in `PROJECT_STATUS.md`.

## 3. Remaining work, in this order (do not start a stage before the previous one is verified)
### Stage 1 — finish: meetings, attendance, minutes, decisions
Everything in Step A, plus tests: RLS tests (member read-only; sub-committee head manages only the committee they head; approve rights; locked minutes; undeletable approved decision) — see `supabase/tests/003_*.sql` in the reference.

### Stage 2 — sub-committees and tasks
- Committees pages: CRUD, head, members, description, linked meetings/tasks/projects/reports; new committees without code changes.
- Tasks: title, description, committee, responsible + participants, priority, created/start/due dates, status, progress 0–100, weight, attachments, update log (`task_progress_updates`).
- Priorities and statuses are editable lookups (with a "terminal/completed" flag).
- Table view + Kanban; filters by committee, responsible, priority, status; overdue view.
- Completion must be **approved** by an authorised person; a member changing the status alone does not complete it.
- "Overdue" = due date passed and not approved-complete; tasks not yet due are never overdue.
- Shared tasks: store each assignee's responsibility share (or split fairly) so a task is not counted fully for each person.
- Members update only their own tasks; sub-committee heads manage their committee's tasks (RLS).
- Decision → task conversion; unlock "create task" from decisions.

### Stage 3 — annual projects and automatic progress
- Project CRUD: name, description, goals (add/edit/delete), committee, responsible, dates, budget, priority, status, image/attachments, milestones (add/edit/delete/reorder), reports/notes, archive/restore.
- Tasks linked to a project with a **weight**; weights must total 100 when a distribution is approved; offer an equal default clearly marked as default.
- Progress = Σ(weight × task progress) ÷ Σ(weights). Computed automatically (DB view/function), never typed manually. Test with the example: weights 20/30/40/10, progress 100/100/50/0 → **70%**.
- Project page: overall %, progress bar, donut, task-progress comparison bar chart, weekly progress timeline (snapshots), status distribution, task list with weight/progress/owner/status, milestones, overdue tasks, not-started tasks, and an explanation of why the project is at its current %. Charts with Recharts, on brand colours, mobile-friendly.
- Dashboard widgets switch from demo data to real data as each module lands.

### Stage 4 — member evaluation
- Settings (editable by super admin / authorised role): weights default **attendance 30 / participation 20 / tasks 50**, must total 100; late-arrival policy; criteria text for the 0–5 participation scale (0 none … 5 outstanding) shown before a score is recorded.
- Attendance score: only meetings the member was invited to; excused absence is not penalised; no undocumented automatic deductions.
- Participation: per member per meeting, 0–5 + reason, recorded by meeting chair/authorised user (who/when), edit history, no self-scoring.
- Task score: by task weight, progress, on-time, approved completion, documented delay reason; shared tasks by responsibility share; tasks not yet due not counted late; **a member with no tasks is not penalised** (exclude/neutral, never 0).
- Final score /100, plus component scores, counts (meetings invited/attended, tasks assigned/completed/late) and evolution over time. Computed from source data, **stored as snapshots with their sources** (`performance_snapshots`), not typed numbers.
- Page "تقييم الأعضاء": member table, total, ranking (visibility configurable; **hidden by default**), member detail, period comparison (month / quarter / year), charts, per-member report, review/objection flow, corrections by permission. Purpose is motivation, not punishment.
- Unit tests for the scoring maths and edge cases (excused absence, not invited, no tasks, shared task, not-yet-due task).

### Stage 5 — maintenance and public suggestions/complaints
- Maintenance reports: title, place, fault type, severity, photos, reporter, owner, estimated/actual cost, status flow (new → under review → approved → in progress → fixed / rejected); one-click "create maintenance task".
- Public form (no account): type (suggestion/complaint/note), subject, details, department, optional anonymity (if policy allows), optional file, optional contact, **reference number**, public link + QR code. Protect against spam and unsafe files: rate limiting/captcha, server-side validation, type/size limits, private storage.
- Admin inbox: classify, review, assign, status, internal notes, convert to task or project.

### Stage 6 — notifications, reports, archive, activity log
- In-app notifications (task assigned, due soon, overdue, status changes, meeting created, decision approved, new maintenance report, project updated) with read/unread page.
- Reports: weekly / monthly / quarterly / yearly, per committee, overdue tasks, maintenance, projects, decisions, member performance; print + PDF export.
- Archive: central search/filter by date, type, committee; restore.
- Activity-log page (audit.view) with filters.

### Stage 7 — hardening and release
Full functional + RLS test pass, mobile and desktop, performance, security review (service-role key server-only, upload limits, rate limits), production Supabase config, deployment notes.

## 4. Acceptance for every module
A user with permission can: create an item, open it, edit its details, save, and see the effect in related pages (dashboard, reports, charts). Wrong users are blocked **by the database**. Errors and success messages are in Arabic. Works on phone and desktop. Docs and `PROJECT_STATUS.md` updated.

## 5. UI bugs seen in production (iPhone Safari) — fix first
1. The date-time input is wider than the other fields and overflows the card.
2. The meeting date renders scrambled (`06.2026/11/`): bidi problem. Format dates with `Intl.DateTimeFormat('ar-u-nu-latn', …)` or wrap them in `<bdi dir="ltr">`.
3. `<select>` renders as rounded pills while inputs are square, and the form sits in a double border. Reset appearance and use one consistent control style.
CSS for 1 and 3 is already in `reference-stage1/app/globals.css`.

## 6. How to report back (so progress can be checked)
After each stage send: the updated `PROJECT_STATUS.md`, the migrations added, the pass/fail result of the manual test steps (create → open → edit → save → effect elsewhere → blocked for an unauthorised role), and phone screenshots of the new pages.
