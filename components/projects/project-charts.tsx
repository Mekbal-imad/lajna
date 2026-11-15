"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TaskBar = { name: string; progress: number };
type Point = { date: string; progress: number };

const FOREST = "#173F32";
const GOLD = "#B69A62";
const TRACK = "#E4DCC8";

export function ProjectCharts({ progress, tasks, timeline }: { progress: number; tasks: TaskBar[]; timeline: Point[] }) {
  const donut = [{ name: "منجز", value: progress }, { name: "المتبقي", value: Math.max(0, 100 - progress) }];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <figure className="border border-line bg-white p-4">
        <figcaption className="mb-2 text-sm font-semibold text-forest">نسبة الإنجاز الإجمالية</figcaption>
        <div className="relative h-52" role="img" aria-label={`نسبة إنجاز المشروع ${progress}%`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" innerRadius="62%" outerRadius="85%" startAngle={90} endAngle={-270} stroke="none">
                <Cell fill={FOREST} />
                <Cell fill={TRACK} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-3xl font-bold text-forest">{progress}%</div>
        </div>
      </figure>

      <figure className="border border-line bg-white p-4">
        <figcaption className="mb-2 text-sm font-semibold text-forest">تقدم المهام</figcaption>
        {tasks.length === 0 ? <p className="py-16 text-center text-sm text-muted">لا توجد مهام بعد.</p> : (
          <div className="h-52" role="img" aria-label="مقارنة تقدم مهام المشروع">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasks} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid horizontal={false} stroke={TRACK} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}%`, "الإنجاز"]} />
                <Bar dataKey="progress" fill={FOREST} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </figure>

      <figure className="border border-line bg-white p-4 lg:col-span-2">
        <figcaption className="mb-2 text-sm font-semibold text-forest">تطور المشروع عبر الزمن</figcaption>
        {timeline.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted">يتكوّن هذا الرسم مع تحديث المهام عبر الأيام (نقطة لكل يوم يتغيّر فيه التقدم).</p>
        ) : (
          <div className="h-52" role="img" aria-label="تطور نسبة إنجاز المشروع">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ left: 0, right: 12 }}>
                <CartesianGrid stroke={TRACK} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}%`, "الإنجاز"]} />
                <Line type="monotone" dataKey="progress" stroke={GOLD} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </figure>
    </div>
  );
}
