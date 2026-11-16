"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const refresh = (id: string) => { revalidatePath(`/duty/${id}`); revalidatePath("/duty"); };

export async function setShortageStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await getSessionContext())) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const status = z.enum(["open", "handled"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return { error: "بيانات غير صحيحة." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("duty_reports").update({ shortage_status: status.data }).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!data?.length) return FORBIDDEN;
  refresh(id.data);
  return { ok: status.data === "handled" ? "سُجّل أن النقص عولج." : "أُعيد فتح النقص." };
}

/** Turns the reported shortage / fault into a task (RLS decides who may create tasks). */
export async function convertShortageToTask(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const committee = z.preprocess((v) => (v === "" ? null : v), uuid.nullable()).safeParse(fd.get("committeeId"));
  const title = z.string().trim().min(3, "عنوان المهمة قصير.").max(300).safeParse(fd.get("title"));
  if (!id.success || !committee.success) return { error: "بيانات غير صحيحة." };
  if (!title.success) return { error: title.error.issues[0]?.message ?? "بيانات غير صحيحة." };

  const supabase = await createClient();
  const { data: rep } = await supabase.from("duty_reports").select("duty_date, shortages, task_id").eq("id", id.data).maybeSingle();
  if (!rep) return FORBIDDEN;
  if (rep.task_id) return { error: "تم تحويل هذا النقص إلى مهمة من قبل." };

  const { data: task, error } = await supabase.from("tasks").insert({
    title: title.data, description: `${rep.shortages ?? ""}\n\n(مصدر المهمة: تقرير المداومة ليوم ${rep.duty_date})`.trim(),
    committee_id: committee.data, status: "new", created_by: ctx.userId,
  }).select("id").single();
  if (error || !task) return { error: toArabicError(error) };

  const { error: linkError } = await supabase.from("duty_reports").update({ task_id: task.id, shortage_status: "handled" }).eq("id", id.data);
  if (linkError) return { error: `أُنشئت المهمة لكن تعذّر ربطها: ${toArabicError(linkError)}` };
  refresh(id.data);
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}
