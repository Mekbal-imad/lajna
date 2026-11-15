import { z } from "zod";
import { optDate, optText, optUuid } from "./common";

const budget = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number({ invalid_type_error: "الميزانية رقم." }).min(0, "الميزانية لا تكون سالبة.").max(1e12).optional(),
);

export const projectSchema = z
  .object({
    name: z.string().trim().min(3, "أدخل اسم المشروع (3 أحرف على الأقل).").max(200, "الاسم طويل جدًا."),
    description: optText(10000),
    objective: optText(5000),
    committeeId: optUuid,
    ownerId: optUuid,
    categoryId: optUuid,
    priorityId: optUuid,
    startDate: optDate,
    endDate: optDate,
    budget,
    status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).default("planned"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "تاريخ النهاية لا يسبق تاريخ البداية.", path: ["endDate"],
  });

export const goalSchema = z.object({
  title: z.string().trim().min(2, "أدخل نص الهدف.").max(500, "النص طويل جدًا."),
  details: optText(3000),
});

export const milestoneSchema = z.object({
  title: z.string().trim().min(2, "أدخل اسم المرحلة.").max(300, "الاسم طويل جدًا."),
  dueDate: optDate,
});

export const noteSchema = z.object({ body: z.string().trim().min(2, "اكتب الملاحظة.").max(5000, "النص طويل جدًا.") });
