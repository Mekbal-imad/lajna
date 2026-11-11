import { z } from "zod";
import type { Tone } from "@/components/ui/status-badge";

/** Allowed values of meeting_attendees.attendance_status in production. "invited" = not recorded yet. */
export const ATTENDANCE_STATUSES = ["invited", "present", "late", "excused", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE: Record<AttendanceStatus, { label: string; tone: Tone }> = {
  invited: { label: "لم يُسجَّل بعد", tone: "idle" },
  present: { label: "حاضر", tone: "ok" },
  late: { label: "متأخر", tone: "warn" },
  excused: { label: "غائب بعذر", tone: "info" },
  absent: { label: "غائب", tone: "late" },
};

export const attendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES, { message: "حالة الحضور غير صالحة." }),
  note: z.string().trim().max(500, "الملاحظة طويلة جدًا (500 حرف كحد أقصى).").optional(),
});
