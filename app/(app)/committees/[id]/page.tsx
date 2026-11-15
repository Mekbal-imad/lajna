import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Select, TextArea } from "@/components/ui/action-form";
import { HistorySection } from "@/components/shared/history-section";
import { EmptyState, Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { can, requirePermission } from "@/lib/auth/session";
import { getActiveMembers, getDirectory } from "@/lib/data/lookups";
import { formatDate, formatDateTime, todayLocal } from "@/lib/datetime";
import { MEETING_STATUS, OPEN_TASK_STATUSES, PROJECT_STATUS, TASK_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import {
  addCommitteePost, deleteCommittee, deleteCommitteePost, removeCommitteeMember, setCommitteeActive,
  setCommitteeMember, updateCommittee,
} from "../actions";

export const metadata = { title: "تفاصيل اللجنة" };

type Committee = { id: string; name_ar: string; description: string | null; duties: string | null; is_active: boolean };

export default async function CommitteePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("committees.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("committees").select("id, name_ar, description, duties, is_active").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as Committee;

  const [mRes, meetRes, taskRes, projRes, names, people, allTaskRes, postRes] = await Promise.all([
    supabase.from("committee_members").select("user_id, member_role").eq("committee_id", id),
    supabase.from("meetings").select("id, title, starts_at, status").eq("committee_id", id).is("archived_at", null).order("starts_at", { ascending: false }).limit(5),
    supabase.from("tasks").select("id, title, status, due_date").eq("committee_id", id).is("archived_at", null).not("status", "in", "(completed,cancelled)").order("due_date", { nullsFirst: false }).limit(10),
    supabase.from("projects").select("id, name, status").eq("committee_id", id).is("archived_at", null).order("created_at", { ascending: false }),
    getDirectory(), getActiveMembers(),
    supabase.from("tasks").select("id, status, due_date, task_assignees(user_id)").eq("committee_id", id).is("archived_at", null).limit(1000),
    supabase.from("committee_posts").select("id, kind, title, body, author_id, created_at").eq("committee_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const members = ((mRes.data ?? []) as { user_id: string; member_role: string }[])
    .sort((a, b) => (a.member_role === "head" ? -1 : 0) - (b.member_role === "head" ? -1 : 0));
  const meetings = (meetRes.data ?? []) as { id: string; title: string; starts_at: string; status: string }[];
  const tasks = (taskRes.data ?? []) as { id: string; title: string; status: string; due_date: string | null }[];
  const projects = (projRes.data ?? []) as { id: string; name: string; status: string }[];
  const progRes = projects.length
    ? await supabase.from("project_progress").select("project_id, progress").in("project_id", projects.map((p) => p.id))
    : { data: [] };
  const prog = new Map(((progRes.data ?? []) as { project_id: string; progress: number }[]).map((r) => [r.project_id, Number(r.progress)]));
  const canManage = can(ctx, "committees.manage");

  // Work follow-up: figures come from the tasks linked to this committee.
  const today = todayLocal();
  type T = { id: string; status: string; due_date: string | null; task_assignees: { user_id: string }[] };
  const all = ((allTaskRes.data ?? []) as unknown as T[]).filter((t) => t.status !== "cancelled");
  const isLate = (t: T) => !!t.due_date && t.due_date < today && OPEN_TASK_STATUSES.includes(t.status);
  const figures = [
    { label: "إجمالي المهام", value: all.length },
    { label: "منجزة", value: all.filter((t) => t.status === "completed").length },
    { label: "بانتظار الاعتماد", value: all.filter((t) => t.status === "awaiting_approval").length },
    { label: "متأخرة", value: all.filter(isLate).length, late: true },
  ];
  const load = (userId: string) => {
    const mine = all.filter((t) => t.task_assignees.some((a) => a.user_id === userId));
    return { open: mine.filter((t) => t.status !== "completed").length, done: mine.filter((t) => t.status === "completed").length, late: mine.filter(isLate).length };
  };
  const canAssign = can(ctx, "tasks.manage") || can(ctx, "tasks.manage_committee");
  const isHead = members.some((m) => m.user_id === ctx.userId && m.member_role === "head");
  const canPost = canManage || isHead;
  const posts = (postRes.data ?? []) as { id: string; kind: string; title: string | null; body: string; author_id: string | null; created_at: string }[];
  const POST_KIND: Record<string, { label: string; tone: "info" | "ok" | "idle" }> = {
    directive: { label: "تعميم من اللجنة الرئيسية", tone: "info" },
    report: { label: "تقرير اللجنة", tone: "ok" },
    note: { label: "ملاحظة", tone: "idle" },
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/committees" className="text-sm text-muted hover:text-forest">← اللجان الفرعية</Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-forest">{c.name_ar}</h1>
          {!c.is_active ? <StatusBadge tone="idle">معطّلة</StatusBadge> : null}
        </div>
      </div>

      {canManage ? (
        <Section title="بيانات اللجنة">
          <div className="px-4 py-4">
            <ActionForm action={updateCommittee} submitLabel="حفظ البيانات">
              <input type="hidden" name="id" value={c.id} />
              <Field label="اسم اللجنة" name="name" defaultValue={c.name_ar} required />
              <TextArea label="وصف اللجنة" name="description" rows={3} defaultValue={c.description ?? ""} />
              <TextArea label="اختصاصات اللجنة" name="duties" rows={4} defaultValue={c.duties ?? ""} />
            </ActionForm>
          </div>
        </Section>
      ) : (
        <Section title="عن اللجنة">
          <div className="space-y-3 px-4 py-4 text-sm">
            <p className="whitespace-pre-wrap">{c.description || "لا يوجد وصف."}</p>
            {c.duties ? <div><p className="font-medium">الاختصاصات</p><p className="whitespace-pre-wrap text-muted">{c.duties}</p></div> : null}
          </div>
        </Section>
      )}

      <Section title="الأعضاء" hint={`${members.length}`}>
        {members.length === 0 ? <EmptyState title="لا يوجد أعضاء في هذه اللجنة بعد." action={canManage ? "أضف أعضاء أدناه." : undefined} /> : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1">{names.get(m.user_id) ?? "مستخدم"}</span>
                <StatusBadge tone={m.member_role === "head" ? "info" : "idle"}>{m.member_role === "head" ? "رئيس اللجنة" : "عضو"}</StatusBadge>
                {canManage ? (
                  <ActionForm action={removeCommitteeMember} submitLabel="إزالة" variant="quiet" confirm="إزالة هذا العضو من اللجنة؟">
                    <input type="hidden" name="userId" value={m.user_id} /><input type="hidden" name="committeeId" value={c.id} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={setCommitteeMember} submitLabel="حفظ العضوية" variant="quiet">
              <input type="hidden" name="committeeId" value={c.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="العضو" name="userId" required placeholder="اختر عضوًا" options={people.map((p) => ({ value: p.id, label: p.name }))} />
                <Select label="الصفة" name="memberRole" defaultValue="member" options={[{ value: "member", label: "عضو" }, { value: "head", label: "رئيس اللجنة" }]} />
              </div>
              <p className="text-xs text-muted">اختيار عضو موجود يعدّل صفته. للجنة رئيس واحد فقط.</p>
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="متابعة الأعمال" hint="من مهام اللجنة">
        <dl className="grid grid-cols-2 divide-x divide-x-reverse divide-line sm:grid-cols-4">
          {figures.map((f) => (
            <div key={f.label} className="px-4 py-3">
              <dd className={`font-display text-2xl font-bold ${f.late && f.value > 0 ? "text-st-late" : "text-forest"}`}>{f.value}</dd>
              <dt className="text-xs text-muted">{f.label}</dt>
            </div>
          ))}
        </dl>
        {members.length > 0 ? (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-muted"><tr>{["العضو", "مفتوحة", "منجزة", "متأخرة", ""].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => {
                  const l = load(m.user_id);
                  return (
                    <tr key={m.user_id}>
                      <td className="px-4 py-2">{names.get(m.user_id) ?? "مستخدم"}</td>
                      <td className="px-4 py-2">{l.open}</td>
                      <td className="px-4 py-2">{l.done}</td>
                      <td className={`px-4 py-2 ${l.late > 0 ? "text-st-late" : ""}`}>{l.late}</td>
                      <td className="px-4 py-2 text-end">
                        {canAssign ? <Link href={`/tasks/new?committee=${c.id}&assignee=${m.user_id}`} className="text-forest hover:underline">+ إسناد مهمة</Link> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="border-t border-line px-4 py-3">
          <Link href={`/tasks?committee=${c.id}`} className="text-sm text-forest hover:underline">عرض كل مهام اللجنة ←</Link>
        </div>
      </Section>

      <Section title="التواصل والمتابعة" hint="تعاميم وتقارير بين اللجنة الرئيسية واللجنة الفرعية">
        {posts.length === 0 ? <EmptyState title="لا توجد رسائل بعد." action={canPost ? "انشر أول تعميم أو تقرير أدناه." : undefined} /> : (
          <ul className="divide-y divide-line">
            {posts.map((p) => {
              const k = POST_KIND[p.kind];
              return (
                <li key={p.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    {k ? <StatusBadge tone={k.tone}>{k.label}</StatusBadge> : null}
                    {p.title ? <span className="font-medium">{p.title}</span> : null}
                  </div>
                  <p className="whitespace-pre-wrap">{p.body}</p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{p.author_id ? names.get(p.author_id) ?? "مستخدم" : "—"} · {formatDateTime(p.created_at)}</span>
                    {canManage || p.author_id === ctx.userId ? (
                      <ActionForm action={deleteCommitteePost} submitLabel="حذف" variant="quiet" confirm="حذف هذه الرسالة؟">
                        <input type="hidden" name="id" value={p.id} /><input type="hidden" name="committeeId" value={c.id} />
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {canPost ? (
          <div className="border-t border-line px-4 py-4">
            <ActionForm action={addCommitteePost} submitLabel="نشر" variant="quiet">
              <input type="hidden" name="committeeId" value={c.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="النوع" name="kind" defaultValue={canManage ? "directive" : "report"}
                  options={[...(canManage ? [{ value: "directive", label: "تعميم من اللجنة الرئيسية" }] : []),
                    { value: "report", label: "تقرير اللجنة" }, { value: "note", label: "ملاحظة" }]} />
                <Field label="العنوان (اختياري)" name="title" />
              </div>
              <TextArea label="النص" name="body" rows={3} required />
            </ActionForm>
          </div>
        ) : null}
      </Section>

      <Section title="المشاريع" hint={`${projects.length}`}>
        {projects.length === 0 ? <EmptyState title="لا توجد مشاريع لهذه اللجنة." /> : (
          <ul className="divide-y divide-line">
            {projects.map((p) => {
              const st = PROJECT_STATUS[p.status];
              return (
                <li key={p.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Link href={`/projects/${p.id}`} className="flex-1 font-medium text-forest hover:underline">{p.name}</Link>
                    {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
                  </div>
                  <ProgressBar value={prog.get(p.id) ?? 0} label={p.name} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="مهام مفتوحة" hint="آخر 10">
        {tasks.length === 0 ? <EmptyState title="لا توجد مهام مفتوحة." /> : (
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const st = TASK_STATUS[t.status];
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/tasks/${t.id}`} className="flex-1 text-forest hover:underline">{t.title}</Link>
                  <span className="text-xs text-muted">{t.due_date ? formatDate(t.due_date) : "بلا موعد"}</span>
                  {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="اجتماعات اللجنة" hint="آخر 5">
        {meetings.length === 0 ? <EmptyState title="لا توجد اجتماعات خاصة بهذه اللجنة." /> : (
          <ul className="divide-y divide-line">
            {meetings.map((m) => {
              const st = MEETING_STATUS[m.status];
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/meetings/${m.id}`} className="flex-1 text-forest hover:underline">{m.title}</Link>
                  <span className="text-xs text-muted">{formatDateTime(m.starts_at)}</span>
                  {st ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <HistorySection table="committees" rowId={c.id} />

      {canManage ? (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-3 px-4 py-4">
            <ActionForm action={setCommitteeActive} variant="quiet" submitLabel={c.is_active ? "تعطيل اللجنة" : "تفعيل اللجنة"}
              confirm={c.is_active ? "التعطيل يخفي اللجنة من القوائم الجديدة وتبقى بياناتها. متابعة؟" : undefined}>
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.is_active ? "false" : "true"} />
            </ActionForm>
            <ActionForm action={deleteCommittee} variant="danger" submitLabel="حذف اللجنة"
              confirm="حذف اللجنة نهائي، ولا يُسمح به إلا إن لم ترتبط باجتماعات أو مهام أو مشاريع. متابعة؟">
              <input type="hidden" name="id" value={c.id} />
            </ActionForm>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
