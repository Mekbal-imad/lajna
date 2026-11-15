import { z } from "zod";
import { optText } from "./common";

export const committeeSchema = z.object({
  name: z.string().trim().min(2, "أدخل اسم اللجنة.").max(100, "الاسم طويل جدًا."),
  description: optText(2000),
  duties: optText(4000),
});

export const postSchema = z.object({
  kind: z.enum(["directive", "report", "note"]),
  title: optText(200),
  body: z.string().trim().min(2, "اكتب نص الرسالة.").max(5000, "النص طويل جدًا."),
});
