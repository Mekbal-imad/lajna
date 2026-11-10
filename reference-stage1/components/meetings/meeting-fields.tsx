import { Field, Select } from "@/components/ui/action-form";
import type { Option } from "@/lib/data/lookups";

export type MeetingValues = {
  title?: string; meetingTypeId?: string | null; committeeId?: string | null;
  scheduledAt?: string; location?: string | null; status?: string;
};

export function MeetingFields({
  types, committees, values = {}, showStatus,
}: { types: Option[]; committees: Option[]; values?: MeetingValues; showStatus?: boolean }) {
  return (
    <>
      <Field label="عنوان الاجتماع" name="title" defaultValue={values.title} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="نوع الاجتماع" name="meetingTypeId" placeholder="بلا نوع"
          defaultValue={values.meetingTypeId ?? ""} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        <Select label="اللجنة" name="committeeId" placeholder="اللجنة كاملة (بلا لجنة فرعية)"
          defaultValue={values.committeeId ?? ""} options={committees.map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="التاريخ والوقت" name="scheduledAt" type="datetime-local" dir="ltr"
          defaultValue={values.scheduledAt} required />
        <Field label="المكان" name="location" defaultValue={values.location ?? ""} />
      </div>
      {showStatus ? (
        <Select label="الحالة" name="status" defaultValue={values.status ?? "scheduled"} options={[
          { value: "scheduled", label: "مجدول" }, { value: "held", label: "منعقد" }, { value: "cancelled", label: "ملغى" },
        ]} />
      ) : null}
    </>
  );
}
