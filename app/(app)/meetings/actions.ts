"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toArabicError, type ActionState } from "@/lib/errors";

const schema = z.object({
 id: z.string().uuid().optional(), title: z.string().trim().min(3).max(180),
 meetingType: z.enum(["regular","extraordinary","coordination","evaluation"]),
 status: z.enum(["draft","scheduled","held","completed","cancelled"]),
 startsAt: z.string().min(1), location: z.string().max(180).optional(), description: z.string().max(5000).optional(), minutes: z.string().max(20000).optional(),
});
export async function saveMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
 const ctx = await getSessionContext();
 if (!ctx?.permissions.includes("meetings.manage")) return { error: "ليست لديك صلاحية إدارة الاجتماعات." };
 const parsed = schema.safeParse({
  id: form.get("id") || undefined, title: form.get("title"), meetingType: form.get("meetingType"), status: form.get("status"),
  startsAt: form.get("startsAt"), location: form.get("location") || "", description: form.get("description") || "", minutes: form.get("minutes") || "",
 });
 if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المدخلة." };
 const { id, ...data } = parsed.data;
 const supabase = await createClient();
 const payload = { title:data.title, meeting_type:data.meetingType, status:data.status, starts_at:new Date(data.startsAt).toISOString(), location:data.location || null, description:data.description || null, minutes:data.minutes || null };
 const result = id ? await supabase.from("meetings").update(payload).eq("id",id).select("id").single() : await supabase.from("meetings").insert({...payload,created_by:ctx.userId}).select("id").single();
 if (result.error) return { error: toArabicError(result.error) };
 await supabase.rpc("log_action", { p_action:id?"meeting.update":"meeting.create", p_entity_type:"meeting", p_entity_id:result.data.id, p_details:{title:data.title} });
 revalidatePath("/meetings"); revalidatePath(`/meetings/${result.data.id}`);
 return { ok: id ? "تم تحديث الاجتماع." : "تم إنشاء الاجتماع." };
}
export async function deleteMeeting(form: FormData): Promise<void> {
 const ctx = await getSessionContext(); if (!ctx?.permissions.includes("meetings.manage")) return;
 const id = z.string().uuid().safeParse(form.get("id")); if (!id.success) return;
 const supabase = await createClient();
 const { error } = await supabase.from("meetings").update({status:"cancelled"}).eq("id",id.data);
 if (!error) { await supabase.rpc("log_action",{p_action:"meeting.cancel",p_entity_type:"meeting",p_entity_id:id.data,p_details:{}}); revalidatePath("/meetings"); }
}
