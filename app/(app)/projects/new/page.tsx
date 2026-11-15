import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { ProjectFields } from "@/components/projects/project-fields";
import { Section } from "@/components/ui/section";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCategories, getCommittees, getPriorities } from "@/lib/data/lookups";
import { createProject } from "../actions";

export const metadata = { title: "مشروع جديد" };

export default async function NewProjectPage() {
  const ctx = await requirePermission("projects.view");
  if (!can(ctx, "projects.manage") && !can(ctx, "projects.manage_committee")) redirect("/forbidden");
  const [committees, people, categories, priorities] = await Promise.all([getCommittees(), getActiveMembers(), getCategories(), getPriorities()]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted hover:text-forest">← المشاريع</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">مشروع جديد</h1>
        {!can(ctx, "projects.manage") ? <p className="mt-1 text-sm text-muted">يمكنك إنشاء مشاريع للجنة التي ترأسها فقط، فاختر لجنتك.</p> : null}
        <p className="mt-1 text-sm text-muted">بعد الحفظ تضيف الأهداف والمراحل والمهام وتوزّع الأوزان من صفحة المشروع.</p>
      </div>
      <Section title="بيانات المشروع">
        <div className="px-4 py-4">
          <ActionForm action={createProject} submitLabel="إنشاء المشروع" pendingLabel="جارٍ الإنشاء…">
            <ProjectFields committees={committees} people={people} categories={categories} priorities={priorities} />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
