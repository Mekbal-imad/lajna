import { Field, Select, TextArea } from "@/components/ui/action-form";
import type { Option } from "@/lib/data/lookups";
import { TASK_STATUS } from "@/lib/labels";

export type TaskValues = {
  title?: string; description?: string | null; committeeId?: string | null; projectId?: string | null;
  priorityId?: string | null; startDate?: string | null; dueDate?: string | null; weight?: number; status?: string;
};

/** Statuses a manager can pick directly. Completion goes through approval; awaiting_approval comes from 100%. */
const MANAGER_STATUSES = ["new", "not_started", "in_progress", "on_hold", "cancelled"];

export function TaskFields({
  committees, projects, priorities, people, values = {}, editing,
}: {
  committees: Option[]; projects: Option[]; priorities: Option[]; people?: Option[]; values?: TaskValues; editing?: boolean;
}) {
  const current = values.status ?? "new";
  const statuses = Object.entries(TASK_STATUS).filter(([k]) => MANAGER_STATUSES.includes(k) || k === current);
  return (
    <>
      <Field label="عنوان المهمة" name="title" defaultValue={values.title} required />
      <TextArea label="الوصف" name="description" rows={3} defaultValue={values.description ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="اللجنة المسؤولة" name="committeeId" placeholder="غير محددة" defaultValue={values.committeeId ?? ""}
          options={committees.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="المشروع" name="projectId" placeholder="مهمة مستقلة (بلا مشروع)" defaultValue={values.projectId ?? ""}
          options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="الأولوية" name="priorityId" placeholder="غير محددة" defaultValue={values.priorityId ?? ""}
          options={priorities.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="الحالة" name="status" defaultValue={current}
          options={statuses.filter(([k]) => editing || k !== "cancelled").map(([value, v]) => ({ value, label: v.label }))} />
        <Field label="تاريخ البداية" name="startDate" type="date" dir="ltr" defaultValue={values.startDate ?? ""} />
        <Field label="الموعد النهائي" name="dueDate" type="date" dir="ltr" defaultValue={values.dueDate ?? ""} />
        <Field label="وزن المهمة داخل المشروع (%)" name="weight" type="number" dir="ltr" defaultValue={String(values.weight ?? 0)}
          hint="يُضبط عادةً من صفحة المشروع. المجموع المطلوب 100%." />
      </div>
      {people && !editing ? (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium">المكلّفون بالتنفيذ</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="assignee" value={p.id} /> {p.name}</label>
            ))}
          </div>
          <p className="text-xs text-muted">تُقسَّم المسؤولية بالتساوي ويمكن تعديل النسب بعد الإنشاء.</p>
        </fieldset>
      ) : null}
    </>
  );
}
