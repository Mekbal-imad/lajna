import { z } from "zod";
import { optText } from "./common";

export const committeeSchema = z.object({
  name: z.string().trim().min(2, "أدخل اسم اللجنة.").max(100, "الاسم طويل جدًا."),
  description: optText(2000),
  duties: optText(4000),
});
