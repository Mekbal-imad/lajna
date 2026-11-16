import Link from "next/link";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, todayLocal } from "@/lib/datetime";
import { ATTENDANCE, DUTY_START_DATE, RATING_LABEL, summarize, type DutyRow } from "@/lib/duty";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "المداومة" };

const RANGES = [7, 30, 90] as const;
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "bad" ? "text-st-late" : "text-forest")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function DutyPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePermission("duty.view");
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const today = todayLocal();
  const windowStart = shift(today, -(days - 1));
  const from = windowStart > DUTY_START_DATE ? windowStart : DUTY_START_DATE;

  if (today < DUTY_START_DATE) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-forest">المداومة</h1>
        <p className="border border-line bg-white p-6 text-sm">
          تبدأ المتابعة الرسمية للمداومة يوم {formatDate(DUTY_START_DATE)}. ستظهر هنا الإحصاءات بعد وصول أول تقارير ذلك اليوم.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("duty_reports")
    .select("id, person_name, duty_date, attendance, delay_minutes, c1, c2, c3, c4, c5, c6, c7, rating, shortage_status, submitted_at")
    .gte("duty_date", from).lte("duty_date", today)
    .order("duty_date", { ascending: false }).order("submitted_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as DutyRow[];
  const s = summarize(rows, from, today, today);
  const open = rows.filter((r) => r.shortage_status === "open");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">المداومة</h1>
        <p className="mt-1 text-sm text-muted">متابعة سير المداومة اليومية والتزام المداومين بالموعد، من تقارير النموذج.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {RANGES.map((d) => (
          <Link key={d} href={`/duty?days=${d}`} className={cn("rounded px-3 py-1.5", d === days ? "bg-forest text-ivory" : "border border-line")}>
            آخر {d} يومًا
          </Link>
        ))}
      </div>

      {error ? <p role="alert" className="border border-st-late bg-white p-3 text-sm">تعذّر تحميل التقارير.</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="أيام بها تقرير" value={`${s.reportedDays} / ${s.days}`} hint={`${s.reports} تقرير`} />
        <Stat label="أيام بلا تقرير" value={String(s.missingDays.length)} tone={s.missingDays.length ? "bad" : undefined} hint={`منذ ${formatDate(s.countedFrom)}، دون اليوم الحالي`} />
        <Stat label="نسبة الحضور في الوقت" value={s.onTimeRate === null ? "—" : `${s.onTimeRate}%`}
          hint={s.avgDelay === null ? undefined : `متوسط التأخر ${s.avgDelay} د`} />
        <Stat label="متوسط التقييم" value={s.avgRating === null ? "—" : `${s.avgRating} / 4`}
          hint={s.avgRating === null ? undefined : (RATING_LABEL[Math.round(s.avgRating)] ?? undefined)} />
      </div>

      {s.missingDays.length > 0 ? (
        <Section title="أيام بلا تقرير مداومة" hint={`${s.missingDays.length} يومًا`}>
          <p className="flex flex-wrap gap-2 p-4 text-sm">
            {s.missingDays.map((d) => <span key={d} className="border border-st-late px-2 py-1">{formatDate(d)}</span>)}
          </p>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="الحضور" hint={`${s.reports} تقرير`}>
          <ul className="divide-y divide-line text-sm">
            {Object.entries(ATTENDANCE).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between px-4 py-3">
                <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
                <span className="font-semibold">{s.attendance[k as keyof typeof s.attendance]}</span>
              </li>
            ))}
          </ul>
          {s.lateFiled > 0 ? <p className="border-t border-line px-4 py-3 text-xs text-muted">{s.lateFiled} تقرير سُلِّم بعد أكثر من يوم من تاريخ المداومة.</p> : null}
        </Section>

        <Section title="إنجاز مهام المداومة" hint="نسبة «تم» بين الحاضرين">
          <ul className="divide-y divide-line">
            {s.duties.map((d, i) => (
              <li key={d.label} className="space-y-1 px-4 py-3 text-sm">
                <p>{i + 1}. {d.label}</p>
                {d.rate === null ? <p className="text-xs text-muted">لا بيانات</p> : <ProgressBar value={d.rate} label={d.label} />}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="المداومون" hint="حسب عدد المناوبات">
        {s.people.length === 0 ? <EmptyState title="لا توجد تقارير في هذه الفترة." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory text-muted">
                <tr>
                  <th className="p-3 text-start">الاسم</th><th className="p-3 text-start">المناوبات</th>
                  <th className="p-3 text-start">في الوقت</th><th className="p-3 text-start">متأخر</th>
                  <th className="p-3 text-start">غائب</th><th className="p-3 text-start">متوسط التأخر</th>
                  <th className="p-3 text-start">مهام لم تتم</th>
                </tr>
              </thead>
              <tbody>
                {s.people.map((p) => (
                  <tr key={p.name} className="border-t border-line">
                    <td className="p-3 font-semibold">{p.name}</td>
                    <td className="p-3">{p.shifts}</td>
                    <td className="p-3">{p.onTime} <span className="text-xs text-muted">({p.onTimeRate}%)</span></td>
                    <td className="p-3">{p.late}</td>
                    <td className="p-3">{p.absent}</td>
                    <td className="p-3">{p.avgDelay === null ? "—" : `${p.avgDelay} د`}</td>
                    <td className="p-3">{p.missed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {open.length > 0 ? (
        <Section title="نواقص وأعطال بلا معالجة" hint={`${open.length}`}>
          <ul className="divide-y divide-line text-sm">
            {open.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Link href={`/duty/${r.id}`} className="text-forest hover:underline">{formatDate(r.duty_date)} — {r.person_name}</Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="آخر التقارير" hint={`${rows.length}`}>
        {rows.length === 0 ? <EmptyState title="لا توجد تقارير في هذه الفترة." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory text-muted">
                <tr>
                  <th className="p-3 text-start">اليوم</th><th className="p-3 text-start">المداوم</th>
                  <th className="p-3 text-start">الحضور</th><th className="p-3 text-start">المهام</th>
                  <th className="p-3 text-start">التقييم</th><th className="p-3 text-start">نواقص</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((r) => {
                  const a = ATTENDANCE[r.attendance];
                  const answered = [r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7].filter((v) => v !== null);
                  const done = answered.filter(Boolean).length;
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-3 whitespace-nowrap"><Link href={`/duty/${r.id}`} className="text-forest hover:underline">{formatDate(r.duty_date)}</Link></td>
                      <td className="p-3">{r.person_name}</td>
                      <td className="p-3">{a ? <StatusBadge tone={a.tone}>{a.label}</StatusBadge> : r.attendance}
                        {r.delay_minutes ? <span className="ms-2 text-xs text-muted">{r.delay_minutes} د</span> : null}</td>
                      <td className="p-3">{answered.length ? `${done} / ${answered.length}` : "—"}</td>
                      <td className="p-3">{r.rating ? RATING_LABEL[r.rating] : "—"}</td>
                      <td className="p-3">{r.shortage_status === "open" ? <StatusBadge tone="warn">مفتوح</StatusBadge> : r.shortage_status === "handled" ? <StatusBadge tone="ok">عولج</StatusBadge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
