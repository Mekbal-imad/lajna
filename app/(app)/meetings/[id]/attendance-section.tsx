import { ActionForm } from "@/components/ui/action-form";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { ATTENDANCE, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/attendance";
import type { Member } from "@/lib/data/members";
import { inviteAttendees, inviteCommitteeMembers, removeAttendee, setAttendance } from "../attendance-actions";

export type AttendeeRow = {
  user_id: string;
  attendance_status: string;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
};

const stamp = new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Algiers" });

export function AttendanceSection({
  meetingId, committeeName, attendees, members, canManage, locked,
}: {
  meetingId: string; committeeName: string | null; attendees: AttendeeRow[]; members: Member[];
  canManage: boolean; locked: boolean;
}) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows = [...attendees].sort((a, b) => (names.get(a.user_id) ?? "").localeCompare(names.get(b.user_id) ?? "", "ar"));
  const invitedIds = new Set(rows.map((r) => r.user_id));
  const notInvited = members.filter((m) => m.active && !invitedIds.has(m.id));

  const counts: Record<AttendanceStatus, number> = { invited: 0, present: 0, late: 0, excused: 0, absent: 0 };
  for (const r of rows) if (r.attendance_status in counts) counts[r.attendance_status as AttendanceStatus] += 1;
  const attended = counts.present + counts.late;
  const editable = canManage && !locked;

  return (
    <Section title="الحضور" hint={rows.length ? `${attended} من ${rows.length} حضروا` : undefined}>
      {locked ? <p className="border-b border-line bg-ivory px-4 py-2 text-xs text-muted">الاجتماع مؤرشف، الحضور للعرض فقط.</p> : null}

      {rows.length === 0 ? (
        <EmptyState title="لم تُوجَّه دعوات بعد." action={editable ? "ادعُ الأعضاء من الأسفل." : undefined} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
            {ATTENDANCE_STATUSES.map((s) => (
              <StatusBadge key={s} tone={ATTENDANCE[s].tone}>{ATTENDANCE[s].label}: {counts[s]}</StatusBadge>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const s = ATTENDANCE[r.attendance_status as AttendanceStatus];
              const who = r.recorded_by ? names.get(r.recorded_by) : null;
              return (
                <li key={r.user_id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{names.get(r.user_id) ?? "مستخدم"}</p>
                    {!editable ? <StatusBadge tone={s?.tone ?? "idle"}>{s?.label ?? r.attendance_status}</StatusBadge> : null}
                  </div>
                  {editable ? (
                    <div className="space-y-2">
                      <ActionForm action={setAttendance} submitLabel="تسجيل" variant="quiet">
                        <input type="hidden" name="meetingId" value={meetingId} />
                        <input type="hidden" name="userId" value={r.user_id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="field">الحالة
                            <select name="status" defaultValue={r.attendance_status}>
                              {ATTENDANCE_STATUSES.map((v) => <option key={v} value={v}>{ATTENDANCE[v].label}</option>)}
                            </select>
                          </label>
                          <label className="field">ملاحظة (عذر أو تأخر)
                            <input name="note" defaultValue={r.notes ?? ""} maxLength={500} />
                          </label>
                        </div>
                      </ActionForm>
                      <ActionForm action={removeAttendee} submitLabel="إزالة الدعوة" variant="quiet"
                        confirm="إزالة هذا العضو من المدعوين؟ سيُحذف تسجيل حضوره لهذا الاجتماع.">
                        <input type="hidden" name="meetingId" value={meetingId} />
                        <input type="hidden" name="userId" value={r.user_id} />
                      </ActionForm>
                    </div>
                  ) : r.notes ? <p className="text-sm text-muted">{r.notes}</p> : null}
                  {r.recorded_at ? (
                    <p className="text-xs text-muted">
                      سُجّل{who ? ` بواسطة ${who}` : ""} · <bdi dir="ltr">{stamp.format(new Date(r.recorded_at))}</bdi>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editable ? (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <ActionForm action={inviteCommitteeMembers} variant="quiet"
            submitLabel={committeeName ? `دعوة جميع أعضاء ${committeeName}` : "دعوة جميع الأعضاء النشطين"}>
            <input type="hidden" name="meetingId" value={meetingId} />
          </ActionForm>
          {notInvited.length > 0 ? (
            <ActionForm action={inviteAttendees} submitLabel="دعوة المحدَّدين" variant="quiet">
              <input type="hidden" name="meetingId" value={meetingId} />
              <p className="text-sm font-medium">أو اختر أعضاء بعينهم</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {notInvited.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="userId" value={m.id} /> {m.name}
                  </label>
                ))}
              </div>
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
