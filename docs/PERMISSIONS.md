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
