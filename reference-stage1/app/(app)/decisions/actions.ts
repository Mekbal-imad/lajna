"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { PROTECTED_DECISION_STATUSES } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { decisionSchema } from "@/lib/validation/decisions";
import { firstIssue } from "@/lib/validation/users";

// Same model as meetings: session required here, RLS + guard_decision() decide in the database.
async function open() {
  const ctx = await getSessionContext();
  return ctx ? { ctx, supabase: await createClient() } : null;
}
const uuid = z.string().uuid();

async function audit(supabase: Awaited<ReturnType<typeof createClient>>, action: string, id: string, details: Record<string, unknown> = {}) {
  await supabase.rpc("log_action", { p_action: action, p_entity_type: "decision", p_entity_id: id, p_details: details });
}

function readForm(fd: FormData) {
  return decisionSchema.safeParse({
    title: fd.get("title"), details: fd.get("details"), meetingId: fd.get("meetingId"),
    decidedOn: fd.get("decidedOn"), committeeId: fd.get("committeeId"), assigneeId: fd.get("assigneeId"),
    dueDate: fd.get("dueDate"), status: fd.get("status") ?? "proposed", reason: fd.get("reason"),
  });
}

const toRow = (v: NonNullable<ReturnType<typeof readForm>["data"]>) => ({
  title: v.title, details: v.details, meeting_id: v.meetingId ?? null, decided_on: v.decidedOn,
  committee_id: v.committeeId ?? null, assignee_id: v.assigneeId ?? null, due_date: v.dueDate ?? null, status: v.status,
});

export async function createDecision(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const parsed = readForm(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase.from("decisions").insert(toRow(parsed.data)).select("id").single();
  if (error || !data) return { error: toArabicError(error) };
  await audit(s.supabase, "decision.create", data.id as string, { status: parsed.data.status });
  revalidatePath("/decisions");
  redirect(`/decisions/${data.id}`);
}

export async function updateDecision(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = readForm(fd);
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data: existing } = await s.supabase.from("decisions").select("status").eq("id", id.data).maybeSingle();
  if (!existing) return FORBIDDEN;
  const sensitive = PROTECTED_DECISION_STATUSES.includes(existing.status as string);
  if (sensitive && (!parsed.data.reason || parsed.data.reason.length < 3)) {
    return { error: "اكتب سبب التعديل؛ هذا القرار معتمد وتُسجَّل تعديلاته." };
  }

  const { data, error } = await s.supabase.from("decisions").update(toRow(parsed.data)).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;

  await audit(s.supabase, "decision.update", id.data, { reason: parsed.data.reason, from: existing.status, to: parsed.data.status });
  revalidatePath(`/decisions/${id.data}`);
  revalidatePath("/decisions");
  return { ok: "تم حفظ التعديلات." };
}

export async function setDecisionArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const archive = fd.get("archive") === "true";

  const { data, error } = await s.supabase
    .from("decisions")
    .update({ archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? s.ctx.userId : null })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  await audit(s.supabase, archive ? "decision.archive" : "decision.restore", id.data);
  revalidatePath(`/decisions/${id.data}`);
  revalidatePath("/decisions");
  return { ok: archive ? "تمت أرشفة القرار." : "تمت استعادة القرار." };
}

export async function deleteDecision(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };

  const { data, error } = await s.supabase.from("decisions").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return { error: "لا يمكن حذف هذا القرار. القرارات التي تجاوزت مرحلة «مقترح» تُؤرشف ولا تُحذف." };
  await audit(s.supabase, "decision.delete", id.data);
  revalidatePath("/decisions");
  redirect("/decisions");
}
