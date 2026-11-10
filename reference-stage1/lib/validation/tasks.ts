import { z } from "zod";
import { optDate, optText, optUuid } from "./common";

const weight = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : v),
  z.coerce.number({ invalid_type_error: "الوزن رقم." }).min(0, "الوزن لا يقل عن 0.").max(100, "الوزن لا يتجاوز 100."),
);

export const taskSchema = z
  .object({
    title: z.string().trim().min(3, "أدخل عنوان المهمة (3 أحرف على الأقل).").max(300, "العنوان طويل جدًا."),
    description: optText(10000),
    committeeId: optUuid,
    projectId: optUuid,
    priorityId: optUuid,
    startDate: optDate,
    dueDate: optDate,
    weight,
    status: z.enum(["new", "not_started", "in_progress", "on_hold", "awaiting_approval", "completed", "cancelled"]).default("new"),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    message: "الموعد النهائي لا يسبق تاريخ البداية.", path: ["dueDate"],
  });

export const progressSchema = z.object({
  progress: z.coerce.number({ invalid_type_error: "أدخل نسبة بين 0 و100." }).int("النسبة عدد صحيح.").min(0, "النسبة بين 0 و100.").max(100, "النسبة بين 0 و100."),
  status: z.enum(["new", "not_started", "in_progress", "on_hold", "awaiting_approval", "completed", "cancelled"]),
  note: optText(1000),
});
