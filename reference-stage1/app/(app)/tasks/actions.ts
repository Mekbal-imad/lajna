"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { equalWeights } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { progressSchema, taskSchema } from "@/lib/validation/tasks";
import { firstIssue } from "@/lib/validation/users";

// Session required here; RLS + guard_task() decide what the user may actually change.
async function open() {
  const ctx = await getSessionContext();
  return ctx ? { ctx, supabase: await createClient() } : null;
}
type Session = NonNullable<Awaited<ReturnType<typeof open>>>;
const uuid = z.string().uuid();

async function audit(s: Session, action: string, id: string, details: Record<string, unknown> = {}) {
  await s.supabase.rpc("log_action", { p_action: action, p_entity_type: "task", p_entity_id: id, p_details: details });
}
function refresh(id: string, projectId?: string | null) {
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function readTask(fd: FormData) {
  return taskSchema.safeParse({
    title: fd.get("title"), description: fd.get("description"), committeeId: fd.get("committeeId"),
    projectId: fd.get("projectId"), priorityId: fd.get("priorityId"), startDate: fd.get("startDate"),
    dueDate: fd.get("dueDate"), weight: fd.get("weight"), status: fd.get("status") ?? "new",
  });
}
const toRow = (v: NonNullable<ReturnType<typeof readTask>["data"]>) => ({
  title: v.title, description: v.description, committee_id: v.committeeId ?? null, project_id: v.projectId ?? null,
  priority_id: v.priorityId ?? null, start_date: v.startDate ?? null, due_date: v.dueDate ?? null, weight: v.weight,
});

export async function createTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const parsed = readTask(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("tasks").insert({ ...toRow(parsed.data), status: parsed.data.status }).select("id").single();
  if (error || !data) return { error: toArabicError(error) };
  const id = data.id as string;

  const people = z.array(uuid).safeParse(fd.getAll("assignee"));
  if (people.success && people.data.length) {
    const shares = equalWeights(people.data.length);
    const { error: aErr } = await s.supabase.from("task_assignees")
      .insert(people.data.map((user_id, i) => ({ task_id: id, user_id, share_pct: shares[i] ?? 100 })));
    if (aErr) return { error: `أُنشئت المهمة لكن تعذّر إسنادها: ${toArabicError(aErr)}` };
  }
  await audit(s, "task.create", id);
  refresh(id, parsed.data.projectId);
  redirect(`/tasks/${id}`);
}

export async function updateTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = readTask(fd);
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("tasks").update({ ...toRow(parsed.data), status: parsed.data.status, last_update_note: null }).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  await audit(s, "task.update", id.data);
  refresh(id.data, parsed.data.projectId);
  return { ok: "تم حفظ التعديلات." };
}

export async function updateTaskProgress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = progressSchema.safeParse({ progress: fd.get("progress"), status: fd.get("status"), note: fd.get("note") });
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("tasks")
    .update({ progress: parsed.data.progress, status: parsed.data.status, last_update_note: parsed.data.note })
    .eq("id", id.data).select("id, status, project_id");
  if (error) return { error: toArabicError(error) };
  const row = data?.[0] as { id: string; status: string; project_id: string | null } | undefined;
  if (!row) return FORBIDDEN;
  refresh(id.data, row.project_id);
  return {
    ok: row.status === "awaiting_approval"
      ? "سُجّل التقدم. بلغت المهمة 100% وهي الآن بانتظار اعتماد الإنجاز."
      : "تم تحديث التقدم.",
  };
}

/** Approve or send back a submitted task. Sending back resets progress to 90% so it must be re-submitted. */
export async function decideCompletion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const approve = fd.get("decision") === "approve";
  const note = z.string().trim().max(1000).safeParse(fd.get("note") ?? "");
  if (!note.success) return { error: "الملاحظة طويلة جدًا." };
  if (!approve && note.data.length < 3) return { error: "اكتب سبب إعادة المهمة للتنفيذ." };

  const patch = approve
    ? { status: "completed", last_update_note: note.data || "اعتُمد الإنجاز" }
    : { status: "in_progress", progress: 90, last_update_note: `أُعيدت للتنفيذ: ${note.data}` };
  const { data, error } = await s.supabase.from("tasks").update(patch).eq("id", id.data).select("id, project_id");
  if (error) return { error: toArabicError(error) };
  const row = data?.[0] as { project_id: string | null } | undefined;
  if (!row) return FORBIDDEN;
  await audit(s, approve ? "task.completion_approved" : "task.completion_rejected", id.data, { note: note.data });
  refresh(id.data, row.project_id);
  return { ok: approve ? "اعتُمد إنجاز المهمة." : "أُعيدت المهمة للتنفيذ." };
}

export async function setTaskAssignees(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const people = z.array(uuid).safeParse(fd.getAll("assignee"));
  if (!id.success || !people.success) return { error: "بيانات غير صحيحة." };

  const rows = people.data.map((user_id) => {
    const raw = Number(String(fd.get(`share_${user_id}`) ?? "").replace(",", "."));
    return { task_id: id.data, user_id, share_pct: Number.isFinite(raw) ? raw : NaN };
  });
  if (rows.some((r) => Number.isNaN(r.share_pct) || r.share_pct <= 0 || r.share_pct > 100)) {
    return { error: "نسبة مسؤولية كل مكلّف بين 1 و100." };
  }
  const total = rows.reduce((sum, r) => sum + Math.round(r.share_pct * 100), 0);
  if (rows.length > 0 && total !== 10000) {
    return { error: `مجموع نسب المسؤولية ${total / 100}% ويجب أن يساوي 100%.` };
  }

  const { data: current, error: readErr } = await s.supabase.from("task_assignees").select("user_id").eq("task_id", id.data);
  if (readErr) return { error: toArabicError(readErr) };
  const keep = new Set(rows.map((r) => r.user_id));
  const removed = ((current ?? []) as { user_id: string }[]).map((c) => c.user_id).filter((u) => !keep.has(u));

  if (removed.length) {
    const { error } = await s.supabase.from("task_assignees").delete().eq("task_id", id.data).in("user_id", removed);
    if (error) return { error: toArabicError(error) };
  }
  if (rows.length) {
    const { error } = await s.supabase.from("task_assignees").upsert(rows, { onConflict: "task_id,user_id" });
    if (error) return { error: toArabicError(error) };
  }
  await audit(s, "task.assignees_changed", id.data, { count: rows.length });
  refresh(id.data);
  return { ok: "تم حفظ المكلّفين." };
}

export async function setTaskArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const archive = fd.get("archive") === "true";
  const { data, error } = await s.supabase
    .from("tasks").update({ archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? s.ctx.userId : null, last_update_note: null })
    .eq("id", id.data).select("id, project_id");
  if (error) return { error: toArabicError(error) };
  const row = data?.[0] as { project_id: string | null } | undefined;
  if (!row) return FORBIDDEN;
  await audit(s, archive ? "task.archive" : "task.restore", id.data);
  refresh(id.data, row.project_id);
  return { ok: archive ? "تمت أرشفة المهمة." : "تمت استعادة المهمة." };
}

export async function deleteTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("tasks").delete().eq("id", id.data).select("id, project_id");
  if (error) return { error: toArabicError(error) };
  const row = data?.[0] as { project_id: string | null } | undefined;
  if (!row) return { error: "لا يمكن حذف مهمة بدأ العمل فيها. أرشفها بدلًا من ذلك." };
  await audit(s, "task.delete", id.data);
  refresh(id.data, row.project_id);
  redirect("/tasks");
}
