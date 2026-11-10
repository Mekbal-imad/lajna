import { z } from "zod";
import { optDate, optText, optUuid } from "./common";

export const decisionSchema = z
  .object({
    title: z.string().trim().min(3, "أدخل عنوان القرار (3 أحرف على الأقل).").max(300, "العنوان طويل جدًا."),
    details: optText(20000),
    meetingId: optUuid,
    decidedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "حدد تاريخ القرار."),
    committeeId: optUuid,
    assigneeId: optUuid,
    dueDate: optDate,
    status: z.enum(["proposed", "approved", "in_progress", "executed", "postponed", "cancelled"]),
    reason: optText(500),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.decidedOn, {
    message: "تاريخ الاستحقاق لا يسبق تاريخ القرار.",
    path: ["dueDate"],
  });
