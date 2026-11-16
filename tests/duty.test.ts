import { describe, expect, it } from "vitest";
import { parseDelayMinutes, parseDutyDate, parseDutyReport, summarize, type DutyRow } from "../lib/duty";

const ITEMS = (o: Record<string, string>) => Object.entries(o).map(([q, a]) => ({ q, a }));
const DUTY = ["1. القدوم قبل أذان المغرب", "2. تنظيم قاعات", "3. القيام بتشغيل", "4. تنظيف المراحيض", "5. تنظيم القاعات ورفع", "6. رمي سلة", "7. فتح باب"];

describe("parsers", () => {
  it("reads delay minutes from free text", () => {
    expect(parseDelayMinutes("5 دقائق")).toBe(5);
    expect(parseDelayMinutes("تأخرت ١٠ دقائق")).toBe(10);
    expect(parseDelayMinutes("ربع ساعة")).toBe(15);
    expect(parseDelayMinutes("نصف ساعة")).toBe(30);
    expect(parseDelayMinutes("ساعة ونصف")).toBe(90);
    expect(parseDelayMinutes("ساعة")).toBe(60);
    expect(parseDelayMinutes("12")).toBe(12);
    expect(parseDelayMinutes("بسبب المرض")).toBeNull();
    expect(parseDelayMinutes(null)).toBeNull();
  });
  it("reads both date formats and rejects impossible dates", () => {
    expect(parseDutyDate("2026-11-13")).toBe("2026-11-13");
    expect(parseDutyDate("13/11/2026")).toBe("2026-11-13");
    expect(parseDutyDate("31/02/2026")).toBeNull();
  });
});

describe("parseDutyReport (real sample rows)", () => {
  it("late with a note and missed duties", () => {
    const r = parseDutyReport({
      responseId: "x", timestamp: "2026-11-16T15:52:41.000Z",
      items: ITEMS({
        "اسم المداوم": "مقبال عماد", "التاريخ": "2026-11-13",
        "حالة الحضور للمداومة (الموعد: قبل أذان المغرب بـ 20 دقيقة)": "متأخر (حضر بعد الموعد المحدد)",
        "في حال التأخر أو الغياب: اذكر مدة التأخر": "5 دقائق",
        [DUTY[0]!]: "لم يتم", [DUTY[1]!]: "تم", [DUTY[2]!]: "تم", [DUTY[3]!]: "لم يتم", [DUTY[4]!]: "تم", [DUTY[5]!]: "تم", [DUTY[6]!]: "تم",
        "التقييم العام لسير المداومة اليوم": "متوسط", "هل توجد نواقص في المستلزمات": "لا توجد أكياس قمامة",
      }),
    });
    expect(r.row).toMatchObject({ person_name: "مقبال عماد", duty_date: "2026-11-13", attendance: "late", delay_minutes: 5,
      c1: false, c2: true, c4: false, c7: true, rating: 2, shortage_status: "open" });
  });
  it("on time, no shortages", () => {
    const r = parseDutyReport({ responseId: "y", timestamp: "2026-11-16T13:39:44.000Z", items: ITEMS({
      "اسم المداوم": "محمد", "حالة الحضور للمداومة (الموعد)": "حاضر في الوقت (قبل أذان المغرب بـ 20 دقيقة أو أكثر)",
      "هل توجد نواقص في المستلزمات": "لا", "التقييم العام لسير المداومة اليوم": "حسن" }) });
    expect(r.row).toMatchObject({ attendance: "on_time", duty_date: "2026-11-16", delay_minutes: null, rating: 3, shortage_status: "none" });
  });
  it("rejects a report without a name or with an unknown status", () => {
    expect(parseDutyReport({ responseId: "z", items: [] })).toEqual({ error: "اسم المداوم مفقود." });
    expect(parseDutyReport({ responseId: "z", items: ITEMS({ "اسم المداوم": "a" }) })).toEqual({ error: "حالة الحضور غير معروفة." });
  });
});

describe("summarize", () => {
  const base = { delay_minutes: null, c1: true, c2: true, c3: true, c4: true, c5: true, c6: true, c7: true, rating: 3, shortage_status: "none" };
  const rows: DutyRow[] = [
    { ...base, id: "1", person_name: "أ", duty_date: "2026-11-10", attendance: "on_time", submitted_at: "2026-11-10T20:00:00Z" },
    { ...base, id: "2", person_name: "ب", duty_date: "2026-11-11", attendance: "late", delay_minutes: 10, c1: false, submitted_at: "2026-11-15T20:00:00Z" },
    { ...base, id: "3", person_name: "أ", duty_date: "2026-11-13", attendance: "absent_unexcused", rating: null, submitted_at: "2026-11-13T20:00:00Z" },
  ];
  it("counts, rates, missing days and late filing", () => {
    const s = summarize(rows, "2026-11-10", "2026-11-14", "2026-11-14");
    expect(s.missingDays).toEqual(["2026-11-12"]);          // 14th is "today": not missing yet
    expect(s.onTimeRate).toBe(33);
    expect(s.attendance).toMatchObject({ on_time: 1, late: 1, absent_unexcused: 1 });
    expect(s.avgDelay).toBe(10);
    expect(s.duties[0]).toMatchObject({ answered: 2, done: 1, rate: 50 });
    expect(s.lateFiled).toBe(1);
    expect(s.people.find((p) => p.name === "أ")).toMatchObject({ shifts: 2, absent: 1 });
  });
});
