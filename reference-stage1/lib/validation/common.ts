import { z } from "zod";

/** "" → undefined, so empty form fields count as "not provided". */
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);

export const optUuid = z.preprocess(blank, z.string().uuid().optional());
export const optText = (max: number) =>
  z.preprocess(blank, z.string().trim().max(max, "النص طويل جدًا.").optional()).transform((v) => v ?? null);
export const optDate = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صحيح.").optional());
export const reqUuid = (msg = "معرّف غير صحيح.") => z.string().uuid(msg);
