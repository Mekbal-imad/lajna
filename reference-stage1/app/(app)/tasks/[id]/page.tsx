import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, TextArea } from "@/components/ui/action-form";
import { AttachmentsSection } from "@/components/shared/attachments-section";
import { HistorySection } from "@/components/shared/history-section";
import { TaskFields } from "@/components/tasks/task-fields";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getDirectory, getPriorities } from "@/lib/data/lookups";
import { formatDate, formatDateTime, todayLocal } from "@/lib/datetime";
import { DOER_TASK_STATUSES, OPEN_TASK_STATUSES, TASK_STATUS } from "@/lib/labels";
import { equalWeights } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { decideCompletion, deleteTask, setTaskArchived, setTaskAssignees, updateTask, updateTaskProgress } from "../actions";

export const metadata = { title: "تفاصيل المهمة" };

type Task = {
  id: string; title: string; description: string | null; committee_id: string | null; project_id: string | null;
  priority_id: string | null; start_date: string | null; due_date: string | null; status: string; progress: number;
  weight: number; completion_approved_at: string | null; completion_approved_by: string | null; archived_at: string | null;
};
type Log = { id: string; user_id: string | null; old_progress: number | null; new_progress: number | null; old_status: string | null; new_status: string | null; note: string | null; created_at: string };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("tasks.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Task;

  const [aRes, lRes, mgr, appr, own, committees, priorities, people, names, { data: pr }] = await Promise.all([
    supabase.from("task_assignees").select("user_id, share_pct").eq("task_id", id),
    supabase.from("task_progress_updates").select("*").eq("task_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.rpc("can_manage_task", { p_task: id }),
    supabase.rpc("can_approve_task", { p_task: id }),
    supabase.rpc("is_task_assignee", { p_task: id }),
    getCommittees(), getPriorities(true), getActiveMembers(), getDirectory(),
    supabase.from("projects").select("id, name").order("name"),
  ]);
  const assignees = (aRes.data ?? []) as { user_id: string; share_pct: number }[];
  const log = (lRes.data ?? []) as Log[];
  const projects = (pr ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
  const canManage = mgr.data === true;
  const isAssignee = own.data === true && can(ctx, "tasks.update_own");
  // Approver rights come from the database; the UI also hides the panel from a task's own assignees
  // (the DB trigger blocks self-approval except for the super admin).
  const canApprove = appr.data === true && (!assignees.some((x) => x.user_id === ctx.userId) || ctx.permissions.includes("roles.manage"));
  const closed = t.status === "completed" || t.status === "cancelled";
  const canUpdate = (canManage || isAssignee) && !closed;
  const st = TASK_STATUS[t.status];
  const late = !!t.due_date && t.due_date < todayLocal() && OPEN_TASK_STATUSES.includes(t.status);
  const project = projects.find((p) => p.id === t.project_id);
  const committee = committees.find((c) => c.id === t.committee_id);
  const priority = priorities.find((p) => p.id === t.priority_id);
  const doerStatuses = Array.from(new Set([...DOER_TASK_STATUSES, t.status])).filter((s) => TASK_STATUS[s] && s !== "completed" && s !== "cancelled");
  const assigned = new Set(assignees.map((a) => a.user_id));
  const eq = equalWeights(Math.max(1, assigned.size));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/tasks" className="text-sm text-muted hover:text-forest">← المهام</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{t.title}</h1>
          {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
          {late ? <StatusBadge tone="late">متأخرة</StatusBadge> : null}
          {t.archived_at ? <StatusBadge tone="idle">مؤرشفة</StatusBadge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {[committee?.name, project ? `مشروع: ${project.name}` : null, priority ? `الأولوية: ${priority.name}` : null,
            t.due_date ? `الموعد: ${formatDate(t.due_date)}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 max-w-sm"><ProgressBar value={t.progress} label="نسبة الإنجاز" /></div>
        {t.completion_approved_at ? (
          <p className="mt-2 text-xs text-muted">
            اعتُمد الإنجاز في {formatDateTime(t.completion_approved_at)}
            {t.completion_approved_by ? ` بواسطة ${names.get(t.completion_approved_by) ?? "مستخدم"}` : ""}
          </p>
        ) : null}
        {t.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{t.description}</p> : null}
      </div>

      {t.status === "awaiting_approval" && canApprove ? (
        <Section title="اعتماد الإنجاز">
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-muted">بلغت المهمة 100% بانتظار التحقق. لا تُحتسب مكتملة إلا بعد الاعتماد.</p>
            <ActionForm action={decideCompletion} submitLabel="" variant="quiet"
              intents={[{ value: "approve", label: "اعتماد الإنجاز", variant: "primary" }, { value: "reject", label: "إعادة للتنفيذ", variant: "danger" }]}>
              <input type="hidden" name="id" value={t.id} />
              <TextArea label="ملاحظة (مطلوبة عند الإعادة)" name="note" rows={2} />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      {canUpdate ? (
        <Section title="تحديث التقدم">
          <div className="px-4 py-4">
            <ActionForm action={updateTaskProgress} submitLabel="حفظ التقدم">
              <input type="hidden" name="id" value={t.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="نسبة الإنجاز (0–100)" name="progress" type="number" dir="ltr" defaultValue={String(t.progress)} required />
                <Select label="الحالة" name="status" defaultValue={t.status}
                  options={doerStatuses.map((s) => ({ value: s, label: TASK_STATUS[s]?.label ?? s }))} />
              </div>
              <TextArea label="ملاحظات الإنجاز / إثبات التنفيذ" name="note" rows={2} hint="عند بلوغ 100% تنتقل المهمة إلى «بانتظار الاعتماد»." />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      {canManage ? (
        <Section title="تعديل المهمة">
          <div className="px-4 py-4">
            <ActionForm action={updateTask} submitLabel="حفظ التعديلات">
              <input type="hidden" name="id" value={t.id} />
              <TaskFields committees={committees.filter(() => true)} projects={projects} priorities={priorities.filter((p) => p.active || p.id === t.priority_id)} editing
                values={{ title: t.title, description: t.description, committeeId: t.committee_id, projectId: t.project_id,
                  priorityId: t.priority_id, startDate: t.start_date, dueDate: t.due_date, weight: Number(t.weight), status: t.status }} />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <Section title="المكلّفون ونسب المسؤولية" hint={assignees.length > 1 ? "المجموع 100%" : undefined}>
        {canManage ? (
          <div className="px-4 py-4">
            <ActionForm action={setTaskAssignees} submitLabel="حفظ المكلّفين" variant="quiet">
              <input type="hidden" name="id" value={t.id} />
              <ul className="space-y-2">
                {people.map((p) => {
                  const a = assignees.find((x) => x.user_id === p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <label className="flex flex-1 items-center gap-2"><input type="checkbox" name="assignee" value={p.id} defaultChecked={!!a} /> {p.name}</label>
                      <input name={`share_${p.id}`} type="number" dir="ltr" step="0.01" aria-label={`نسبة ${p.name}`}
                        defaultValue={a ? String(a.share_pct) : String(eq[0] ?? 100)} className="w-24 rounded border border-line bg-white px-2 py-1" />
                      <span className="text-xs text-muted">%</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted">نسب المكلّفين المحدَّدين يجب أن تساوي 100% حتى لا تُحتسب المهمة كاملة لكل واحد منهم.</p>
            </ActionForm>
          </div>
        ) : assignees.length === 0 ? <EmptyState title="لم تُسند المهمة بعد." /> : (
          <ul className="divide-y divide-line">
            {assignees.map((a) => (
              <li key={a.user_id} className="flex justify-between px-4 py-3 text-sm"><span>{names.get(a.user_id) ?? "مستخدم"}</span><span className="text-muted">{a.share_pct}%</span></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="سجل التقدم" hint={`${log.length}`}>
        {log.length === 0 ? <EmptyState title="لا توجد تحديثات بعد." /> : (
          <ul className="divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="px-4 py-3 text-sm">
                <p>
                  {l.old_progress}% ← {l.new_progress}%
                  {l.old_status !== l.new_status ? ` · ${TASK_STATUS[l.old_status ?? ""]?.label ?? l.old_status} ← ${TASK_STATUS[l.new_status ?? ""]?.label ?? l.new_status}` : ""}
                </p>
                {l.note ? <p className="mt-0.5 text-muted">{l.note}</p> : null}
                <p className="text-xs text-muted">{l.user_id ? names.get(l.user_id) ?? "مستخدم" : "النظام"} · {formatDateTime(l.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AttachmentsSection entityType="task" entityId={t.id} canManage={canManage || isAssignee} />
      <HistorySection table="tasks" rowId={t.id} />

      {canManage ? (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-3 px-4 py-4">
            <ActionForm action={setTaskArchived} variant="quiet" submitLabel={t.archived_at ? "استعادة من الأرشيف" : "أرشفة المهمة"}>
              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="archive" value={t.archived_at ? "false" : "true"} />
            </ActionForm>
            {["new", "not_started"].includes(t.status) ? (
              <ActionForm action={deleteTask} variant="danger" submitLabel="حذف المهمة" confirm="ستُحذف هذه المهمة نهائيًا. متابعة؟">
                <input type="hidden" name="id" value={t.id} />
              </ActionForm>
            ) : <p className="self-center text-xs text-muted">المهمة التي بدأ العمل فيها تُؤرشف ولا تُحذف.</p>}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
