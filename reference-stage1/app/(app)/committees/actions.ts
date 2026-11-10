"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { committeeSchema } from "@/lib/validation/committees";
import { membershipSchema } from "@/lib/validation/users";
import { firstIssue } from "@/lib/validation/users";

async function authorize() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.permissions.includes("committees.manage")) return null;
  return { ctx, supabase: await createClient() };
}
const uuid = z.string().uuid();

async function audit(s: NonNullable<Awaited<ReturnType<typeof authorize>>>, action: string, id: string, details: Record<string, unknown> = {}) {
  await s.supabase.rpc("log_action", { p_action: action, p_entity_type: "committee", p_entity_id: id, p_details: details });
}

export async function createCommittee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const parsed = committeeSchema.safeParse({ name: fd.get("name"), description: fd.get("description"), duties: fd.get("duties") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // slug is an internal stable key; people only see the Arabic name
  const slug = `c-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await s.supabase
    .from("committees")
    .insert({ slug, name_ar: parsed.data.name, description: parsed.data.description, duties: parsed.data.duties })
    .select("id").single();
  if (error || !data) return { error: toArabicError(error) };
  await audit(s, "committee.create", data.id as string);
  revalidatePath("/committees");
  redirect(`/committees/${data.id}`);
}

export async function updateCommittee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = committeeSchema.safeParse({ name: fd.get("name"), description: fd.get("description"), duties: fd.get("duties") });
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("committees").update({ name_ar: parsed.data.name, description: parsed.data.description, duties: parsed.data.duties })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  await audit(s, "committee.update", id.data);
  revalidatePath(`/committees/${id.data}`);
  revalidatePath("/committees");
  return { ok: "تم حفظ بيانات اللجنة." };
}

export async function setCommitteeActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const active = fd.get("active") === "true";
  const { data, error } = await s.supabase.from("committees").update({ is_active: active }).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  await audit(s, active ? "committee.activate" : "committee.deactivate", id.data);
  revalidatePath(`/committees/${id.data}`);
  revalidatePath("/committees");
  return { ok: active ? "تم تفعيل اللجنة." : "تم تعطيل اللجنة؛ لن تظهر في القوائم الجديدة وتبقى بياناتها." };
}

export async function deleteCommittee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("committees").delete().eq("id", id.data).select("id");
  if (error) {
    if (error.code === "23503") return { error: "لا يمكن حذف لجنة مرتبطة باجتماعات أو مهام أو مشاريع. عطّلها بدلًا من ذلك." };
    return { error: toArabicError(error) };
  }
  if (!data?.length) return FORBIDDEN;
  await audit(s, "committee.delete", id.data);
  revalidatePath("/committees");
  redirect("/committees");
}

export async function setCommitteeMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const parsed = membershipSchema.safeParse({
    userId: fd.get("userId"), committeeId: fd.get("committeeId"), memberRole: fd.get("memberRole"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId, committeeId, memberRole } = parsed.data;

  const { error } = await s.supabase
    .from("committee_members")
    .upsert({ committee_id: committeeId, user_id: userId, member_role: memberRole }, { onConflict: "committee_id,user_id" });
  if (error) {
    if (error.code === "23505") return { error: "لهذه اللجنة رئيس بالفعل. غيّر دور الرئيس الحالي أولًا." };
    return { error: toArabicError(error) };
  }
  await audit(s, "committee.member_set", committeeId, { userId, memberRole });
  revalidatePath(`/committees/${committeeId}`);
  return { ok: "تم حفظ العضوية." };
}

export async function removeCommitteeMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await authorize();
  if (!s) return FORBIDDEN;
  const userId = uuid.safeParse(fd.get("userId"));
  const committeeId = uuid.safeParse(fd.get("committeeId"));
  if (!userId.success || !committeeId.success) return { error: "بيانات غير صحيحة." };
  const { data, error } = await s.supabase
    .from("committee_members").delete().eq("user_id", userId.data).eq("committee_id", committeeId.data).select("user_id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  await audit(s, "committee.member_removed", committeeId.data, { userId: userId.data });
  revalidatePath(`/committees/${committeeId.data}`);
  return { ok: "أُزيل العضو من اللجنة." };
}
