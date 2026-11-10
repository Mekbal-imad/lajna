export type ActionState = { error?: string; ok?: string };

const ARABIC = /[\u0600-\u06FF]/;

/** Maps database / auth errors to a safe Arabic message. */
export function toArabicError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "تعذّر تنفيذ العملية. حاول مرة أخرى.";
  const msg = err.message ?? "";
  if (err.code === "42501") return "ليست لديك صلاحية لتنفيذ هذه العملية.";
  if (err.code === "23505") return "هذا العنصر موجود مسبقًا.";
  if (err.code === "23503") return "لا يمكن تنفيذ العملية لارتباط العنصر ببيانات أخرى.";
  if (/already (been )?registered|already exists/i.test(msg)) return "هذا البريد الإلكتروني مسجّل مسبقًا.";
  // Our own trigger exceptions are written in Arabic and are safe to show.
  if (err.code === "P0001" && ARABIC.test(msg)) return msg;
  return "تعذّر تنفيذ العملية. حاول مرة أخرى.";
}

export const FORBIDDEN: ActionState = { error: "ليست لديك صلاحية لتنفيذ هذه العملية." };
