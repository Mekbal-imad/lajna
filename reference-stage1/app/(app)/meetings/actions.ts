"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { getActiveMembers } from "@/lib/data/lookups";
import { zonedInputToIso } from "@/lib/datetime";
import { FORBIDDEN, toArabicError, type ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { firstIssue } from "@/lib/validation/users";
import { agendaSchema, attendanceSchema, invitePolicySchema, meetingSchema } from "@/lib/validation/meetings";

// Authorisation model: a signed-in session is required here, and the database (RLS +
// can_manage_meeting()) decides whether the write is allowed. A blocked UPDATE/DELETE affects
// zero rows, which we report as "forbidden".
async function open() {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  return { ctx, supabase: await createClient() };
}

const uuid = z.string().uuid();
const touched = (rows: unknown[] | null) => Array.isArray(rows) && rows.length > 0;

async function audit(supabase: Awaited<ReturnType<typeof createClient>>, action: string, id: string, details: Record<string, unknown> = {}) {
  await supabase.rpc("log_action", { p_action: action, p_entity_type: "meeting", p_entity_id: id, p_details: details });
}

function readMeetingForm(fd: FormData) {
  return meetingSchema.safeParse({
    title: fd.get("title"),
    meetingTypeId: fd.get("meetingTypeId"),
    committeeId: fd.get("committeeId"),
    scheduledAt: fd.get("scheduledAt"),
    location: fd.get("location"),
    status: fd.get("status") ?? "scheduled",
  });
}

export async function createMeeting(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const parsed = readMeetingForm(fd);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;

  const { data, error } = await s.supabase
    .from("meetings")
    .insert({
      title: v.title, meeting_type_id: v.meetingTypeId ?? null, committee_id: v.committeeId ?? null,
      scheduled_at: zonedInputToIso(v.scheduledAt), location: v.location, status: v.status,
    })
    .select("id").single();
  if (error || !data) return { error: toArabicError(error) };
  const id = data.id as string;

  const invite = invitePolicySchema.safeParse(fd.get("invite") ?? "none");
  let userIds: string[] = [];
  if (invite.success && invite.data === "all") {
    userIds = (await getActiveMembers()).map((m) => m.id);
  } else if (invite.success && invite.data === "committee" && v.committeeId) {
    const active = new Set((await getActiveMembers()).map((m) => m.id));
    const { data: members } = await s.supabase.from("committee_members").select("user_id").eq("committee_id", v.committeeId);
    userIds = (members ?? []).map((m: { user_id: string }) => m.user_id).filter((u) => active.has(u));
  }
  if (userIds.length) {
    const { error: invErr } = await s.supabase
      .from("meeting_attendees").insert(userIds.map((user_id) => ({ meeting_id: id, user_id })));
    if (invErr) return { error: `أُنشئ الاجتماع لكن تعذّرت دعوة الأعضاء: ${toArabicError(invErr)}` };
  }

  await audit(s.supabase, "meeting.create", id, { invited: userIds.length });
  revalidatePath("/meetings");
  redirect(`/meetings/${id}`);
}

export async function updateMeeting(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const parsed = readMeetingForm(fd);
  if (!id.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;

  const { data, error } = await s.supabase
    .from("meetings")
    .update({
      title: v.title, meeting_type_id: v.meetingTypeId ?? null, committee_id: v.committeeId ?? null,
      scheduled_at: zonedInputToIso(v.scheduledAt), location: v.location, status: v.status,
    })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;

  await audit(s.supabase, "meeting.update", id.data);
  revalidatePath(`/meetings/${id.data}`);
  revalidatePath("/meetings");
  return { ok: "تم حفظ التعديلات." };
}

export async function setMeetingArchived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };
  const archive = fd.get("archive") === "true";

  const { data, error } = await s.supabase
    .from("meetings")
    .update({ archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? s.ctx.userId : null })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;

  await audit(s.supabase, archive ? "meeting.archive" : "meeting.restore", id.data);
  revalidatePath(`/meetings/${id.data}`);
  revalidatePath("/meetings");
  return { ok: archive ? "تمت أرشفة الاجتماع." : "تمت استعادة الاجتماع." };
}

export async function deleteMeeting(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "معرّف غير صحيح." };

  const { data, error } = await s.supabase.from("meetings").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;

  await audit(s.supabase, "meeting.delete", id.data);
  revalidatePath("/meetings");
  redirect("/meetings");
}

// ───────── Agenda ─────────
export async function addAgendaItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const parsed = agendaSchema.safeParse({ title: fd.get("title"), discussion: "" });
  if (!meetingId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data: last } = await s.supabase
    .from("agenda_items").select("position").eq("meeting_id", meetingId.data)
    .order("position", { ascending: false }).limit(1);
  const position = ((last?.[0] as { position: number } | undefined)?.position ?? 0) + 1;

  const { error } = await s.supabase
    .from("agenda_items").insert({ meeting_id: meetingId.data, title: parsed.data.title, position });
  if (error) return { error: toArabicError(error) };
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "أُضيف البند." };
}

export async function updateAgendaItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const parsed = agendaSchema.safeParse({ title: fd.get("title"), discussion: fd.get("discussion") ?? "" });
  if (!id.success || !meetingId.success) return { error: "معرّف غير صحيح." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("agenda_items").update({ title: parsed.data.title, discussion: parsed.data.discussion })
    .eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "تم حفظ البند." };
}

export async function deleteAgendaItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  if (!id.success || !meetingId.success) return { error: "معرّف غير صحيح." };
  const { data, error } = await s.supabase.from("agenda_items").delete().eq("id", id.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "حُذف البند." };
}

export async function moveAgendaItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const id = uuid.safeParse(fd.get("id"));
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  if (!id.success || !meetingId.success) return { error: "معرّف غير صحيح." };

  const { data } = await s.supabase
    .from("agenda_items").select("id, position").eq("meeting_id", meetingId.data)
    .order("position").order("created_at");
  const items = (data ?? []) as { id: string; position: number }[];
  const i = items.findIndex((x) => x.id === id.data);
  const a = items[i];
  const b = items[i + dir];
  if (i < 0 || !a || !b) return { ok: "" };

  // Positions can tie after deletions; renumber the two affected rows explicitly.
  const [r1, r2] = await Promise.all([
    s.supabase.from("agenda_items").update({ position: i + dir + 1 }).eq("id", a.id).select("id"),
    s.supabase.from("agenda_items").update({ position: i + 1 }).eq("id", b.id).select("id"),
  ]);
  if (r1.error || r2.error) return { error: toArabicError(r1.error ?? r2.error) };
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "" };
}

// ───────── Attendance ─────────
export async function inviteAttendees(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const users = z.array(uuid).safeParse(fd.getAll("userId"));
  if (!meetingId.success || !users.success) return { error: "بيانات غير صحيحة." };
  if (users.data.length === 0) return { error: "اختر عضوًا واحدًا على الأقل." };

  const { error } = await s.supabase
    .from("meeting_attendees")
    .upsert(users.data.map((user_id) => ({ meeting_id: meetingId.data, user_id })),
      { onConflict: "meeting_id,user_id", ignoreDuplicates: true });
  if (error) return { error: toArabicError(error) };
  await audit(s.supabase, "meeting.invite", meetingId.data, { count: users.data.length });
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: `تمت دعوة ${users.data.length} عضو.` };
}

export async function setAttendance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const userId = uuid.safeParse(fd.get("userId"));
  const parsed = attendanceSchema.safeParse({ status: fd.get("status"), note: fd.get("note") });
  if (!meetingId.success || !userId.success) return { error: "بيانات غير صحيحة." };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { data, error } = await s.supabase
    .from("meeting_attendees").update({ status: parsed.data.status, note: parsed.data.note })
    .eq("meeting_id", meetingId.data).eq("user_id", userId.data).select("user_id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "سُجّل الحضور." };
}

export async function removeAttendee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const userId = uuid.safeParse(fd.get("userId"));
  if (!meetingId.success || !userId.success) return { error: "بيانات غير صحيحة." };
  const { data, error } = await s.supabase
    .from("meeting_attendees").delete().eq("meeting_id", meetingId.data).eq("user_id", userId.data).select("user_id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "أُزيلت الدعوة." };
}

// ───────── Minutes ─────────
export async function saveMinutes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  const minutes = z.string().max(100000, "المحضر طويل جدًا.").safeParse(fd.get("minutes") ?? "");
  if (!meetingId.success) return { error: "معرّف غير صحيح." };
  if (!minutes.success) return { error: firstIssue(minutes.error) };

  const { data, error } = await s.supabase
    .from("meetings").update({ minutes: minutes.data.trim() || null }).eq("id", meetingId.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  await audit(s.supabase, "meeting.minutes_saved", meetingId.data);
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: "حُفظ المحضر." };
}

export async function setMinutesApproval(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await open();
  if (!s) return FORBIDDEN;
  const meetingId = uuid.safeParse(fd.get("meetingId"));
  if (!meetingId.success) return { error: "معرّف غير صحيح." };
  const approve = fd.get("approve") === "true";

  const { data, error } = await s.supabase
    .from("meetings").update({ minutes_approved_at: approve ? new Date().toISOString() : null })
    .eq("id", meetingId.data).select("id");
  if (error) return { error: toArabicError(error) };
  if (!touched(data)) return FORBIDDEN;
  await audit(s.supabase, approve ? "meeting.minutes_approved" : "meeting.minutes_unapproved", meetingId.data);
  revalidatePath(`/meetings/${meetingId.data}`);
  return { ok: approve ? "اعتُمد المحضر." : "أُلغي اعتماد المحضر." };
}
