import { z } from "zod";

const optionalPhone = z
  .string()
  .trim()
  .max(30, "رقم الهاتف طويل جدًا.")
  .regex(/^[0-9+\s-]*$/, "رقم الهاتف غير صحيح.")
  .transform((v) => (v === "" ? null : v));

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "أدخل الاسم الكامل.").max(100, "الاسم طويل جدًا."),
  email: z.string().trim().toLowerCase().email("أدخل بريدًا إلكترونيًا صحيحًا."),
  password: z.string().min(10, "كلمة المرور يجب ألا تقل عن 10 أحرف.").max(72, "كلمة المرور طويلة جدًا."),
  phone: optionalPhone,
  roleId: z.string().uuid().optional(),
});

export const updateProfileSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(2, "أدخل الاسم الكامل.").max(100, "الاسم طويل جدًا."),
  phone: optionalPhone,
});

export const membershipSchema = z.object({
  userId: z.string().uuid(),
  committeeId: z.string().uuid("اختر لجنة."),
  memberRole: z.enum(["head", "member"]),
});

export const passwordSchema = z
  .object({
    password: z.string().min(10, "كلمة المرور يجب ألا تقل عن 10 أحرف.").max(72, "كلمة المرور طويلة جدًا."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "كلمتا المرور غير متطابقتين.", path: ["confirm"] });

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "البيانات غير صحيحة.";
}
