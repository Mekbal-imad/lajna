"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { LOOKUPS, type LookupKind } from "@/lib/lookups";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { firstIssue } from "@/lib/validation/users";

const schema = z.object({
  kind: z.enum(Object.keys(LOOKUPS) as [LookupKind, ...LookupKind[]]),
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  name: z.string().trim().min(2, "أدخل الاسم.").max(80, "الاسم طويل جدًا."),
  sort: z.coerce.number().int("الترتيب رقم صحيح.").min(0).max(999),
  active: z.enum(["true", "false"]),
});

export async function saveLookup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.permissions.includes("settings.manage")) return FORBIDDEN;
  const parsed = schema.safeParse({
    kind: fd.get("kind"), id: fd.get("id"), name: fd.get("name"), sort: fd.get("sort") ?? 0, active: fd.get("active") ?? "true",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;
  const table = LOOKUPS[v.kind].table; // allow-listed table names only

  const supabase = await createClient();
  const row = { name_ar: v.name, sort_order: v.sort, is_active: v.active === "true" };
  const { error } = v.id
    ? await supabase.from(table).update(row).eq("id", v.id)
    : await supabase.from(table).insert(row);
  if (error) return { error: error.code === "23505" ? "يوجد عنصر بهذا الاسم." : toArabicError(error) };

  await supabase.rpc("log_action", {
    p_action: v.id ? "lookup.update" : "lookup.create", p_entity_type: v.kind, p_entity_id: v.id ?? null, p_details: { name: v.name },
  });
  revalidatePath(`/settings/lookups/${v.kind}`);
  return { ok: v.id ? "تم الحفظ." : "أُضيف العنصر." };
}
