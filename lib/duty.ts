import { z } from "zod";
import type { Tone } from "@/components/ui/status-badge";

export const ATTENDANCE: Record<string, { label: string; tone: Tone }> = {
  on_time: { label: "حاضر في الوقت", tone: "ok" },
  late: { label: "متأخر", tone: "warn" },
  absent_excused: { label: "غائب بعذر أو ببديل", tone: "info" },
  absent_unexcused: { label: "غائب بدون عذر", tone: "late" },
};

export const RATING_LABEL: Record<number, string> = { 1: "ضعيف", 2: "متوسط", 3: "حسن", 4: "جيد" };

/** The 7 duties of the shift, short names (the form has the full wording). */
export const DUTIES = [
  "القدوم قبل الأذان بـ 20 دقيقة",
  "تنظيم القاعات ورفع طاولات الصغار",
  "تشغيل اللوحة الرقمية",
  "تنظيف المراحيض وتطهيرها",
  "ترتيب القاعات وتطهير الجو",
  "رمي سلة المهملات وتغيير الكيس",
  "فتح الباب مع أذان المغرب",
] as const;

export const intakeSchema = z.object({
  responseId: z.string().min(1).max(200),
  timestamp: z.string().max(40).optional(),
  items: z.array(z.object({ q: z.string().max(400), a: z.string().max(20000) })).max(60),
});
export type IntakePayload = z.infer<typeof intakeSchema>;

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
const cap = (s: string | null, n: number) => (s ? s.slice(0, n) : null);

/** Minutes of delay written in free text: "5 دقائق", "ربع ساعة", "ساعة ونصف", "10". Null when none found. */
export function parseDelayMinutes(text: string | null): number | null {
  if (!text) return null;
  const t = westernDigits(text);
  let m: RegExpMatchArray | null;
  if (/ساعة\s*و\s*نصف|ساعة ونصف/.test(t)) return 90;
  if (/ربع\s*ساعة/.test(t)) return 15;
  if (/نصف\s*ساعة/.test(t)) return 30;
  if ((m = t.match(/(\d{1,3})\s*(?:دقيقة|دقائق|دقايق|د\b|min)/i))) return Math.min(600, Number(m[1]));
  if ((m = t.match(/(\d{1,2})\s*ساع/))) return Math.min(600, Number(m[1]) * 60);
  if (/(^|\s)ساعة(\s|$)/.test(t)) return 60;
  if ((m = t.trim().match(/^(\d{1,3})$/))) return Math.min(600, Number(m[1]));
  return null;
}

/** Accepts yyyy-mm-dd or dd/mm/yyyy (Arabic digits too). Returns yyyy-mm-dd or null. */
export function parseDutyDate(text: string | null): string | null {
  if (!text) return null;
  const t = westernDigits(text.trim());
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) { d = +m[1]!; mo = +m[2]!; y = +m[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const NO_SHORTAGE = /^(لا|لا\s*يوجد|لا\s*توجد|بدون|لا\s*شيء|لاشيء|\.|-|—)\s*[.!،]?$/;

export function parseDutyReport(p: IntakePayload) {
  const items = p.items.map((i) => ({ q: i.q.trim(), a: i.a.trim() }));
  const answer = (match: (q: string) => boolean) => items.find((i) => match(i.q) && i.a)?.a ?? null;

  const name = answer((q) => q.startsWith("اسم المداوم"));
  if (!name) return { error: "اسم المداوم مفقود." as const };

  const att = answer((q) => q.startsWith("حالة الحضور")) ?? "";
  const attendance = att.startsWith("حاضر") ? "on_time"
    : att.startsWith("متأخر") ? "late"
    : att.startsWith("غائب") && att.includes("بدون") ? "absent_unexcused"
    : att.startsWith("غائب") ? "absent_excused" : null;
  if (!attendance) return { error: "حالة الحضور غير معروفة." as const };

  const submitted = p.timestamp ? new Date(p.timestamp) : null;
  const submittedAt = submitted && !Number.isNaN(submitted.getTime()) ? submitted : new Date();
  const dutyDate = parseDutyDate(answer((q) => q.startsWith("التاريخ"))) ?? submittedAt.toISOString().slice(0, 10);

  const checks: Record<string, boolean | null> = {};
  for (let n = 1; n <= 7; n++) {
    const a = answer((q) => q.startsWith(`${n}.`));
    checks[`c${n}`] = a === null ? null : a.startsWith("لم") ? false : a.startsWith("تم") ? true : null;
  }

  const ratingText = answer((q) => q.startsWith("التقييم العام")) ?? "";
  const rating = ({ ضعيف: 1, متوسط: 2, حسن: 3, جيد: 4 } as Record<string, number>)[ratingText] ?? null;

  const note = answer((q) => q.startsWith("في حال التأخر"));
  const shortages = answer((q) => q.startsWith("هل توجد نواقص"));

  return {
    row: {
      external_id: p.responseId,
      person_name: name.slice(0, 200),
      duty_date: dutyDate,
      attendance,
      arrival_time: cap(answer((q) => q.startsWith("وقت الوصول")), 50),
      delay_minutes: attendance === "late" ? parseDelayMinutes(note) : null,
      attendance_note: cap(note, 2000),
      ...checks,
      rating,
      shortages: cap(shortages, 5000),
      shortage_status: shortages && !NO_SHORTAGE.test(shortages) ? "open" : "none",
      notes: cap(answer((q) => q.startsWith("ملاحظات إضافية")), 5000),
      answers: items.filter((i) => i.a),
      submitted_at: submittedAt.toISOString(),
    },
  };
}

// ───────── statistics (pure; the dashboard computes them from the rows) ─────────
export type DutyRow = {
  id: string; person_name: string; duty_date: string; attendance: string; delay_minutes: number | null;
  c1: boolean | null; c2: boolean | null; c3: boolean | null; c4: boolean | null; c5: boolean | null;
  c6: boolean | null; c7: boolean | null; rating: number | null; shortage_status: string; submitted_at: string;
};

const DAY = 86_400_000;
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * `firstReportDate` = the day of the very first report ever received. Days before it are not counted as
 * missing: duty was not being reported yet (so a new site does not start with a long list of "missing" days).
 */
export function summarize(rows: DutyRow[], from: string, to: string, today: string, firstReportDate: string | null = null) {
  const inRange = rows.filter((r) => r.duty_date >= from && r.duty_date <= to);
  const reported = new Set(inRange.map((r) => r.duty_date));
  const countFrom = firstReportDate && firstReportDate > from ? firstReportDate : from;
  // today's shift happens after sunset: it only counts as missing from tomorrow on
  const missingDays = datesBetween(countFrom, to).filter((d) => d < today && !reported.has(d));

  const count = (a: string) => inRange.filter((r) => r.attendance === a).length;
  const present = inRange.filter((r) => r.attendance === "on_time" || r.attendance === "late");
  const delays = inRange.filter((r) => r.attendance === "late" && r.delay_minutes !== null).map((r) => r.delay_minutes!);
  const ratings = inRange.filter((r) => r.rating !== null).map((r) => r.rating!);

  const duties = DUTIES.map((label, i) => {
    const key = `c${i + 1}` as keyof DutyRow;
    const answered = present.filter((r) => r[key] !== null);
    const done = answered.filter((r) => r[key] === true).length;
    return { label, answered: answered.length, done, rate: answered.length ? Math.round((done / answered.length) * 100) : null };
  });

  const byPerson = new Map<string, { name: string; shifts: number; onTime: number; late: number; absent: number; delaySum: number; delayN: number; missed: number }>();
  for (const r of inRange) {
    const p = byPerson.get(r.person_name) ?? { name: r.person_name, shifts: 0, onTime: 0, late: 0, absent: 0, delaySum: 0, delayN: 0, missed: 0 };
    p.shifts++;
    if (r.attendance === "on_time") p.onTime++;
    else if (r.attendance === "late") p.late++;
    else p.absent++;
    if (r.attendance === "late" && r.delay_minutes !== null) { p.delaySum += r.delay_minutes; p.delayN++; }
    for (let i = 1; i <= 7; i++) if (r[`c${i}` as keyof DutyRow] === false) p.missed++;
    byPerson.set(r.person_name, p);
  }

  const lateFiled = inRange.filter(
    (r) => (Date.parse(r.submitted_at.slice(0, 10)) - Date.parse(r.duty_date)) / DAY > 1,
  ).length;

  return {
    reports: inRange.length,
    days: countFrom > to ? 0 : datesBetween(countFrom, to).filter((d) => d <= today).length,
    countedFrom: countFrom,
    reportedDays: reported.size,
    missingDays,
    attendance: { on_time: count("on_time"), late: count("late"), absent_excused: count("absent_excused"), absent_unexcused: count("absent_unexcused") },
    onTimeRate: inRange.length ? Math.round((count("on_time") / inRange.length) * 100) : null,
    avgDelay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    duties,
    people: [...byPerson.values()]
      .map((p) => ({ ...p, onTimeRate: Math.round((p.onTime / p.shifts) * 100), avgDelay: p.delayN ? Math.round(p.delaySum / p.delayN) : null }))
      .sort((a, b) => b.shifts - a.shifts),
    lateFiled,
    openShortages: inRange.filter((r) => r.shortage_status === "open").length,
  };
}
