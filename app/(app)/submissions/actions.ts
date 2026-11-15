"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { SUBMISSION_STATUS } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";

// Session needed here; RLS (submissions.manage) decides what is actually written.
async function open() {
  const ctx = await getSessionContext();
  return ctx ? { ctx, supabase: await createClient() } : null;
}
const uuid = z.string().uuid();
const refresh = (id: string) => { revalidatePath(`/submissions/${id}`); revalidatePath("/submissions"); };

export async function updateSubmission(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const status = z.string().refine((v) => v in SUBMISSION_STATUS).safeParse(fd.get("status"));
  const assigned = z.preprocess((v) => (v === "" ? null : v), uuid.nullable()).safeParse(fd.get("assignedTo"));
  if (!id.success || !status.success || !assigned.success) return { error: "بيانات غير صحيحة." };

  const { data, error } = await s.supabase.from("submissions")
    .update({ status: status.data, assigned_to: assigned.data }).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  refresh(id.data);
  return { ok: "تم حفظ التعديلات." };
}

export async function setSubmissionArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const archive = fd.get("archive") === "true";
  const { data, error } = await s.supabase.from("submissions")
    .update({ archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? s.ctx.userId : null })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  refresh(id.data);
  return { ok: archive ? "تمت الأرشفة." : "تمت الاستعادة." };
}

export async function addSubmissionNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const body = z.string().trim().min(2, "اكتب الملاحظة.").max(5000, "الملاحظة طويلة جدًا.").safeParse(fd.get("body"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!body.success) return { error: body.error.issues[0]?.message ?? "بيانات غير صحيحة." };
  const { error } = await s.supabase.from("submission_notes")
    .insert({ submission_id: id.data, author_id: s.ctx.userId, body: body.data });
  if (error) return { error: toArabicError(error) };
  refresh(id.data);
  return { ok: "أُضيفت الملاحظة." };
}

/** Creates a task from the submission and links it (RLS decides who may create tasks). */
export async function convertToTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const committee = z.preprocess((v) => (v === "" ? null : v), uuid.nullable()).safeParse(fd.get("committeeId"));
  const title = z.string().trim().min(3, "عنوان المهمة قصير.").max(300).safeParse(fd.get("title"));
  if (!id.success || !committee.success) return { error: "بيانات غير صحيحة." };
  if (!title.success) return { error: title.error.issues[0]?.message ?? "بيانات غير صحيحة." };

  const { data: sub } = await s.supabase.from("submissions")
    .select("ref, details, status, task_id").eq("id", id.data).maybeSingle();
  if (!sub) return FORBIDDEN;
  if (sub.task_id) return { error: "تم تحويل هذه الرسالة إلى مهمة من قبل." };

  const { data: task, error } = await s.supabase.from("tasks").insert({
    title: title.data, description: `${sub.details ?? ""}\n\n(مصدر المهمة: الرسالة ${sub.ref})`.trim(),
    committee_id: committee.data, status: "new", created_by: s.ctx.userId,
  }).select("id").single();
  if (error || !task) return { error: toArabicError(error) };

  const nextStatus = ["new", "under_review", "accepted"].includes(sub.status as string) ? "in_progress" : sub.status;
  const { error: linkError } = await s.supabase.from("submissions")
    .update({ task_id: task.id, status: nextStatus }).eq("id", id.data);
  if (linkError) return { error: `أُنشئت المهمة لكن تعذّر ربطها: ${toArabicError(linkError)}` };
  refresh(id.data);
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}
