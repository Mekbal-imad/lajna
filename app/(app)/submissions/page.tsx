import Link from "next/link";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/datetime";
import { SUBMISSION_KIND, SUBMISSION_STATUS } from "@/lib/submissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "الاقتراحات والبلاغات" };

type Row = {
  id: string; ref: string; kind: string; title: string; status: string; urgent: boolean; area: string | null;
  submitter_name: string | null; submitter_role: string | null; submitted_at: string;
};
type Search = { q?: string; kind?: string; status?: string; urgent?: string; view?: string };
const escapeLike = (s: string) => s.replace(/[\\%_,()]/g, (c) => `\\${c}`);

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("submissions.view");
  const sp = await searchParams;
  const archived = sp.view === "archived";

  const supabase = await createClient();
  let query = supabase
    .from("submissions")
    .select("id, ref, kind, title, status, urgent, area, submitter_name, submitter_role, submitted_at")
    .order("submitted_at", { ascending: false }).limit(300);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (sp.q?.trim()) {
    const q = escapeLike(sp.q.trim());
    query = query.or(`title.ilike.%${q}%,details.ilike.%${q}%,submitter_name.ilike.%${q}%,ref.ilike.%${q}%`);
  }
  if (sp.kind && sp.kind in SUBMISSION_KIND) query = query.eq("kind", sp.kind);
  if (sp.status && sp.status in SUBMISSION_STATUS) query = query.eq("status", sp.status);
  if (sp.urgent === "1") query = query.eq("urgent", true);

  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const sel = "rounded border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">الاقتراحات والبلاغات</h1>
        <p className="mt-1 text-sm text-muted">الرسائل الواردة من نموذج التواصل: اقتراحات وشكاوى وملاحظات واستفسارات.</p>
      </div>

      <div className="flex gap-2 text-sm">
        <Link href="/submissions" className={cn("rounded px-3 py-1.5", !archived ? "bg-forest text-ivory" : "border border-line")}>النشطة</Link>
        <Link href="/submissions?view=archived" className={cn("rounded px-3 py-1.5", archived ? "bg-forest text-ivory" : "border border-line")}>الأرشيف</Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <input name="q" defaultValue={sp.q} placeholder="بحث في العنوان أو الاسم أو الرقم" className={cn(sel, "min-w-56")} />
        <select name="kind" defaultValue={sp.kind ?? ""} className={sel}>
          <option value="">كل الأنواع</option>
          {Object.entries(SUBMISSION_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={sel}>
          <option value="">كل الحالات</option>
          {Object.entries(SUBMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="urgent" value="1" defaultChecked={sp.urgent === "1"} /> العاجلة فقط
        </label>
        <button className="rounded bg-forest px-4 py-2 text-sm text-ivory">تصفية</button>
      </form>

      {error ? <p role="alert" className="border border-st-late bg-white p-3 text-sm">تعذّر تحميل الرسائل.</p> : null}

      <Section title={archived ? "الرسائل المؤرشفة" : "الرسائل الواردة"} hint={`${rows.length} رسالة`}>
        {rows.length === 0 ? (
          <EmptyState title="لا توجد رسائل مطابقة." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory text-muted">
                <tr>
                  <th className="p-3 text-start">الرقم</th><th className="p-3 text-start">النوع</th>
                  <th className="p-3 text-start">العنوان</th><th className="p-3 text-start">المرسل</th>
                  <th className="p-3 text-start">المجال</th><th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-start">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const kind = SUBMISSION_KIND[r.kind];
                  const st = SUBMISSION_STATUS[r.status];
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-3 whitespace-nowrap" dir="ltr">{r.ref}</td>
                      <td className="p-3">{kind ? <StatusBadge tone={kind.tone}>{kind.label}</StatusBadge> : r.kind}</td>
                      <td className="p-3">
                        <Link href={`/submissions/${r.id}`} className="font-semibold text-forest hover:underline">{r.title}</Link>
                        {r.urgent ? <span className="ms-2"><StatusBadge tone="late">عاجلة</StatusBadge></span> : null}
                      </td>
                      <td className="p-3">{[r.submitter_name, r.submitter_role].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-3">{r.area ?? "—"}</td>
                      <td className="p-3">{st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : r.status}</td>
                      <td className="p-3 whitespace-nowrap text-xs text-muted">{formatDateTime(r.submitted_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
