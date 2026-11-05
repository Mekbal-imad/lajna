/**
 * بيانات تجريبية لتصميم الواجهة فقط — لا علاقة لها بقاعدة البيانات.
 * تُحذف عند ربط لوحة القيادة بالبيانات الفعلية (المرحلة الثالثة/الرابعة).
 */
import type { Tone } from "@/components/ui/status-badge";

export const MOCK_STATS = [
  { label: "الاجتماعات", value: 12 },
  { label: "القرارات المعتمدة", value: 9 },
  { label: "إجمالي المهام", value: 46 },
  { label: "مكتملة", value: 21 },
  { label: "قيد التنفيذ", value: 17 },
  { label: "متأخرة", value: 4, tone: "late" as Tone },
];

export const MOCK_TASK_STATUS: { label: string; value: number; tone: Tone }[] = [
  { label: "مكتملة", value: 21, tone: "ok" },
  { label: "قيد التنفيذ", value: 17, tone: "info" },
  { label: "لم تبدأ", value: 4, tone: "idle" },
  { label: "متأخرة", value: 4, tone: "late" },
];

export const MOCK_ATTENTION = [
  { title: "إصلاح تسرب المياه في دورات المياه", committee: "لجنة الصيانة", due: "متأخرة 6 أيام" },
  { title: "تجهيز خطة نظافة المصلى لشهر رمضان", committee: "لجنة النظافة", due: "متأخرة 3 أيام" },
  { title: "إعداد لوحة إرشادية لمداخل المدرسة", committee: "لجنة التنظيم", due: "تنتهي غدًا" },
];

export const MOCK_DECISIONS: { no: string; title: string; status: string; tone: Tone }[] = [
  { no: "2026-009", title: "اعتماد جدول مناوبات النظافة الأسبوعي", status: "معتمد", tone: "ok" },
  { no: "2026-008", title: "تخصيص ميزانية لصيانة المكيفات", status: "قيد التنفيذ", tone: "info" },
  { no: "2026-007", title: "تنظيم مواقف السيارات أيام الجمعة", status: "مقترح", tone: "warn" },
];

export const MOCK_ACTIVITY = [
  { text: "أُسندت مهمة «طلاء الجدار الشرقي» إلى لجنة الصيانة", when: "قبل ساعتين" },
  { text: "اعتُمد القرار رقم 2026-009", when: "أمس" },
  { text: "وصل بلاغ صيانة جديد: عطل في مكبر الصوت", when: "أمس" },
];

export const MOCK_COMMITTEES = [
  { name: "لجنة الصيانة", progress: 62 },
  { name: "لجنة النظافة", progress: 78 },
  { name: "لجنة التنظيم", progress: 45 },
];
