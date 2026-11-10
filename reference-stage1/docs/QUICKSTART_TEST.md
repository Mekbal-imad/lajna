# Quick start — a separate TEST environment (recommended way to start using this version)

The production instance already has its own `meetings` schema, so this package should **not** be applied on top of it. Create a second, empty environment instead:

1. **Supabase**: new project (e.g. `lajna-test`). SQL Editor → run every file in `supabase/migrations/` in filename order (5 files). Authentication → Providers: email on, public sign-ups off.
2. **First admin**: Authentication → Users → add a user, then in the SQL Editor:
   ```sql
   insert into public.user_roles (user_id, role_id)
   select '<USER_UUID>', id from public.roles where code = 'super_admin';
   ```
3. **Vercel**: new project from this code. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), optional `APP_TIMEZONE`.
4. **Local checks before/after deploy**: `npm install && npm run typecheck && npm test && npm run build`. Database tests: `supabase/tests/001…004` on the test DB.
5. **Create test data from the UI** (this is the point of the exercise): users with different roles → a committee with a head → a task assigned to a member → a project with 3–4 tasks and weights → approve weights → update progress as the member → approve completion as another user.

## Manual test script (mark each pass/fail in PROJECT_STATUS.md)
Committees
- [ ] Create a committee, add 2 members, set one as head (a 2nd head must be refused), edit description, deactivate, try deleting a committee that has tasks (must be refused).
Tasks
- [ ] As chair: create a task with 2 assignees (shares 50/50); change shares to 60/60 (must be refused: total ≠ 100).
- [ ] As the assignee: set 40% with a note; try to edit the title (must fail); set 100% → status becomes "بانتظار الاعتماد".
- [ ] As the assignee: try to approve own task (must be impossible). As another approver: approve; progress locks at 100% and approval is stamped.
- [ ] Overdue: a task with a past due date shows "متأخرة" only while open; a task awaiting approval is not overdue; a future task is not overdue.
- [ ] Table, board view and filters (committee, priority, assignee, status, overdue); archive and restore; delete only while "new / not started".
Projects
- [ ] Create a project with goals and milestones; reorder; mark done; edit; add a note.
- [ ] Link 4 tasks, set weights 20/30/40/10, approve (works only at exactly 100). Set progress 100/100/50/0 (approved) → project shows **70%** and the "why this %" table shows each task's contribution.
- [ ] Change one weight → approval is withdrawn automatically.
- [ ] Charts render on phone and desktop; the timeline gains a point after progress changes on another day.
- [ ] Archive / restore; delete is refused while tasks exist.
Settings
- [ ] Add / rename / deactivate a priority, a project category and a meeting type; the forms reflect the change immediately.
Dashboard
- [ ] Counts, overdue list, awaiting-approval line, project progress, latest decisions and upcoming meetings match the data you created.
Permissions (use 3 accounts: chair, sub-committee head, plain member)
- [ ] Member cannot create tasks/projects or edit others' tasks; sub head works only inside their own committee; hidden sidebar items are also blocked by direct URL.
