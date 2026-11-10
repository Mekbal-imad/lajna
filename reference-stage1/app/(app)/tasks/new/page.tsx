import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { TaskFields } from "@/components/tasks/task-fields";
import { Section } from "@/components/ui/section";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getPriorities } from "@/lib/data/lookups";
import { createClient } from "@/lib/supabase/server";
import { createTask } from "../actions";

export const metadata = { title: "مهمة جديدة" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ project?: string; committee?: string }> }) {
  const ctx = await requirePermission("tasks.view");
  if (!can(ctx, "tasks.manage") && !can(ctx, "tasks.manage_committee")) redirect("/forbidden");
  const sp = await searchParams;

  const supabase = await createClient();
  const [committees, priorities, people, { data: pr }] = await Promise.all([
    getCommittees(), getPriorities(), getActiveMembers(),
    supabase.from("projects").select("id, name").is("archived_at", null).in("status", ["planned", "active", "on_hold"]).order("name"),
  ]);
  const projects = (pr ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
  const projectId = sp.project && projects.some((p) => p.id === sp.project) ? sp.project : null;
  const committeeId = sp.committee && committees.some((c) => c.id === sp.committee) ? sp.committee : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/tasks" className="text-sm text-muted hover:text-forest">← المهام</Link>
        <h1 className="mt-1 text-2xl font-bold text-forest">مهمة جديدة</h1>
        {!can(ctx, "tasks.manage") ? <p className="mt-1 text-sm text-muted">يمكنك إنشاء مهام للجنة التي ترأسها فقط، فاختر لجنتك.</p> : null}
      </div>
      <Section title="بيانات المهمة">
        <div className="px-4 py-4">
          <ActionForm action={createTask} submitLabel="إنشاء المهمة" pendingLabel="جارٍ الإنشاء…">
            <TaskFields committees={committees} projects={projects} priorities={priorities} people={people}
              values={{ projectId, committeeId }} />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
