import { deleteAttachment, uploadAttachment } from "@/app/(app)/attachments/actions";
import { ActionForm } from "@/components/ui/action-form";
import { EmptyState, Section } from "@/components/ui/section";
import { formatDateTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

type Row = { id: string; file_name: string; size_bytes: number; created_at: string };

export async function AttachmentsSection({
  entityType, entityId, canManage,
}: { entityType: "meeting" | "decision" | "project" | "task"; entityId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments").select("id, file_name, size_bytes, created_at")
    .eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  const files = (data ?? []) as Row[];

  return (
    <Section title="المرفقات" hint={`${files.length} ملف`}>
      {files.length === 0 ? (
        <EmptyState title="لا توجد مرفقات." action={canManage ? "يمكنك رفع ملف أدناه." : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <a href={`/files/${f.id}`} className="flex-1 truncate font-medium text-forest hover:underline">{f.file_name}</a>
              <span className="text-xs text-muted">{Math.max(1, Math.round(f.size_bytes / 1024))} ك.ب · {formatDateTime(f.created_at)}</span>
              {canManage ? (
                <ActionForm action={deleteAttachment} submitLabel="حذف" variant="quiet" confirm="حذف هذا الملف نهائيًا؟">
                  <input type="hidden" name="id" value={f.id} />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div className="border-t border-line px-4 py-4">
          <ActionForm action={uploadAttachment} submitLabel="رفع الملف" pendingLabel="جارٍ الرفع…" variant="quiet">
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <label htmlFor="file" className="block text-sm font-medium">ملف جديد</label>
            <input id="file" name="file" type="file" required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx" className="block w-full text-sm" />
            <p className="text-xs text-muted">الحد الأقصى 4 ميغابايت. المسموح: PDF، صور، Word، Excel، نص.</p>
          </ActionForm>
        </div>
      ) : null}
    </Section>
  );
}
