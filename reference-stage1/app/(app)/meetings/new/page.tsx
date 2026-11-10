import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { MeetingFields } from "@/components/meetings/meeting-fields";
import { Section } from "@/components/ui/section";
import { can, requirePermission } from "@/lib/auth/session";
import { getCommittees, getMeetingTypes } from "@/lib/data/lookups";
import { createMeeting } from "../actions";

export const metadata = { title: "اجتماع جديد" };

export default async function NewMeetingPage() {
  const ctx = await requirePermission("meetings.view");
  if (!can(ctx, "meetings.manage") && !can(ctx, "meetings.manage_committee")) redirect("/forbidden");
  const [types, committees] = await Promise.all([getMeetingTypes(), getCommittees()]);
  const onlyOwnCommittee = !can(ctx, "meetings.manage");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/meetings" className="text-sm text-muted hover:text-forest">← الاجتماعات</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">اجتماع جديد</h1>
        {onlyOwnCommittee ? (
          <p className="mt-1 text-sm text-muted">يمكنك إنشاء اجتماعات للجنة الفرعية التي ترأسها فقط، فاختر لجنتك.</p>
        ) : null}
      </div>
      <Section title="بيانات الاجتماع">
        <div className="px-4 py-4">
          <ActionForm action={createMeeting} submitLabel="إنشاء الاجتماع" pendingLabel="جارٍ الإنشاء…">
            <MeetingFields types={types} committees={committees} />
            <fieldset className="space-y-1 text-sm">
              <legend className="mb-1 font-medium">دعوة الأعضاء</legend>
              <label className="flex items-center gap-2"><input type="radio" name="invite" value="none" defaultChecked /> لا أحد الآن (أدعوهم لاحقًا)</label>
              <label className="flex items-center gap-2"><input type="radio" name="invite" value="committee" /> أعضاء اللجنة المحددة أعلاه</label>
              <label className="flex items-center gap-2"><input type="radio" name="invite" value="all" /> جميع المستخدمين النشطين</label>
            </fieldset>
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
