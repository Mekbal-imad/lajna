import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  addMembership, removeMembership, setActive, setUserRoles, updateProfile,
} from "../actions";

export const metadata = { title: "بيانات المستخدم" };

type Membership = { member_role: "head" | "member"; committees: { id: string; name_ar: string } | null };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("users.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [profileRes, rolesRes, userRolesRes, committeesRes, membersRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, is_active").eq("id", id).maybeSingle(),
    supabase.from("roles").select("id, code, name_ar").order("name_ar"),
    supabase.from("user_roles").select("role_id").eq("user_id", id),
    supabase.from("committees").select("id, name_ar").eq("is_active", true).order("name_ar"),
    supabase.from("committee_members").select("member_role, committees(id, name_ar)").eq("user_id", id),
  ]);
  const profile = profileRes.data as { id: string; full_name: string; phone: string | null; is_active: boolean } | null;
  if (!profile) notFound();

  const roles = (rolesRes.data ?? []) as { id: string; code: string; name_ar: string }[];
  const assigned = new Set((userRolesRes.data ?? []).map((r: { role_id: string }) => r.role_id));
  const committees = (committeesRes.data ?? []) as { id: string; name_ar: string }[];
  const memberships = (membersRes.data ?? []) as unknown as Membership[];

  // Email lives in auth.users, which RLS-bound clients cannot read.
  let email: string | null = null;
  if (can(ctx, "users.manage")) {
    try {
      const { data } = await createAdminClient().auth.admin.getUserById(id);
      email = data.user?.email ?? null;
    } catch {
      email = null;
    }
  }

  const isSelf = id === ctx.userId;
  const canEdit = can(ctx, "users.manage");
  const canRoles = can(ctx, "roles.assign") && !isSelf;
  const canCommittees = can(ctx, "committees.manage");
  const isSuper = can(ctx, "roles.manage");
  const memberOf = new Set(memberships.map((m) => m.committees?.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/users" className="text-sm text-muted hover:text-forest">← المستخدمون</Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{profile.full_name}</h1>
          <StatusBadge tone={profile.is_active ? "ok" : "idle"}>{profile.is_active ? "نشط" : "معطّل"}</StatusBadge>
        </div>
        {email ? <p className="mt-1 text-sm text-muted" dir="ltr">{email}</p> : null}
      </div>

      <Section title="البيانات الأساسية">
        <div className="px-4 py-4">
          {canEdit ? (
            <ActionForm action={updateProfile} submitLabel="حفظ البيانات">
              <input type="hidden" name="id" value={profile.id} />
              <Field label="الاسم الكامل" name="fullName" defaultValue={profile.full_name} required />
              <Field label="الهاتف" name="phone" defaultValue={profile.phone ?? ""} dir="ltr" />
            </ActionForm>
          ) : (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted">الاسم</dt><dd>{profile.full_name}</dd></div>
              <div><dt className="text-muted">الهاتف</dt><dd dir="ltr" className="text-start">{profile.phone ?? "—"}</dd></div>
            </dl>
          )}
        </div>
      </Section>

      <Section title="الأدوار" hint={isSelf ? "لا يمكنك تعديل أدوارك بنفسك" : undefined}>
        <div className="px-4 py-4">
          {canRoles ? (
            <ActionForm action={setUserRoles} submitLabel="حفظ الأدوار">
              <input type="hidden" name="id" value={profile.id} />
              <ul className="space-y-2">
                {roles.map((r) => {
                  const locked = r.code === "super_admin" && !isSuper;
                  return (
                    <li key={r.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="roleId" value={r.id} defaultChecked={assigned.has(r.id)} disabled={locked} />
                        {r.name_ar}
                        {locked ? <span className="text-xs text-muted">(لمدير النظام فقط)</span> : null}
                      </label>
                      {locked && assigned.has(r.id) ? <input type="hidden" name="roleId" value={r.id} /> : null}
                    </li>
                  );
                })}
              </ul>
            </ActionForm>
          ) : (
            <p className="text-sm">
              {roles.filter((r) => assigned.has(r.id)).map((r) => r.name_ar).join("، ") || "بلا دور"}
            </p>
          )}
        </div>
      </Section>

      <Section title="اللجان">
        <div className="space-y-4 px-4 py-4">
          {memberships.length === 0 ? <p className="text-sm text-muted">غير مرتبط بأي لجنة.</p> : (
            <ul className="divide-y divide-line">
              {memberships.map((m) => (
                <li key={m.committees?.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1">{m.committees?.name_ar}</span>
                  <StatusBadge tone={m.member_role === "head" ? "info" : "idle"}>
                    {m.member_role === "head" ? "رئيس اللجنة" : "عضو"}
                  </StatusBadge>
                  {canCommittees && m.committees ? (
                    <ActionForm action={removeMembership} submitLabel="إزالة" variant="quiet" confirm="هل تريد إزالة هذه العضوية؟">
                      <input type="hidden" name="userId" value={profile.id} />
                      <input type="hidden" name="committeeId" value={m.committees.id} />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canCommittees ? (
            <ActionForm action={addMembership} submitLabel="حفظ العضوية" variant="quiet" className="border-t border-line pt-4">
              <input type="hidden" name="userId" value={profile.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="committeeId" className="mb-1 block text-sm font-medium">اللجنة</label>
                  <select id="committeeId" name="committeeId" required defaultValue="" className="w-full rounded border border-line bg-white px-3 py-2 text-sm">
                    <option value="" disabled>اختر لجنة</option>
                    {committees.map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar}{memberOf.has(c.id) ? " (تعديل الدور)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="memberRole" className="mb-1 block text-sm font-medium">الصفة</label>
                  <select id="memberRole" name="memberRole" defaultValue="member" className="w-full rounded border border-line bg-white px-3 py-2 text-sm">
                    <option value="member">عضو</option>
                    <option value="head">رئيس اللجنة</option>
                  </select>
                </div>
              </div>
            </ActionForm>
          ) : null}
        </div>
      </Section>

      {canEdit && !isSelf ? (
        <Section title="حالة الحساب">
          <div className="px-4 py-4">
            <p className="mb-3 text-sm text-muted">
              {profile.is_active
                ? "تعطيل الحساب يمنع صاحبه من الدخول ولا يحذف بياناته."
                : "الحساب معطّل حاليًا ولا يستطيع صاحبه الدخول."}
            </p>
            <ActionForm
              action={setActive}
              submitLabel={profile.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}
              variant={profile.is_active ? "danger" : "primary"}
              confirm={profile.is_active ? "هل تريد تعطيل هذا الحساب؟" : undefined}
            >
              <input type="hidden" name="id" value={profile.id} />
              <input type="hidden" name="active" value={profile.is_active ? "false" : "true"} />
            </ActionForm>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
