import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, TextArea } from "@/components/ui/action-form";
import { AttachmentsSection } from "@/components/shared/attachments-section";
import { HistorySection } from "@/components/shared/history-section";
import { MeetingFields } from "@/components/meetings/meeting-fields";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getCommittees, getDirectory, getMeetingTypes } from "@/lib/data/lookups";
import { formatDateTime, isoToZonedInput } from "@/lib/datetime";
import { ATTENDANCE, DECISION_STATUS, MEETING_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import {
  addAgendaItem, deleteAgendaItem, deleteMeeting, inviteAttendees, moveAgendaItem, removeAttendee,
  saveMinutes, setAttendance, setMeetingArchived, setMinutesApproval, updateAgendaItem, updateMeeting,
} from "../actions";

export const metadata = { title: "تفاصيل الاجتماع" };

type Meeting = {
  id: string; title: string; meeting_type_id: string | null; committee_id: string | null;
  scheduled_at: string; location: string | null; status: string; minutes: string | null;
  minutes_approved_at: string | null; minutes_approved_by: string | null; archived_at: string | null;
};
type Agenda = { id: string; position: number; title: string; discussion: string | null };
type Attendee = { user_id: string; status: string; note: string | null };
type DecisionRow = { id: string; number: string; title: string; status: string };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("meetings.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: m } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (!m) notFound();
  const meeting = m as Meeting;

  const [agendaRes, attendeesRes, decisionsRes, manageRes, types, committees, people, directory] = await Promise.all([
    supabase.from("agenda_items").select("id, position, title, discussion").eq("meeting_id", id).order("position").order("created_at"),
    supabase.from("meeting_attendees").select("user_id, status, note").eq("meeting_id", id),
    supabase.from("decisions").select("id, number, title, status").eq("meeting_id", id).is("archived_at", null).order("number"),
    supabase.rpc("can_manage_meeting", { p_meeting: id }),
    getMeetingTypes(true), getCommittees(), getActiveMembers(), getDirectory(),
  ]);
  const agenda = (agendaRes.data ?? []) as Agenda[];
  const attendees = ((attendeesRes.data ?? []) as Attendee[])
    .sort((a, b) => (directory.get(a.user_id) ?? "").localeCompare(directory.get(b.user_id) ?? "", "ar"));
  const decisions = (decisionsRes.data ?? []) as DecisionRow[];
  const canManage = manageRes.data === true;
  const approved = meeting.minutes_approved_at !== null;
  const invited = new Set(attendees.map((a) => a.user_id));
  const notInvited = people.filter((p) => !invited.has(p.id));
  const st = MEETING_STATUS[meeting.status];
  const typeName = types.find((t) => t.id === meeting.meeting_type_id)?.name;
  const committeeName = committees.find((c) => c.id === meeting.committee_id)?.name ?? "اللجنة كاملة";
  const present = attendees.filter((a) => a.status === "present" || a.status === "late").length;
  const canDelete = can(ctx, "meetings.delete") && meeting.status !== "held" && !approved;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/meetings" className="text-sm text-muted hover:text-forest">← الاجتماعات</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{meeting.title}</h1>
          {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
          {meeting.archived_at ? <StatusBadge tone="idle">مؤرشف</StatusBadge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDateTime(meeting.scheduled_at)}{meeting.location ? ` · ${meeting.location}` : ""} · {committeeName}{typeName ? ` · ${typeName}` : ""}
        </p>
      </div>

      {canManage ? (
        <Section title="تعديل بيانات الاجتماع">
          <div className="px-4 py-4">
            <ActionForm action={updateMeeting} submitLabel="حفظ التعديلات">
              <input type="hidden" name="id" value={meeting.id} />
              <MeetingFields types={types.filter((t) => t.active || t.id === meeting.meeting_type_id)} committees={committees} showStatus
                values={{ title: meeting.title, meetingTypeId: meeting.meeting_type_id, committeeId: meeting.committee_id,
                  scheduledAt: isoToZonedInput(meeting.scheduled_at), location: meeting.location, status: meeting.status }} />
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <Section title="جدول الأعمال والنقاشات" hint={`${agenda.length} بند`}>
        {agenda.length === 0 ? <EmptyState title="لا توجد بنود بعد." action={canManage ? "أضف أول بند أدناه." : undefined} /> : (
          <ol className="divide-y divide-line">
            {agenda.map((a, i) => (
              <li key={a.id} className="px-4 py-4">
                {canManage ? (
                  <div className="space-y-3">
                    <ActionForm action={updateAgendaItem} submitLabel="حفظ البند" variant="quiet">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="meetingId" value={meeting.id} />
                      <Field label={`البند ${i + 1}`} name="title" defaultValue={a.title} required />
                      <TextArea label="ما دار من نقاش" name="discussion" defaultValue={a.discussion ?? ""} rows={3} />
                    </ActionForm>
                    <div className="flex gap-2">
                      <ActionForm action={moveAgendaItem} submitLabel="أعلى" variant="quiet">
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="meetingId" value={meeting.id} />
                        <input type="hidden" name="dir" value="up" />
                      </ActionForm>
                      <ActionForm action={moveAgendaItem} submitLabel="أسفل" variant="quiet">
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="meetingId" value={meeting.id} />
                        <input type="hidden" name="dir" value="down" />
                      </ActionForm>
                      <ActionForm action={deleteAgendaItem} submitLabel="حذف البند" variant="quiet" confirm="حذف هذا البند ونقاشه؟">
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="meetingId" value={meeting.id} />
                      </ActionForm>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">{i + 1}. {a.title}</p>
                    {a.discussion ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.discussion}</p> : null}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={addAgendaItem} submitLabel="إضافة بند" variant="quiet">
              <input type="hidden" name="meetingId" value={meeting.id} />
              <Field label="بند جديد" name="title" required />
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="الحضور" hint={attendees.length ? `${present} من ${attendees.length} حضروا` : undefined}>
        {attendees.length === 0 ? <EmptyState title="لم تُوجَّه دعوات بعد." action={canManage ? "ادعُ الأعضاء أدناه." : undefined} /> : (
          <ul className="divide-y divide-line">
            {attendees.map((a) => {
              const s = ATTENDANCE[a.status];
              return (
                <li key={a.user_id} className="px-4 py-3">
                  <p className="mb-2 text-sm font-medium">{directory.get(a.user_id) ?? "مستخدم"}</p>
                  {canManage ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <ActionForm action={setAttendance} submitLabel="تسجيل" variant="quiet" className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="meetingId" value={meeting.id} />
                        <input type="hidden" name="userId" value={a.user_id} />
                        <Select label="الحالة" name="status" defaultValue={a.status}
                          options={Object.entries(ATTENDANCE).map(([value, v]) => ({ value, label: v.label }))} />
                        <Field label="ملاحظة (عذر أو تأخر)" name="note" defaultValue={a.note ?? ""} />
                      </ActionForm>
                      <ActionForm action={removeAttendee} submitLabel="إزالة الدعوة" variant="quiet" confirm="إزالة هذا العضو من المدعوين؟">
                        <input type="hidden" name="meetingId" value={meeting.id} /><input type="hidden" name="userId" value={a.user_id} />
                      </ActionForm>
                    </div>
                  ) : (
                    <p className="text-sm">{s ? <StatusBadge tone={s.tone}>{s.label}</StatusBadge> : a.status}{a.note ? ` — ${a.note}` : ""}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canManage && notInvited.length > 0 ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={inviteAttendees} submitLabel="دعوة المحدَّدين" variant="quiet">
              <input type="hidden" name="meetingId" value={meeting.id} />
              <p className="text-sm font-medium">دعوة أعضاء</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {notInvited.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="userId" value={p.id} /> {p.name}
                  </label>
                ))}
              </div>
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="المحضر" hint={approved ? "معتمد" : "مسودة"}>
        <div className="space-y-4 px-4 py-4">
          {approved ? (
            <>
              <p className="whitespace-pre-wrap text-sm">{meeting.minutes || "—"}</p>
              <p className="text-xs text-muted">
                اعتُمد في {formatDateTime(meeting.minutes_approved_at!)}
                {meeting.minutes_approved_by ? ` بواسطة ${directory.get(meeting.minutes_approved_by) ?? "مستخدم"}` : ""}
              </p>
              {canManage ? (
                <ActionForm action={setMinutesApproval} submitLabel="إلغاء الاعتماد للتعديل" variant="quiet"
                  confirm="إلغاء اعتماد المحضر يسمح بتعديله من جديد وسيُسجَّل ذلك. متابعة؟">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <input type="hidden" name="approve" value="false" />
                </ActionForm>
              ) : null}
            </>
          ) : canManage ? (
            <>
              <ActionForm action={saveMinutes} submitLabel="حفظ المسودة">
                <input type="hidden" name="meetingId" value={meeting.id} />
                <TextArea label="نص المحضر" name="minutes" rows={10} defaultValue={meeting.minutes ?? ""} />
              </ActionForm>
              <ActionForm action={setMinutesApproval} submitLabel="اعتماد المحضر" variant="quiet"
                confirm="بعد الاعتماد لا يمكن تعديل المحضر إلا بإلغاء الاعتماد. هل حفظتَ آخر تعديلاتك؟">
                <input type="hidden" name="meetingId" value={meeting.id} />
                <input type="hidden" name="approve" value="true" />
              </ActionForm>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{meeting.minutes || "لم يُكتب المحضر بعد."}</p>
          )}
        </div>
      </Section>

      <Section title="القرارات الصادرة عن الاجتماع" hint={`${decisions.length}`}>
        {decisions.length === 0 ? <EmptyState title="لا توجد قرارات مرتبطة بهذا الاجتماع." /> : (
          <ul className="divide-y divide-line">
            {decisions.map((d) => {
              const ds = DECISION_STATUS[d.status];
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-xs text-muted" dir="ltr">{d.number}</span>
                  <Link href={`/decisions/${d.id}`} className="flex-1 text-forest hover:underline">{d.title}</Link>
                  {ds ? <StatusBadge tone={ds.tone}>{ds.label}</StatusBadge> : null}
                </li>
              );
            })}
          </ul>
        )}
        {can(ctx, "decisions.manage") ? (
          <div className="border-t border-line px-4 py-3">
            <Link href={`/decisions/new?meeting=${meeting.id}`} className="text-sm text-forest hover:underline">+ تسجيل قرار من هذا الاجتماع</Link>
          </div>
        ) : null}
      </Section>

      <AttachmentsSection entityType="meeting" entityId={meeting.id} canManage={canManage} />
      <HistorySection table="meetings" rowId={meeting.id} />

      {canManage || canDelete ? (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-3 px-4 py-4">
            {canManage ? (
              <ActionForm action={setMeetingArchived} variant="quiet"
                submitLabel={meeting.archived_at ? "استعادة من الأرشيف" : "أرشفة الاجتماع"}
                confirm={meeting.archived_at ? undefined : "سيختفي الاجتماع من القائمة النشطة ويبقى في الأرشيف. متابعة؟"}>
                <input type="hidden" name="id" value={meeting.id} />
                <input type="hidden" name="archive" value={meeting.archived_at ? "false" : "true"} />
              </ActionForm>
            ) : null}
            {canDelete ? (
              <ActionForm action={deleteMeeting} variant="danger" submitLabel="حذف الاجتماع"
                confirm={`سيُحذف الاجتماع نهائيًا مع بنوده وسجل حضوره (${agenda.length} بند، ${attendees.length} مدعو). لا يمكن التراجع. متابعة؟`}>
                <input type="hidden" name="id" value={meeting.id} />
              </ActionForm>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
