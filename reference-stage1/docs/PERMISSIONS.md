# Roles & permissions (phases 1–2)

Roles are separate from permissions; the mapping lives in `role_permissions` and can be edited without code changes. Enforcement: RLS policies (`has_permission()`), DB triggers, and server-side checks in server actions. UI hiding is convenience only.

| Permission | super_admin | chair | vice_chair | secretary | administration |
|---|:-:|:-:|:-:|:-:|:-:|
| dashboard.view_all | ✓ | ✓ | ✓ | ✓ | ✓ |
| users.view | ✓ | ✓ | ✓ | ✓ | |
| users.manage | ✓ | | | | |
| roles.manage | ✓ | | | | |
| roles.assign | ✓ | | | | |
| committees.manage | ✓ | ✓ | | | |
| audit.view | ✓ | ✓ | | | |

`sub_head` and `member` have no admin permissions yet (committee-scoped permissions arrive with tasks, phase 4). Teachers / the public have no account and use the public form only (phase 5).

## Invariants enforced in the database
- No one can change their own roles (`guard_user_roles`).
- Only a super admin can grant or revoke `super_admin`; the last super admin cannot be removed.
- `profiles.is_active` can only be changed with `users.manage`.
- `audit_logs` has no INSERT policy: rows are written through `log_action()` only.
- One head per committee (partial unique index); `committees.head_id` is kept in sync by trigger.
- Bootstrap exception: statements run without a JWT user (SQL editor, migrations) skip the self-edit / super-admin checks so the first admin can be created.

## Known limitation
`users.manage` can set a password for a new user and deactivate accounts, but there is no email invitation / reset flow yet.

## Stage 1 additions (meetings & decisions)
| Permission | super_admin | chair | vice_chair | secretary | sub_head | member | administration |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| meetings.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| meetings.manage | ✓ | ✓ | ✓ | ✓ | | | |
| meetings.manage_committee | | | | | ✓ | | |
| meetings.delete | ✓ | ✓ | | | | | |
| decisions.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| decisions.manage | ✓ | ✓ | ✓ | ✓ | | | |
| decisions.approve | ✓ | ✓ | | | | | |
| settings.manage | ✓ | ✓ | | | | | |

- `meetings.manage_committee`: a sub-committee head manages meetings of the committee they head (`is_committee_head()`), enforced in RLS via `can_manage_meeting()`.
- Approving a decision, editing the text of an approved decision, or moving it back to "proposed" needs `decisions.approve` (`guard_decision` trigger).
- Approved minutes cannot be edited until approval is withdrawn (`guard_meeting`). Held meetings and meetings with approved minutes cannot be deleted; decisions beyond "proposed" cannot be deleted. Archive instead.
- Change history (`change_history`) is written by triggers only; readable with `audit.view`, or by managers of the same entity type.
- Names of all active members are exposed (names only) through the `member_directory` view so attendance lists are readable without `users.view`.

## Stages 2–3 additions (committees, tasks, projects)
| Permission | super_admin | chair | vice_chair | secretary | sub_head | member | administration |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| committees.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks.manage | ✓ | ✓ | ✓ | ✓ | | | |
| tasks.manage_committee | | | | | ✓ | | |
| tasks.update_own | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| tasks.approve | ✓ | ✓ | ✓ | | (own committee) | | |
| projects.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects.manage | ✓ | ✓ | ✓ | ✓ | | | |
| projects.manage_committee | | | | | ✓ | | |
| projects.delete | ✓ | ✓ | | | | | |

- Sub-committee heads manage and approve tasks only for the committee they head (`can_manage_task`, `can_approve_task`).
- Assignees (with `tasks.update_own`) may change only progress, status (not completed / cancelled) and the note — enforced by `guard_task`.
- An approver cannot approve a task they are assigned to (super admin excepted).
