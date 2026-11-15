import Link from "next/link";
import { ActionForm, Field, TextArea } from "@/components/ui/action-form";
import { Section } from "@/components/ui/section";
import { requirePermission } from "@/lib/auth/session";
import { createCommittee } from "../actions";

export const metadata = { title: "لجنة فرعية جديدة" };

export default async function NewCommitteePage() {
  await requirePermission("committees.manage");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/committees" className="text-sm text-muted hover:text-forest">← اللجان الفرعية</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">لجنة فرعية جديدة</h1>
      </div>
      <Section title="بيانات اللجنة">
        <div className="px-4 py-4">
          <ActionForm action={createCommittee} submitLabel="إنشاء اللجنة" pendingLabel="جارٍ الإنشاء…">
            <Field label="اسم اللجنة" name="name" required />
            <TextArea label="وصف اللجنة" name="description" rows={3} />
            <TextArea label="اختصاصات اللجنة" name="duties" rows={4} />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
