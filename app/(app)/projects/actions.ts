"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { equalWeights } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { goalSchema, milestoneSchema, noteSchema, projectSchema } from "@/lib/validation/projects";
import { firstIssue } from "@/lib/validation/users";

// Session required here; RLS + can_manage_project() decide the rest. Blocked writes affect 0 rows → "forbidden".
async function open() {
  const ctx = await getSessionContext();
  return ctx ? { ctx, supabase: await createClient() } : null;
}
type Session = NonNullable<Awaited<ReturnType<typeof open>>>;
const uuid = z.string().uuid();
const touched = (rows: unknown[] | null) => Array.isArray(rows) && rows.length > 0;
const refresh = (id: string) => { revalidatePath(`/projects/${id}`); revalidatePath("/projects"); revalidatePath("/dashboard"); };

async function audit(s: Session, action: string, id: string, details: Record<string, unknown> = {}) {
  await s.supabase.rpc("log_action", { p_action: action, p_entity_type: "project", p_entity_id: id, p_details: details });
}

function readProject(fd: FormData) {
  return projectSchema.safeParse({
    name: fd.get("name"), description: fd.get("description"), objective: fd.get("objective"),
    committeeId: fd.get("committeeId"), ownerId: fd.get("ownerId"), categoryId: fd.get("categoryId"),
    priorityId: fd.get("priorityId"), startDate: fd.get("startDate"), endDate: fd.get("endDate"),
    budget: fd.get("budget"), status: fd.get("status") ?? "planned",
  });
}
const toRow = (v: NonNullable<ReturnType<typeof readProject>["data"]>) => ({
  name: v.name, description: v.description, objective: v.objective, committee_id: v.committeeId ?? null,
  owner_id: v.ownerId ?? null, category_id: v.categoryId ?? null, priority_id: v.priorityId ?? null,
  start_date: v.startDate ?? null, end_date: v.endDate ?? null, budget: v.budget ?? null, status: v.status,
});

export async function createProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const parsed = readProject(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { data, error } = await s.supabase.from("projects").insert(toRow(parsed.data)).select("id").single();
  if (error || !data) return { error: toArabicError(error) };
  await audit(s, "project.create", data.id as string);
  refresh(data.id as string);
  redirect(`/projects/${data.id}`);
}

export async function updateProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = readProject(fd);
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { data, error } = await s.supabase.from("projects").update(toRow(parsed.data)).eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  await audit(s, "project.update", id.data);
  refresh(id.data);
  return { ok: "تم حفظ بيانات المشروع." };
}

export async function setProjectArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const archive = fd.get("archive") === "true";
  const { data, error } = await s.supabase.from("projects")
    .update({ archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? s.ctx.userId : null })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  await audit(s, archive ? "project.archive" : "project.restore", id.data);
  refresh(id.data);
  return { ok: archive ? "تمت أرشفة المشروع." : "تمت استعادة المشروع." };
}

export async function deleteProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("projects").delete().eq("id", id.data).select("id");
  if (error) {
    if (error.code === "23503") return { error: "لا يمكن حذف مشروع ترتبط به مهام. أرشفه بدلًا من ذلك." };
    return { error: toArabicError(error) };
  }
  if (!touched(data)) return FORBIDDEN;
  await audit(s, "project.delete", id.data);
  refresh(id.data);
  redirect("/projects");
}

// ───────── Goals & milestones (ordered lists) ─────────
type OrderedTable = "project_goals" | "project_milestones";

async function appendPosition(s: Session, table: OrderedTable, projectId: string) {
  const { data } = await s.supabase.from(table).select("position").eq("project_id", projectId)
    .order("position", { ascending: false }).limit(1);
  return ((data?.[0] as { position: number } | undefined)?.position ?? 0) + 1;
}

async function move(s: Session, table: OrderedTable, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  const { data } = await s.supabase.from(table).select("id").eq("project_id", projectId.data).order("position").order("created_at");
  const items = (data ?? []) as { id: string }[];
  const i = items.findIndex((x) => x.id === id.data);
  const a = items[i]; const b = items[i + dir];
  if (i < 0 || !a || !b) return { ok: "" };
  const [r1, r2] = await Promise.all([
    s.supabase.from(table).update({ position: i + dir + 1 }).eq("id", a.id).select("id"),
    s.supabase.from(table).update({ position: i + 1 }).eq("id", b.id).select("id"),
  ]);
  if (r1.error || r2.error) return { error: toArabicError(r1.error ?? r2.error) };
  refresh(projectId.data);
  return { ok: "" };
}

export async function addGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const projectId = uuid.safeParse(fd.get("projectId"));
  const parsed = goalSchema.safeParse({ title: fd.get("title"), details: "" });
  if (!projectId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const position = await appendPosition(s, "project_goals", projectId.data);
  const { error } = await s.supabase.from("project_goals").insert({ project_id: projectId.data, title: parsed.data.title, position });
  if (error) return { error: toArabicError(error) };
  refresh(projectId.data);
  return { ok: "أُضيف الهدف." };
}

export async function updateGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  const parsed = goalSchema.safeParse({ title: fd.get("title"), details: fd.get("details") });
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { data, error } = await s.supabase.from("project_goals")
    .update({ title: parsed.data.title, details: parsed.data.details, is_met: fd.get("isMet") === "on" })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  refresh(projectId.data);
  return { ok: "تم حفظ الهدف." };
}

export async function deleteGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("project_goals").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  refresh(projectId.data);
  return { ok: "حُذف الهدف." };
}

export async function moveGoal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  return move(s, "project_goals", fd);
}

export async function addMilestone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const projectId = uuid.safeParse(fd.get("projectId"));
  const parsed = milestoneSchema.safeParse({ title: fd.get("title"), dueDate: fd.get("dueDate") });
  if (!projectId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const position = await appendPosition(s, "project_milestones", projectId.data);
  const { error } = await s.supabase.from("project_milestones")
    .insert({ project_id: projectId.data, title: parsed.data.title, due_date: parsed.data.dueDate ?? null, position });
  if (error) return { error: toArabicError(error) };
  refresh(projectId.data);
  return { ok: "أُضيفت المرحلة." };
}

export async function updateMilestone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  const parsed = milestoneSchema.safeParse({ title: fd.get("title"), dueDate: fd.get("dueDate") });
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const done = fd.get("done") === "on";
  const { data, error } = await s.supabase.from("project_milestones")
    .update({ title: parsed.data.title, due_date: parsed.data.dueDate ?? null, status: done ? "done" : "pending", done_at: done ? new Date().toISOString() : null })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  refresh(projectId.data);
  return { ok: "تم حفظ المرحلة." };
}

export async function deleteMilestone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("project_milestones").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  refresh(projectId.data);
  return { ok: "حُذفت المرحلة." };
}

export async function moveMilestone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  return move(s, "project_milestones", fd);
}

// ───────── Progress notes / reports ─────────
export async function addNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const projectId = uuid.safeParse(fd.get("projectId"));
  const parsed = noteSchema.safeParse({ body: fd.get("body") });
  if (!projectId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await s.supabase.from("project_notes").insert({ project_id: projectId.data, body: parsed.data.body });
  if (error) return { error: toArabicError(error) };
  refresh(projectId.data);
  return { ok: "أُضيفت الملاحظة." };
}

export async function deleteNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const projectId = uuid.safeParse(fd.get("projectId"));
  if (!id.success || !projectId.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("project_notes").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  refresh(projectId.data);
  return { ok: "حُذفت الملاحظة." };
}

// ───────── Task weights ─────────
/** intent: save | equalize | approve. Approval needs the distribution to total exactly 100%. */
export async function saveWeights(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open(); if (!s) return FORBIDDEN;
  const projectId = uuid.safeParse(fd.get("projectId"));
  if (!projectId.success) return { error: "معرّف غير صحيح." };
  const intent = String(fd.get("intent") ?? "save");

  const { data: tasks, error: readErr } = await s.supabase.from("tasks").select("id")
    .eq("project_id", projectId.data).neq("status", "cancelled").is("archived_at", null).order("created_at");
  if (readErr) return { error: toArabicError(readErr) };
  const ids = ((tasks ?? []) as { id: string }[]).map((t) => t.id);
  if (ids.length === 0) return { error: "لا توجد مهام في المشروع لتوزيع الأوزان عليها." };

  let weights: number[];
  if (intent === "equalize") {
    weights = equalWeights(ids.length);
  } else {
    weights = ids.map((id) => Number(String(fd.get(`weight_${id}`) ?? "0").replace(",", ".")));
    if (weights.some((w) => !Number.isFinite(w) || w < 0 || w > 100)) return { error: "كل وزن بين 0 و100." };
  }
  const total = weights.reduce((sum, w) => sum + Math.round(w * 100), 0);
  if (intent === "approve" && total !== 10000) {
    return { error: `مجموع الأوزان ${total / 100}% ويجب أن يساوي 100% قبل الاعتماد.` };
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await s.supabase.from("tasks").update({ weight: weights[i], last_update_note: null }).eq("id", ids[i]!);
    if (error) return { error: toArabicError(error) };
  }
  if (intent === "approve") {
    const { data, error } = await s.supabase.from("projects")
      .update({ weights_approved_at: new Date().toISOString() }).eq("id", projectId.data).select("id");
    if (error) return { error: toArabicError(error) };
    if (!touched(data)) return FORBIDDEN;
    await audit(s, "project.weights_approved", projectId.data, { total: total / 100 });
  } else {
    await audit(s, "project.weights_saved", projectId.data, { total: total / 100, intent });
  }
  refresh(projectId.data);
  return {
    ok: intent === "approve" ? "اعتُمد توزيع الأوزان."
      : intent === "equalize" ? "وُزّعت الأوزان بالتساوي (توزيع افتراضي قابل للتعديل)."
      : `حُفظت الأوزان. المجموع الحالي ${total / 100}%.`,
  };
}
