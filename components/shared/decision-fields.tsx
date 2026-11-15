import { Field, Select, TextArea } from "@/components/ui/action-form";
import type { Option } from "@/lib/data/lookups";
import { DECISION_STATUS, PROTECTED_DECISION_STATUSES } from "@/lib/labels";

export type DecisionValues = {
  title?: string; details?: string | null; meetingId?: string | null; decidedOn?: string;
  committeeId?: string | null; assigneeId?: string | null; dueDate?: string | null; status?: string;
};

export function DecisionFields({
  meetings, committees, people, canApprove, values = {}, editing,
}: {
  meetings: Option[]; committees: Option[]; people: Option[]; canApprove: boolean;
  values?: DecisionValues; editing?: boolean;
}) {
  const current = values.status ?? "proposed";
  // Approving needs `decisions.approve` (enforced by the database); only offer what the user may set.
  const statuses = Object.entries(DECISION_STATUS).filter(
    ([k]) => canApprove || k === current || !PROTECTED_DECISION_STATUSES.includes(k),
  );
  const needsReason = editing && PROTECTED_DECISION_STATUSES.includes(current);

  return (
    <>
      <Field label="عنوان القرار" name="title" defaultValue={values.title} required />
      <TextArea label="تفاصيل القرار" name="details" defaultValue={values.details ?? ""} rows={5} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="الاجتماع الذي صدر عنه" name="meetingId" placeholder="بلا اجتماع"
          defaultValue={values.meetingId ?? ""} options={meetings.map((m) => ({ value: m.id, label: m.name }))} />
        <Field label="تاريخ القرار" name="decidedOn" type="date" dir="ltr" defaultValue={values.decidedOn} required />
        <Select label="الجهة المسؤولة عن التنفيذ" name="committeeId" placeholder="غير محددة"
          defaultValue={values.committeeId ?? ""} options={committees.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="الشخص المكلف" name="assigneeId" placeholder="غير محدد"
          defaultValue={values.assigneeId ?? ""} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        <Field label="تاريخ الاستحقاق" name="dueDate" type="date" dir="ltr" defaultValue={values.dueDate ?? ""} />
        <Select label="الحالة" name="status" defaultValue={current}
          options={statuses.map(([value, v]) => ({ value, label: v.label }))} />
      </div>
      {needsReason ? (
        <Field label="سبب التعديل (مطلوب لقرار معتمد)" name="reason" required
          hint="يُسجَّل السبب مع اسمك وتاريخ التعديل." />
      ) : null}
    </>
  );
}
