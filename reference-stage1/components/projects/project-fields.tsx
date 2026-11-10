import { Field, Select, TextArea } from "@/components/ui/action-form";
import type { Option } from "@/lib/data/lookups";
import { PROJECT_STATUS } from "@/lib/labels";

export type ProjectValues = {
  name?: string; description?: string | null; objective?: string | null; committeeId?: string | null;
  ownerId?: string | null; categoryId?: string | null; priorityId?: string | null; startDate?: string | null;
  endDate?: string | null; budget?: number | null; status?: string;
};

export function ProjectFields({
  committees, people, categories, priorities, values = {},
}: { committees: Option[]; people: Option[]; categories: Option[]; priorities: Option[]; values?: ProjectValues }) {
  return (
    <>
      <Field label="اسم المشروع" name="name" defaultValue={values.name} required />
      <TextArea label="وصف المشروع" name="description" rows={3} defaultValue={values.description ?? ""} />
      <TextArea label="الهدف العام" name="objective" rows={2} defaultValue={values.objective ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="اللجنة المشرفة" name="committeeId" placeholder="غير محددة" defaultValue={values.committeeId ?? ""}
          options={committees.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="المسؤول" name="ownerId" placeholder="غير محدد" defaultValue={values.ownerId ?? ""}
          options={people.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label="التصنيف" name="categoryId" placeholder="بلا تصنيف" defaultValue={values.categoryId ?? ""}
          options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="الأولوية" name="priorityId" placeholder="غير محددة" defaultValue={values.priorityId ?? ""}
          options={priorities.map((p) => ({ value: p.id, label: p.name }))} />
        <Field label="تاريخ البداية" name="startDate" type="date" dir="ltr" defaultValue={values.startDate ?? ""} />
        <Field label="تاريخ النهاية المتوقع" name="endDate" type="date" dir="ltr" defaultValue={values.endDate ?? ""} />
        <Field label="الميزانية" name="budget" type="number" dir="ltr" defaultValue={values.budget != null ? String(values.budget) : ""} />
        <Select label="الحالة" name="status" defaultValue={values.status ?? "planned"}
          options={Object.entries(PROJECT_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
      </div>
    </>
  );
}
