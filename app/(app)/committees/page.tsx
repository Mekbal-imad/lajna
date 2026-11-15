import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getDirectory } from "@/lib/data/lookups";
import { OPEN_TASK_STATUSES } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "اللجان الفرعية" };

type C = { id: string; name_ar: string; description: string | null; head_id: string | null; is_active: boolean };

export default async function CommitteesPage() {
  const ctx = await requirePermission("committees.view");
  const supabase = await createClient();
  const [cRes, mRes, tRes, pRes, names] = await Promise.all([
    supabase.from("committees").select("id, name_ar, description, head_id, is_active").order("name_ar"),
    supabase.from("committee_members").select("committee_id"),
    supabase.from("tasks").select("committee_id").is("archived_at", null).in("status", [...OPEN_TASK_STATUSES, "awaiting_approval"]),
    supabase.from("projects").select("committee_id").is("archived_at", null).in("status", ["planned", "active", "on_hold"]),
    getDirectory(),
  ]);
  const count = (rows: { committee_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    (rows ?? []).forEach((r) => r.committee_id && m.set(r.committee_id, (m.get(r.committee_id) ?? 0) + 1));
    return m;
  };
  const members = count(mRes.data as { committee_id: string }[] | null);
  const tasks = count(tRes.data as { committee_id: string | null }[] | null);
  const projects = count(pRes.data as { committee_id: string | null }[] | null);
  const committees = (cRes.data ?? []) as C[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest">اللجان الفرعية</h1>
          <p className="mt-1 text-sm text-muted">أعضاء كل لجنة ومهامها ومشاريعها.</p>
        </div>
        {can(ctx, "committees.manage") ? (
          <Link href="/committees/new" className="flex items-center gap-2 rounded bg-forest px-4 py-2 text-sm text-ivory hover:bg-forest-700">
            <Plus size={16} /> لجنة جديدة
          </Link>
        ) : null}
      </div>
      {committees.length === 0 ? (
        <div className="border border-line bg-white"><EmptyState title="لا توجد لجان فرعية." action={can(ctx, "committees.manage") ? "أنشئ أول لجنة." : undefined} /></div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => (
            <li key={c.id} className="border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/committees/${c.id}`} className="font-display text-lg font-semibold text-forest hover:underline">{c.name_ar}</Link>
                {!c.is_active ? <StatusBadge tone="idle">معطّلة</StatusBadge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{c.head_id ? `الرئيس: ${names.get(c.head_id) ?? "—"}` : "بلا رئيس"}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[["الأعضاء", members.get(c.id) ?? 0], ["مهام مفتوحة", tasks.get(c.id) ?? 0], ["مشاريع جارية", projects.get(c.id) ?? 0]].map(([l, v]) => (
                  <div key={String(l)} className="bg-canvas py-2"><dd className="font-display text-xl font-bold text-forest">{v}</dd><dt className="text-xs text-muted">{l}</dt></div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
