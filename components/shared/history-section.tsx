import { Section } from "@/components/ui/section";
import { formatDateTime } from "@/lib/datetime";
import { getDirectory } from "@/lib/data/lookups";
import { FIELD_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string; actor_id: string | null; created_at: string;
  details: { op?: "INSERT" | "UPDATE" | "DELETE"; old?: Record<string, unknown>; new?: Record<string, unknown> } | null;
};

const IGNORED = new Set(["updated_at", "created_at", "id", "minutes_approved_by", "archived_by"]);

function summarize(r: Row): string {
  const op = r.details?.op;
  if (op === "INSERT") return "إنشاء";
  if (op === "DELETE") return "حذف";
  if (op !== "UPDATE") return "تعديل";
  // record_change() stores only the changed fields in old / new
  const keys = Object.keys(r.details?.new ?? {}).filter((k) => !IGNORED.has(k));
  return keys.length ? `تعديل: ${keys.map((k) => FIELD_LABELS[k] ?? k).join("، ")}` : "تعديل";
}

/** Shows the change history; RLS decides whether the current user sees any rows at all. */
export async function HistorySection({ table, rowId }: { table: "meetings" | "decisions" | "committees" | "tasks" | "projects" | "submissions"; rowId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs").select("id, actor_id, created_at, details")
    .eq("entity_type", table).eq("entity_id", rowId).like("action", `${table}.%`)
    .order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;
  const names = await getDirectory();

  return (
    <Section title="سجل التعديلات" hint="من عدّل وماذا وفي أي وقت">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 text-sm">
            <p>{summarize(r)}</p>
            <p className="text-xs text-muted">
              {r.actor_id ? names.get(r.actor_id) ?? "مستخدم" : "النظام"} · {formatDateTime(r.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
