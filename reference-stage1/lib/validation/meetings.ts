import { z } from "zod";
import { optText, optUuid } from "./common";

export const meetingSchema = z.object({
  title: z.string().trim().min(3, "أدخل عنوان الاجتماع (3 أحرف على الأقل).").max(200, "العنوان طويل جدًا."),
  meetingTypeId: optUuid,
  committeeId: optUuid,
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "حدد تاريخ الاجتماع ووقته."),
  location: optText(200),
  status: z.enum(["scheduled", "held", "cancelled"]).default("scheduled"),
});

export const invitePolicySchema = z.enum(["none", "all", "committee"]).default("none");

export const agendaSchema = z.object({
  title: z.string().trim().min(2, "أدخل عنوان البند.").max(300, "العنوان طويل جدًا."),
  discussion: optText(20000),
});

export const attendanceSchema = z.object({
  status: z.enum(["pending", "present", "late", "excused", "absent"]),
  note: optText(500),
});
