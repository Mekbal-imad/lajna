import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, TextArea } from "@/components/ui/action-form";
import { AttachmentsSection } from "@/components/shared/attachments-section";
import { HistorySection } from "@/components/shared/history-section";
import { ProjectCharts } from "@/components/projects/project-charts";
import { ProjectFields } from "@/components/projects/project-fields";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCategories, getCommittees, getDirectory, getPriorities } from "@/lib/data/lookups";
import { formatDate, formatDateTime, todayLocal } from "@/lib/datetime";
import { OPEN_TASK_STATUSES, PROJECT_STATUS, TASK_STATUS } from "@/lib/labels";
import { effectiveProgress, projectProgress } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/errors";
import {
  addGoal, addMilestone, addNote, deleteGoal, deleteMilestone, deleteNote, deleteProject, moveGoal, moveMilestone,
  saveWeights, setProjectArchived, updateGoal, updateMilestone, updateProject,
} from "../actions";

export const metadata = { title: "تفاصيل المشروع" };

type Project = {
  id: string; name: string; description: string | null; objective: string | null; committee_id: string | null;
  owner_id: string | null; category_id: string | null; priority_id: string | null; start_date: string | null;
  end_date: string | null; budget: number | null; status: string; weights_approved_at: string | null; archived_at: string | null;
};
type TaskRow = { id: string; title: string; status: string; progress: number; weight: number; due_date: string | null; task_assignees: { user_id: string }[] };
type Goal = { id: string; title: string; details: string | null; is_met: boolean };
type Milestone = { id: string; title: string; due_date: string | null; status: string };
type Note = { id: string; body: string; author_id: string | null; created_at: string };

type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>;
function MoveButtons({ action, id, projectId }: { action: Act; id: string; projectId: string }) {
  return (
    <div className="flex gap-2">
      {(["up", "down"] as const).map((dir) => (
        <ActionForm key={dir} action={action} submitLabel={dir === "up" ? "أعلى" : "أسفل"} variant="quiet">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="dir" value={dir} />
        </ActionForm>
      ))}
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("projects.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Project;

  const [tRes, gRes, mRes, nRes, sRes, pgRes, mgr, committees, people, categories, priorities, names] = await Promise.all([
    supabase.from("tasks").select("id, title, status, progress, weight, due_date, task_assignees(user_id)").eq("project_id", id).is("archived_at", null).order("created_at"),
    supabase.from("project_goals").select("id, title, details, is_met").eq("project_id", id).order("position").order("created_at"),
    supabase.from("project_milestones").select("id, title, due_date, status").eq("project_id", id).order("position").order("created_at"),
    supabase.from("project_notes").select("id, body, author_id, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("project_progress_snapshots").select("snapshot_date, progress").eq("project_id", id).order("snapshot_date").limit(120),
    supabase.from("project_progress").select("progress, is_default_distribution, weights_total").eq("project_id", id).maybeSingle(),
    supabase.rpc("can_manage_project", { p_project: id }),
    getCommittees(), getActiveMembers(), getCategories(true), getPriorities(true), getDirectory(),
  ]);
  const tasks = ((tRes.data ?? []) as TaskRow[]).map((t) => ({ ...t, weight: Number(t.weight) }));
  const goals = (gRes.data ?? []) as Goal[];
  const milestones = (mRes.data ?? []) as Milestone[];
  const notes = (nRes.data ?? []) as Note[];
  const snapshots = ((sRes.data ?? []) as { snapshot_date: string; progress: number }[]).map((s) => ({ date: formatDate(s.snapshot_date), progress: Number(s.progress) }));
  const canManage = mgr.data === true;

  const live = tasks.filter((t) => t.status !== "cancelled");
  const calc = projectProgress(live);
  const overall = Number((pgRes.data as { progress: number } | null)?.progress ?? calc.progress);
  const today = todayLocal();
  const overdue = live.filter((t) => t.due_date && t.due_date < today && OPEN_TASK_STATUSES.includes(t.status));
  const notStarted = live.filter((t) => ["new", "not_started"].includes(t.status));
  const st = PROJECT_STATUS[p.status];
  const committee = committees.find((c) => c.id === p.committee_id)?.name;
  const category = categories.find((c) => c.id === p.category_id)?.name;
  const contribution = new Map(calc.contributions.map((c) => [c.id, c]));
  const who = (t: TaskRow) => t.task_assignees.map((a) => names.get(a.user_id) ?? "—").join("، ") || "غير مسندة";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted hover:text-forest">← المشاريع</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{p.name}</h1>
          {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
          {p.archived_at ? <StatusBadge tone="idle">مؤرشف</StatusBadge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {[committee, category, p.owner_id ? `المسؤول: ${names.get(p.owner_id) ?? "—"}` : null,
            p.start_date ? `${formatDate(p.start_date)}${p.end_date ? ` → ${formatDate(p.end_date)}` : ""}` : null,
            p.budget != null ? `الميزانية: ${Number(p.budget).toLocaleString("en-US")}` : null].filter(Boolean).join(" · ")}
        </p>
        {p.objective ? <p className="mt-2 text-sm"><span className="font-medium">الهدف: </span>{p.objective}</p> : null}
        {p.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{p.description}</p> : null}
        <div className="mt-4 max-w-md"><ProgressBar value={overall} label="نسبة إنجاز المشروع" /></div>
      </div>

      <ProjectCharts progress={overall} tasks={live.map((t) => ({ name: t.title.slice(0, 22), progress: effectiveProgress(t.status, t.progress) }))} timeline={snapshots} />

      <Section title="لماذا وصل المشروع إلى هذه النسبة؟" hint="الإنجاز = Σ(الوزن × إنجاز المهمة) ÷ Σ الأوزان">
        {live.length === 0 ? <EmptyState title="لا توجد مهام مرتبطة بالمشروع بعد." action={canManage ? "أضف مهمة من قسم المهام أدناه." : undefined} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>{["المهمة", "الوزن", "إنجاز المهمة", "مساهمتها"].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {live.map((t) => {
                    const c = contribution.get(t.id);
                    return (
                      <tr key={t.id}>
                        <td className="px-4 py-2"><Link href={`/tasks/${t.id}`} className="text-forest hover:underline">{t.title}</Link></td>
                        <td className="px-4 py-2">{calc.isDefaultDistribution ? `${Math.round((c?.share ?? 0) * 1000) / 10}% (افتراضي)` : `${t.weight}%`}</td>
                        <td className="px-4 py-2">{effectiveProgress(t.status, t.progress)}%</td>
                        <td className="px-4 py-2">{Math.round((c?.points ?? 0) * 10) / 10} نقطة</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              {calc.isDefaultDistribution
                ? "لم تُحدَّد أوزان للمهام، فتُحسب كلها بالتساوي (توزيع افتراضي قابل للتعديل)."
                : p.weights_approved_at ? `اعتُمد توزيع الأوزان في ${formatDateTime(p.weights_approved_at)}.`
                : `مجموع الأوزان الحالي ${calc.weightsTotal}% ولم يُعتمد التوزيع بعد.`}
              {" "}المهمة التي بلغت 100% ولم يُعتمد إنجازها تُحتسب 99% كحدٍّ أقصى.
            </p>
          </>
        )}
      </Section>

      {(overdue.length > 0 || notStarted.length > 0) ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="مهام متأخرة" hint={`${overdue.length}`}>
            {overdue.length === 0 ? <EmptyState title="لا توجد مهام متأخرة." /> : (
              <ul className="divide-y divide-line">{overdue.map((t) => (
                <li key={t.id} className="px-4 py-3 text-sm"><Link href={`/tasks/${t.id}`} className="text-forest hover:underline">{t.title}</Link>
                  <p className="text-xs text-st-late">{formatDate(t.due_date!)} · {who(t)}</p></li>))}</ul>
            )}
          </Section>
          <Section title="مهام لم تبدأ" hint={`${notStarted.length}`}>
            {notStarted.length === 0 ? <EmptyState title="كل المهام بدأت." /> : (
              <ul className="divide-y divide-line">{notStarted.map((t) => (
                <li key={t.id} className="px-4 py-3 text-sm"><Link href={`/tasks/${t.id}`} className="text-forest hover:underline">{t.title}</Link>
                  <p className="text-xs text-muted">{who(t)}</p></li>))}</ul>
            )}
          </Section>
        </div>
      ) : null}

      <Section title="مهام المشروع وأوزانها" hint={`${tasks.length} مهمة`}>
        {tasks.length === 0 ? <EmptyState title="لا توجد مهام." /> : canManage ? (
          <div className="px-4 py-4">
            <ActionForm action={saveWeights} submitLabel="" variant="quiet"
              intents={[
                { value: "save", label: "حفظ الأوزان", variant: "quiet" },
                { value: "equalize", label: "توزيع متساوٍ", variant: "quiet" },
                { value: "approve", label: "اعتماد التوزيع (100%)", variant: "primary" },
              ]}>
              <input type="hidden" name="projectId" value={p.id} />
              <ul className="space-y-2">
                {live.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <Link href={`/tasks/${t.id}`} className="flex-1 text-forest hover:underline">{t.title}</Link>
                    <span className="hidden text-xs text-muted sm:inline">{TASK_STATUS[t.status]?.label}</span>
                    <input name={`weight_${t.id}`} type="number" step="0.01" dir="ltr" aria-label={`وزن ${t.title}`}
                      defaultValue={String(t.weight)} className="w-24 rounded border border-line bg-white px-2 py-1" />
                    <span className="text-xs text-muted">%</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">المجموع المطلوب لاعتماد التوزيع 100%. تغيير وزن أي مهمة أو إضافة مهمة يسحب الاعتماد تلقائيًا.</p>
            </ActionForm>
          </div>
        ) : (
          <ul className="divide-y divide-line">{live.map((t) => (
            <li key={t.id} className="flex justify-between px-4 py-3 text-sm"><span>{t.title}</span><span className="text-muted">{t.weight}%</span></li>))}</ul>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-3">
            <Link href={`/tasks/new?project=${p.id}${p.committee_id ? `&committee=${p.committee_id}` : ""}`} className="text-sm text-forest hover:underline">+ مهمة جديدة لهذا المشروع</Link>
          </div>
        ) : null}
      </Section>

      <Section title="الأهداف" hint={`${goals.length}`}>
        {goals.length === 0 ? <EmptyState title="لا توجد أهداف بعد." action={canManage ? "أضف هدفًا أدناه." : undefined} /> : (
          <ul className="divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id} className="px-4 py-4">
                {canManage ? (
                  <div className="space-y-3">
                    <ActionForm action={updateGoal} submitLabel="حفظ الهدف" variant="quiet">
                      <input type="hidden" name="id" value={g.id} /><input type="hidden" name="projectId" value={p.id} />
                      <Field label="الهدف" name="title" defaultValue={g.title} required />
                      <TextArea label="تفاصيل" name="details" rows={2} defaultValue={g.details ?? ""} />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isMet" defaultChecked={g.is_met} /> تحقق الهدف</label>
                    </ActionForm>
                    <div className="flex flex-wrap gap-2">
                      <MoveButtons action={moveGoal} id={g.id} projectId={p.id} />
                      <ActionForm action={deleteGoal} submitLabel="حذف" variant="quiet" confirm="حذف هذا الهدف؟">
                        <input type="hidden" name="id" value={g.id} /><input type="hidden" name="projectId" value={p.id} />
                      </ActionForm>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm">{g.is_met ? "✓ " : ""}{g.title}{g.details ? <span className="block text-muted">{g.details}</span> : null}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={addGoal} submitLabel="إضافة هدف" variant="quiet">
              <input type="hidden" name="projectId" value={p.id} />
              <Field label="هدف جديد" name="title" required />
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="المراحل الرئيسية" hint={`${milestones.filter((m) => m.status === "done").length} من ${milestones.length} منجزة`}>
        {milestones.length === 0 ? <EmptyState title="لا توجد مراحل بعد." action={canManage ? "أضف مرحلة أدناه." : undefined} /> : (
          <ol className="divide-y divide-line">
            {milestones.map((m, i) => (
              <li key={m.id} className="px-4 py-4">
                {canManage ? (
                  <div className="space-y-3">
                    <ActionForm action={updateMilestone} submitLabel="حفظ المرحلة" variant="quiet">
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="projectId" value={p.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={`المرحلة ${i + 1}`} name="title" defaultValue={m.title} required />
                        <Field label="الموعد" name="dueDate" type="date" dir="ltr" defaultValue={m.due_date ?? ""} />
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="done" defaultChecked={m.status === "done"} /> منجزة</label>
                    </ActionForm>
                    <div className="flex flex-wrap gap-2">
                      <MoveButtons action={moveMilestone} id={m.id} projectId={p.id} />
                      <ActionForm action={deleteMilestone} submitLabel="حذف" variant="quiet" confirm="حذف هذه المرحلة؟">
                        <input type="hidden" name="id" value={m.id} /><input type="hidden" name="projectId" value={p.id} />
                      </ActionForm>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-3 text-sm">
                    <StatusBadge tone={m.status === "done" ? "ok" : "idle"}>{m.status === "done" ? "منجزة" : "قادمة"}</StatusBadge>
                    <span className="flex-1">{i + 1}. {m.title}</span>
                    <span className="text-xs text-muted">{m.due_date ? formatDate(m.due_date) : ""}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={addMilestone} submitLabel="إضافة مرحلة" variant="quiet">
              <input type="hidden" name="projectId" value={p.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="مرحلة جديدة" name="title" required />
                <Field label="الموعد (اختياري)" name="dueDate" type="date" dir="ltr" />
              </div>
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="ملاحظات وتقارير التقدم" hint={`${notes.length}`}>
        {notes.length === 0 ? <EmptyState title="لا توجد ملاحظات بعد." /> : (
          <ul className="divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span>{n.author_id ? names.get(n.author_id) ?? "مستخدم" : "—"} · {formatDateTime(n.created_at)}</span>
                  {canManage ? (
                    <ActionForm action={deleteNote} submitLabel="حذف" variant="quiet" confirm="حذف هذه الملاحظة؟">
                      <input type="hidden" name="id" value={n.id} /><input type="hidden" name="projectId" value={p.id} />
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={addNote} submitLabel="إضافة ملاحظة" variant="quiet">
              <input type="hidden" name="projectId" value={p.id} />
              <TextArea label="ملاحظة أو تقرير تقدم" name="body" rows={3} required />
            </ActionForm>
          </div>
        ) : null}
      </Section>

      {canManage ? (
        <Section title="تعديل بيانات المشروع">
          <div className="px-4 py-4">
            <ActionForm action={updateProject} submitLabel="حفظ التعديلات">
              <input type="hidden" name="id" value={p.id} />
              <ProjectFields committees={committees} people={people} categories={categories.filter((c) => c.active || c.id === p.category_id)}
                priorities={priorities.filter((x) => x.active || x.id === p.priority_id)}
                values={{ name: p.name, description: p.description, objective: p.objective, committeeId: p.committee_id, ownerId: p.owner_id,
                  categoryId: p.category_id, priorityId: p.priority_id, startDate: p.start_date, endDate: p.end_date,
                  budget: p.budget != null ? Number(p.budget) : null, status: p.status }} />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <AttachmentsSection entityType="project" entityId={p.id} canManage={canManage} />
      <HistorySection table="projects" rowId={p.id} />

      {canManage || can(ctx, "projects.delete") ? (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-3 px-4 py-4">
            {canManage ? (
              <ActionForm action={setProjectArchived} variant="quiet" submitLabel={p.archived_at ? "استعادة من الأرشيف" : "أرشفة المشروع"}
                confirm={p.archived_at ? undefined : "سيختفي المشروع من القائمة النشطة ويبقى في الأرشيف. متابعة؟"}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="archive" value={p.archived_at ? "false" : "true"} />
              </ActionForm>
            ) : null}
            {can(ctx, "projects.delete") && tasks.length === 0 ? (
              <ActionForm action={deleteProject} variant="danger" submitLabel="حذف المشروع"
                confirm={`سيُحذف المشروع نهائيًا مع أهدافه (${goals.length}) ومراحله (${milestones.length}) وملاحظاته (${notes.length}). لا يمكن التراجع. متابعة؟`}>
                <input type="hidden" name="id" value={p.id} />
              </ActionForm>
            ) : <p className="self-center text-xs text-muted">المشروع الذي ترتبط به مهام يُؤرشف ولا يُحذف.</p>}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
