import { AlertTriangle } from "lucide-react";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import {
  MOCK_ACTIVITY, MOCK_ATTENTION, MOCK_COMMITTEES, MOCK_DECISIONS, MOCK_STATS, MOCK_TASK_STATUS,
} from "@/lib/mock/dashboard";
import { cn } from "@/lib/utils";

export const metadata = { title: "لوحة القيادة" };

const BAR: Record<Tone, string> = {
  ok: "bg-st-ok", warn: "bg-st-warn", late: "bg-st-late", info: "bg-st-info", idle: "bg-st-idle",
};

export default function DashboardPage() {
  const total = MOCK_TASK_STATUS.reduce((s, x) => s + x.value, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest">لوحة القيادة</h1>
        <p className="mt-1 text-sm text-muted">نظرة عامة على أعمال اللجنة.</p>
      </div>

      <p role="note" className="border-s-2 border-gold bg-ivory px-3 py-2 text-sm">
        الأرقام المعروضة بيانات تجريبية لتصميم الواجهة، وستُستبدل بالبيانات الفعلية عند ربط الأقسام بقاعدة البيانات.
      </p>

      <dl className="grid grid-cols-2 divide-x divide-x-reverse divide-line border border-line bg-white sm:grid-cols-3 lg:grid-cols-6">
        {MOCK_STATS.map((s) => (
          <div key={s.label} className="border-b border-line px-4 py-4 lg:border-b-0">
            <dd className={cn("font-display text-3xl font-bold", s.tone === "late" ? "text-st-late" : "text-forest")}>
              {s.value}
            </dd>
            <dt className="mt-1 text-sm text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      <Section title="تحتاج إلى تدخل" hint="مهام متأخرة أو تنتهي قريبًا">
        {MOCK_ATTENTION.length === 0 ? (
          <EmptyState title="لا توجد مهام تحتاج إلى تدخل الآن." />
        ) : (
          <ul className="divide-y divide-line">
            {MOCK_ATTENTION.map((t) => (
              <li key={t.title} className="flex items-start gap-3 px-4 py-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-st-late" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-sm text-muted">{t.committee}</p>
                </div>
                <span className="shrink-0 text-sm text-st-late">{t.due}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="توزيع المهام حسب الحالة">
          <div className="space-y-3 px-4 py-4">
            <div className="flex h-3 overflow-hidden rounded-sm bg-ivory" role="img"
              aria-label="توزيع المهام حسب الحالة">
              {MOCK_TASK_STATUS.map((s) => (
                <div key={s.label} className={BAR[s.tone]} style={{ width: `${(s.value / total) * 100}%` }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {MOCK_TASK_STATUS.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-sm", BAR[s.tone])} />
                  <span className="flex-1">{s.label}</span>
                  <span className="font-medium">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="تقدم اللجان الفرعية">
          <ul className="space-y-4 px-4 py-4">
            {MOCK_COMMITTEES.map((c) => (
              <li key={c.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-muted">{c.progress}%</span>
                </div>
                <div className="h-2 bg-ivory" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0}
                  aria-valuemax={100} aria-label={c.name}>
                  <div className="h-full bg-forest" style={{ width: `${c.progress}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="آخر القرارات">
          <ul className="divide-y divide-line">
            {MOCK_DECISIONS.map((d) => (
              <li key={d.no} className="flex items-start gap-3 px-4 py-3">
                <span className="shrink-0 text-xs text-muted" dir="ltr">{d.no}</span>
                <p className="flex-1 text-sm">{d.title}</p>
                <StatusBadge tone={d.tone}>{d.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="آخر النشاطات">
          <ul className="divide-y divide-line">
            {MOCK_ACTIVITY.map((a) => (
              <li key={a.text} className="px-4 py-3">
                <p className="text-sm">{a.text}</p>
                <p className="mt-0.5 text-xs text-muted">{a.when}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
