import { z } from "zod";
import type { Tone } from "@/components/ui/status-badge";

type Label = { label: string; tone: Tone };

export const SUBMISSION_KIND: Record<string, Label> = {
  suggestion: { label: "اقتراح", tone: "info" },
  complaint: { label: "شكوى", tone: "late" },
  note: { label: "ملاحظة", tone: "idle" },
  inquiry: { label: "استفسار", tone: "warn" },
};

export const SUBMISSION_STATUS: Record<string, Label> = {
  new: { label: "جديدة", tone: "warn" },
  under_review: { label: "قيد المراجعة", tone: "info" },
  accepted: { label: "مقبولة", tone: "ok" },
  in_progress: { label: "قيد المعالجة", tone: "info" },
  resolved: { label: "تمت المعالجة", tone: "ok" },
  rejected: { label: "مرفوضة", tone: "idle" },
  closed: { label: "مغلقة", tone: "idle" },
};

const KIND_BY_ANSWER: Record<string, string> = {
  اقتراح: "suggestion", شكوى: "complaint", ملاحظة: "note", استفسار: "inquiry",
};

/** What the Google Form script sends: one entry per answered question, in form order. */
export const intakeSchema = z.object({
  responseId: z.string().min(1).max(200),
  timestamp: z.string().max(40).optional(),
  items: z
    .array(z.object({ q: z.string().max(300), a: z.string().max(20000) }))
    .max(60),
});
export type IntakePayload = z.infer<typeof intakeSchema>;

const cap = (s: string | null, n: number) => (s ? s.slice(0, n) : null);

/**
 * Maps the form answers to a submission row. The form has one page per message kind, so the
 * name / role questions appear several times (same wording): the first non-empty one wins.
 * Every answer is also kept as-is in `answers`, so nothing is lost if a question changes.
 */
export function parseSubmission(p: IntakePayload) {
  const items = p.items.map((i) => ({ q: i.q.trim(), a: i.a.trim() }));
  const firstFilled = (match: (q: string) => boolean) => items.find((i) => match(i.q) && i.a)?.a ?? null;

  const kind = KIND_BY_ANSWER[firstFilled((q) => q.startsWith("ما طبيعة رسالتك")) ?? ""];
  if (!kind) return { error: "نوع الرسالة غير معروف." as const };

  const name = firstFilled((q) => q.startsWith("الاسم واللقب"));
  const role = firstFilled((q) => q.startsWith("الصفة"));
  const details = firstFilled((q) => q.startsWith("تفاصيل الموضوع"));
  const title =
    firstFilled((q) => q.startsWith("عنوان مختصر")) ??
    `${SUBMISSION_KIND[kind]!.label}${name ? ` من ${name}` : ""}`; // e.g. inquiries may have no title
  const yes = (v: string | null) => !!v && v.startsWith("نعم");
  const ts = p.timestamp ? new Date(p.timestamp) : null;

  return {
    row: {
      external_id: p.responseId,
      source: "google_form" as const,
      kind,
      title: title.slice(0, 300),
      details: cap(details, 20000),
      area: cap(firstFilled((q) => q.startsWith("المجال المعني")), 200),
      urgent: yes(firstFilled((q) => q.startsWith("هل يتطلب الموضوع تدخل"))),
      proposed_solution: cap(firstFilled((q) => q.startsWith("هل لديك حل")), 20000),
      submitter_name: cap(name, 200),
      submitter_role: cap(role, 200),
      contact_requested: yes(firstFilled((q) => q.startsWith("هل ترغب في أن يتم التواصل"))),
      contact_info: cap(firstFilled((q) => q.startsWith("رقم الهاتف")), 300),
      answers: items.filter((i) => i.a),
      submitted_at: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : new Date().toISOString(),
    },
  };
}
