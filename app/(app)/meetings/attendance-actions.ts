"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { attendanceSchema } from "@/lib/attendance";
import { canManageAttendance } from "@/lib/meetings/permissions";
import { loadMembers } from "@/lib/data/members";

const uuid = z.string().uuid();
const MAX_INVITES = 300;

type Db = Awaited<ReturnType<typeof createClient>>;
type Guarded =
  | { ok: false; state: ActionState }
  | { ok: true; supabase: Db; meetingId: string; committeeId: string | null };

/** Checks session, permission (re-checked here, enforced by RLS) and that the meeting is open for edits. */
async function guard(raw: FormDataEntryValue | null): Promise<Guarded> {
  const id = uuid.safeParse(raw);
  if (!id.success) return { ok: false, state: { error: "اجتماع غير صالح." } };
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, state: FORBIDDEN };
  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings").select("id, committee_id, archived_at").eq("id", id.data).maybeSingle();
  if (!meeting) return { ok: false, state: { error: "الاجتماع غير موجود." } };
  if (!(await canManageAttendance(supabase, ctx, id.data))) return { ok: false, state: FORBIDDEN };
  if (meeting.archived_at) return { ok: false, state: { error: "الاجتماع مؤرشف ولا يمكن تعديل حضوره." } };
  return { ok: true, supabase, meetingId: id.data, committeeId: meeting.committee_id as string | null };
}

async function audit(supabase: Db, action: string, meetingId: string, details: Record<string, unknown>) {
  await supabase.rpc("log_action", { p_action: action, p_entity_type: "meeting", p_entity_id: meetingId, p_details: details });
}

/** Invites the given members. A row with invited=true means "invited"; no row (or invited=false) means "not invited". */
async function invite(supabase: Db, meetingId: string, userIds: string[]): Promise<ActionState> {
  const ids = [...new Set(userIds)].slice(0, MAX_INVITES);
  if (ids.length === 0) return { error: "لم يتم تحديد أي عضو للدعوة." };

  const existing = await supabase
    .from("meeting_attendees").select("user_id").eq("meeting_id", meetingId).eq("invited", true).in("user_id", ids);
  if (existing.error) return { error: toArabicError(existing.error) };
  const already = new Set((existing.data ?? []).map((r: { user_id: string }) => r.user_id));
  const fresh = ids.filter((u) => !already.has(u));
  if (fresh.length === 0) return { ok: "جميع الأعضاء المحدَّدين مدعوون مسبقًا." };

  // Members whose invitation was withdrawn earlier are invited again with a clean record.
  const reinvite = await supabase
    .from("meeting_attendees")
    .update({ invited: true, attendance_status: "invited", notes: null })
    .eq("meeting_id", meetingId).eq("invited", false).in("user_id", fresh);
  if (reinvite.error) return { error: toArabicError(reinvite.error) };

  const inserted = await supabase
    .from("meeting_attendees")
    .upsert(fresh.map((user_id) => ({ meeting_id: meetingId, user_id, invited: true, attendance_status: "invited" })),
      { onConflict: "meeting_id,user_id", ignoreDuplicates: true });
  if (inserted.error) return { error: toArabicError(inserted.error) };

  await audit(supabase, "meeting.invite", meetingId, { count: fresh.length });
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: `تمت دعوة ${fresh.length} عضو.` };
}

export async function inviteAttendees(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd.get("meetingId"));
  if (!g.ok) return g.state;
  const picked = fd.getAll("userId").map((v) => uuid.safeParse(v)).filter((r) => r.success).map((r) => r.data as string);
  const active = new Set((await loadMembers(g.supabase)).filter((m) => m.active).map((m) => m.id));
  return invite(g.supabase, g.meetingId, picked.filter((id) => active.has(id)));
}

/** Invites every active member of the meeting's committee (or every active member when the meeting has no committee). */
export async function inviteCommitteeMembers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd.get("meetingId"));
  if (!g.ok) return g.state;
  const members = (await loadMembers(g.supabase)).filter((m) => m.active);
  let ids = members.map((m) => m.id);
  if (g.committeeId) {
    const cm = await g.supabase.from("committee_members").select("user_id").eq("committee_id", g.committeeId);
    if (cm.error) return { error: toArabicError(cm.error) };
    const inCommittee = new Set((cm.data ?? []).map((r: { user_id: string }) => r.user_id));
    ids = ids.filter((id) => inCommittee.has(id));
  }
  return invite(g.supabase, g.meetingId, ids);
}

export async function setAttendance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd.get("meetingId"));
  if (!g.ok) return g.state;
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return { error: "عضو غير صالح." };
  const parsed = attendanceSchema.safeParse({ status: fd.get("status"), note: fd.get("note") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المدخلة." };

  const { data, error } = await g.supabase
    .from("meeting_attendees")
    .update({ attendance_status: parsed.data.status, notes: parsed.data.note || null })
    .eq("meeting_id", g.meetingId).eq("user_id", userId.data).eq("invited", true)
    .select("user_id");
  if (error) return { error: toArabicError(error) };
  if (!data || data.length === 0) return { error: "تعذّر تسجيل الحضور: العضو غير مدعو أو لا تملك الصلاحية." };

  await audit(g.supabase, "meeting.attendance", g.meetingId, { user_id: userId.data, status: parsed.data.status });
  revalidatePath(`/meetings/${g.meetingId}`);
  return { ok: "تم تسجيل الحضور." };
}

export async function removeAttendee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(fd.get("meetingId"));
  if (!g.ok) return g.state;
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return { error: "عضو غير صالح." };

  const { data, error } = await g.supabase
    .from("meeting_attendees").delete().eq("meeting_id", g.meetingId).eq("user_id", userId.data).select("user_id");
  if (error) return { error: toArabicError(error) };
  if (!data || data.length === 0) return { error: "تعذّرت إزالة الدعوة: العضو غير مدعو أو لا تملك الصلاحية." };

  await audit(g.supabase, "meeting.uninvite", g.meetingId, { user_id: userId.data });
  revalidatePath(`/meetings/${g.meetingId}`);
  return { ok: "تمت إزالة الدعوة." };
}
