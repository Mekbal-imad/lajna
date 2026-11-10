"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// extension → accepted MIME types (both must match)
const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  txt: ["text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

const entitySchema = z.object({ type: z.enum(["meeting", "decision", "project", "task"]), id: z.string().uuid() });
const ROUTES: Record<string, string> = { meeting: "meetings", decision: "decisions", project: "projects", task: "tasks" };
const pathFor = (type: string, id: string) => `/${ROUTES[type] ?? "meetings"}/${id}`;

export async function uploadAttachment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return FORBIDDEN;
  const entity = entitySchema.safeParse({ type: formData.get("entityType"), id: formData.get("entityId") });
  if (!entity.success) return { error: "بيانات غير صحيحة." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملفًا." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "حجم الملف يتجاوز 4 ميغابايت." };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[ext]?.includes(file.type)) {
    return { error: "نوع الملف غير مسموح. المسموح: PDF وصور (PNG, JPG, WEBP) وWord وExcel ونص." };
  }

  const storagePath = `${entity.data.type}/${entity.data.id}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  // The insert is the authorisation check: RLS only allows it for users who may manage the entity.
  const { data: row, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: entity.data.type, entity_id: entity.data.id, storage_path: storagePath,
      file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
    })
    .select("id")
    .single();
  if (error || !row) return { error: toArabicError(error) };

  const { error: uploadError } = await createAdminClient()
    .storage.from("attachments")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    await supabase.from("attachments").delete().eq("id", row.id);
    return { error: "تعذّر رفع الملف. حاول مرة أخرى." };
  }

  await supabase.rpc("log_action", {
    p_action: "attachment.add", p_entity_type: entity.data.type, p_entity_id: entity.data.id,
    p_details: { file: file.name },
  });
  revalidatePath(pathFor(entity.data.type, entity.data.id));
  return { ok: "تم رفع الملف." };
}

export async function deleteAttachment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return FORBIDDEN;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "بيانات غير صحيحة." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments").delete().eq("id", id.data).select("storage_path, entity_type, entity_id, file_name");
  if (error) return { error: toArabicError(error) };
  const removed = data?.[0] as { storage_path: string; entity_type: string; entity_id: string; file_name: string } | undefined;
  if (!removed) return FORBIDDEN; // RLS hid the row: no permission

  await createAdminClient().storage.from("attachments").remove([removed.storage_path]);
  await supabase.rpc("log_action", {
    p_action: "attachment.remove", p_entity_type: removed.entity_type, p_entity_id: removed.entity_id,
    p_details: { file: removed.file_name },
  });
  revalidatePath(pathFor(removed.entity_type, removed.entity_id));
  return { ok: "تم حذف الملف." };
}
