import { describe, expect, it } from "vitest";
import { parseSubmission } from "../lib/submissions";

const Q = {
  kind: "ما طبيعة رسالتك؟", name: "الاسم واللقب", nameOpt: "الاسم واللقب (اختياري)", role: "الصفة داخل المدرسة",
  title: "عنوان مختصر للرسالة", details: "تفاصيل الموضوع", area: "المجال المعني",
  urgent: "هل يتطلب الموضوع تدخلاً عاجلاً؟", solution: "هل لديك حل أو مقترح لمعالجة الموضوع؟",
  contact: "هل ترغب في أن يتم التواصل معك بخصوص هذه المشاركة؟", phone: "رقم الهاتف أو وسيلة التواصل",
};

describe("parseSubmission", () => {
  it("maps a complaint (real sample: optional name, role, urgent)", () => {
    const r = parseSubmission({
      responseId: "r1", timestamp: "2026-11-02T10:51:19.000Z",
      items: [
        { q: Q.kind, a: "شكوى" }, { q: Q.nameOpt, a: "عمي محمد" }, { q: Q.role, a: "عامل" },
        { q: Q.title, a: "مشكلة خاصة بالطاولات" }, { q: Q.details, a: "لا يوجد مكان للطاولات" },
        { q: Q.area, a: "التنظيم والإدارة" }, { q: Q.urgent, a: "لا، يمكن معالجته بشكل عادي" },
        { q: Q.solution, a: "صنع رف" }, { q: Q.contact, a: "نعم" }, { q: Q.phone, a: "0555683416" },
        { q: Q.name, a: "" },
      ],
    });
    expect(r.row).toMatchObject({
      kind: "complaint", title: "مشكلة خاصة بالطاولات", submitter_name: "عمي محمد", submitter_role: "عامل",
      urgent: false, contact_requested: true, contact_info: "0555683416", area: "التنظيم والإدارة",
    });
  });

  it("marks urgent when the answer starts with نعم", () => {
    const r = parseSubmission({ responseId: "r2", items: [
      { q: Q.kind, a: "شكوى" }, { q: Q.title, a: "x" }, { q: Q.urgent, a: "نعم، يتطلب تدخلاً عاجلاً" }] });
    expect(r.row?.urgent).toBe(true);
  });

  it("builds a title for an inquiry that has none", () => {
    const r = parseSubmission({ responseId: "r3", items: [
      { q: Q.kind, a: "استفسار" }, { q: Q.name, a: "مادور محمّد" }, { q: Q.role, a: "مشرف فوج" },
      { q: Q.contact, a: "نعم" }, { q: Q.phone, a: "رقم الهاتف 0562742925" }] });
    expect(r.row?.title).toBe("استفسار من مادور محمّد");
  });

  it("rejects an unknown kind and keeps every non-empty answer", () => {
    expect(parseSubmission({ responseId: "r4", items: [{ q: Q.kind, a: "؟" }] })).toEqual({ error: "نوع الرسالة غير معروف." });
    const r = parseSubmission({ responseId: "r5", items: [{ q: Q.kind, a: "اقتراح" }, { q: Q.title, a: "t" }, { q: Q.area, a: "" }] });
    expect(r.row?.answers).toHaveLength(2);
  });
});
