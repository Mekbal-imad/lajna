"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import {
  createUserSchema, firstIssue, membershipSchema, passwordSchema, updateProfileSchema,
} from "@/lib/validation/users";
import { z } from "zod";

/** Returns the session only if it holds `code`; RLS re-checks everything at the database. */
async function authorize(code: string) {
  const ctx = await getSessionContext();
  return ctx && ctx.permissions.includes(code) ? ctx : null;
}

async function audit(action: string, entityId: string, details: Record<string, unknown> = {}) {
  const supabase = await createClient();
  await supabase.rpc("log_action", {
    p_action: action, p_entity_type: "profile", p_entity_id: entityId, p_details: details,
  });
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("users.manage");
  if (!ctx) return FORBIDDEN;

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone") ?? "",
    roleId: formData.get("roleId") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { fullName, email, password, phone, roleId } = parsed.data;

  if (roleId && !ctx.permissions.includes("roles.assign")) return FORBIDDEN;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error || !data.user) return { error: toArabicError(error) };
  const newId = data.user.id;

  const supabase = await createClient();
  if (phone) {
    const { error: phoneErr } = await supabase.from("profiles").update({ phone }).eq("id", newId);
    if (phoneErr) return { error: `أُنشئ الحساب لكن تعذّر حفظ الهاتف: ${toArabicError(phoneErr)}` };
  }
  if (roleId) {
    const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: newId, role_id: roleId });
    if (roleErr) return { error: `أُنشئ الحساب لكن تعذّر تعيين الدور: ${toArabicError(roleErr)}` };
  }
  await audit("user.create", newId, { roleId: roleId ?? null });
  revalidatePath("/users");
  redirect(`/users/${newId}`);
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await authorize("users.manage"))) return FORBIDDEN;
  const parsed = updateProfileSchema.safeParse({
    id: formData.get("id"), fullName: formData.get("fullName"), phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", parsed.data.id);
  if (error) return { error: toArabicError(error) };

  await audit("user.update", parsed.data.id);
  revalidatePath(`/users/${parsed.data.id}`);
  return { ok: "تم حفظ البيانات." };
}

export async function setActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("users.manage");
  if (!ctx) return FORBIDDEN;
  const id = z.string().uuid().safeParse(formData.get("id"));
  const active = formData.get("active") === "true";
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (id.data === ctx.userId) return { error: "لا يمكنك تعطيل حسابك بنفسك." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id.data);
  if (error) return { error: toArabicError(error) };

  await audit(active ? "user.activate" : "user.deactivate", id.data);
  revalidatePath(`/users/${id.data}`);
  revalidatePath("/users");
  return { ok: active ? "تم تفعيل الحساب." : "تم تعطيل الحساب." };
}

export async function setUserRoles(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("roles.assign");
  if (!ctx) return FORBIDDEN;
  const userId = z.string().uuid().safeParse(formData.get("id"));
  const wanted = z.array(z.string().uuid()).safeParse(formData.getAll("roleId"));
  if (!userId.success || !wanted.success) return { error: "بيانات غير صحيحة." };
  if (userId.data === ctx.userId) return { error: "لا يمكنك تعديل أدوارك بنفسك." };

  const supabase = await createClient();
  const { data: current, error: readErr } = await supabase
    .from("user_roles").select("role_id").eq("user_id", userId.data);
  if (readErr) return { error: toArabicError(readErr) };

  const have = new Set((current ?? []).map((r) => r.role_id as string));
  const want = new Set(wanted.data);
  const toAdd = [...want].filter((r) => !have.has(r));
  const toRemove = [...have].filter((r) => !want.has(r));

  if (toRemove.length) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId.data).in("role_id", toRemove);
    if (error) return { error: toArabicError(error) };
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from("user_roles").insert(toAdd.map((role_id) => ({ user_id: userId.data, role_id })));
    if (error) return { error: toArabicError(error) };
  }

  await audit("user.roles_changed", userId.data, { added: toAdd, removed: toRemove });
  revalidatePath(`/users/${userId.data}`);
  revalidatePath("/users");
  return { ok: "تم تحديث الأدوار." };
}

export async function addMembership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await authorize("committees.manage"))) return FORBIDDEN;
  const parsed = membershipSchema.safeParse({
    userId: formData.get("userId"), committeeId: formData.get("committeeId"), memberRole: formData.get("memberRole"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId, committeeId, memberRole } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("committee_members")
    .upsert({ committee_id: committeeId, user_id: userId, member_role: memberRole }, { onConflict: "committee_id,user_id" });
  if (error) {
    // The unique index allows one head per committee.
    if (error.code === "23505") return { error: "لهذه اللجنة رئيس بالفعل. أزله أولًا أو غيّر دوره." };
    return { error: toArabicError(error) };
  }

  await audit("committee.member_set", userId, { committeeId, memberRole });
  revalidatePath(`/users/${userId}`);
  return { ok: "تم حفظ العضوية." };
}

export async function removeMembership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await authorize("committees.manage"))) return FORBIDDEN;
  const userId = z.string().uuid().safeParse(formData.get("userId"));
  const committeeId = z.string().uuid().safeParse(formData.get("committeeId"));
  if (!userId.success || !committeeId.success) return { error: "بيانات غير صحيحة." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("committee_members").delete().eq("user_id", userId.data).eq("committee_id", committeeId.data);
  if (error) return { error: toArabicError(error) };

  await audit("committee.member_removed", userId.data, { committeeId: committeeId.data });
  revalidatePath(`/users/${userId.data}`);
  return { ok: "تمت إزالة العضوية." };
}

export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return FORBIDDEN;
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "تعذّر تغيير كلمة المرور. حاول مرة أخرى." };
  return { ok: "تم تغيير كلمة المرور." };
}
