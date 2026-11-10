import type { Tone } from "@/components/ui/status-badge";

type Label = { label: string; tone: Tone };

// These status sets drive business rules (locking, scoring), so their codes live in code
// and in DB check constraints; names / types that are purely descriptive are DB tables instead.
export const MEETING_STATUS: Record<string, Label> = {
  scheduled: { label: "مجدول", tone: "info" },
  held: { label: "منعقد", tone: "ok" },
  cancelled: { label: "ملغى", tone: "idle" },
};

export const ATTENDANCE: Record<string, Label> = {
  pending: { label: "لم يُسجَّل بعد", tone: "idle" },
  present: { label: "حاضر", tone: "ok" },
  late: { label: "متأخر", tone: "warn" },
  excused: { label: "غائب بعذر", tone: "info" },
  absent: { label: "غائب", tone: "late" },
};

export const DECISION_STATUS: Record<string, Label> = {
  proposed: { label: "مقترح", tone: "warn" },
  approved: { label: "معتمد", tone: "ok" },
  in_progress: { label: "قيد التنفيذ", tone: "info" },
  executed: { label: "منفذ", tone: "ok" },
  postponed: { label: "مؤجل", tone: "idle" },
  cancelled: { label: "ملغى", tone: "idle" },
};

/** Decisions in these states need `decisions.approve` to edit their text (mirrors guard_decision). */
export const PROTECTED_DECISION_STATUSES = ["approved", "in_progress", "executed"];

export const TASK_STATUS: Record<string, Label> = {
  new: { label: "جديدة", tone: "info" },
  not_started: { label: "لم تبدأ", tone: "idle" },
  in_progress: { label: "قيد التنفيذ", tone: "info" },
  on_hold: { label: "متوقفة", tone: "warn" },
  awaiting_approval: { label: "بانتظار الاعتماد", tone: "warn" },
  completed: { label: "مكتملة", tone: "ok" },
  cancelled: { label: "ملغاة", tone: "idle" },
};

/** A task is overdue only if its due date passed while it is still in one of these states. */
export const OPEN_TASK_STATUSES = ["new", "not_started", "in_progress", "on_hold"];

/** Statuses a task's doer may set (completion and cancellation need an approver / manager). */
export const DOER_TASK_STATUSES = ["not_started", "in_progress", "on_hold", "awaiting_approval"];

export const PROJECT_STATUS: Record<string, Label> = {
  planned: { label: "مخطط", tone: "idle" },
  active: { label: "نشط", tone: "info" },
  on_hold: { label: "متوقف", tone: "warn" },
  completed: { label: "مكتمل", tone: "ok" },
  cancelled: { label: "ملغى", tone: "idle" },
};

export const FIELD_LABELS: Record<string, string> = {
  title: "العنوان", details: "التفاصيل", status: "الحالة", scheduled_at: "الموعد", location: "المكان",
  minutes: "المحضر", minutes_approved_at: "اعتماد المحضر", meeting_type_id: "النوع", committee_id: "اللجنة",
  assignee_id: "المكلف", due_date: "تاريخ الاستحقاق", decided_on: "تاريخ القرار", meeting_id: "الاجتماع",
  archived_at: "الأرشفة", number: "الرقم", name: "الاسم", description: "الوصف", objective: "الهدف",
  progress: "نسبة الإنجاز", weight: "الوزن", priority_id: "الأولوية", start_date: "تاريخ البداية",
  end_date: "تاريخ النهاية", budget: "الميزانية", owner_id: "المسؤول", category_id: "التصنيف",
  weights_approved_at: "اعتماد الأوزان", completion_approved_at: "اعتماد الإنجاز", duties: "الاختصاصات",
  is_active: "التفعيل", last_update_note: "ملاحظة التحديث",
};
