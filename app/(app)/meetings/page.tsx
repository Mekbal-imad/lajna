import Link from "next/link";
import { CalendarPlus, CalendarDays } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Section, EmptyState } from "@/components/ui/section";
import { MeetingForm } from "./meeting-form";
export const metadata = { title: "الاجتماعات واللقاءات" };
export default async function MeetingsPage() {
 const ctx = await requirePermission("meetings.view");
 const supabase = await createClient();
 const [{data:meetings,error}, canManage] = await Promise.all([
  supabase.from("meetings").select("id,title,meeting_type,status,starts_at,location").order("starts_at",{ascending:false}).limit(100),
  Promise.resolve(ctx.permissions.includes("meetings.manage")),
 ]);
 const status:Record<string,string>={draft:"مسودة",scheduled:"مجدول",held:"منعقد",completed:"مكتمل",cancelled:"ملغى"};
 return <div className="mx-auto max-w-6xl space-y-6">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-forest">الاجتماعات واللقاءات</h1><p className="mt-1 text-sm text-muted">إنشاء الاجتماعات وتوثيق بياناتها ومحاضرها.</p></div>{canManage&&<a href="#new-meeting" className="inline-flex items-center gap-2 bg-forest px-4 py-2 text-sm font-semibold text-white"><CalendarPlus size={17}/> اجتماع جديد</a>}</div>
  {error&&<p role="alert" className="border border-st-late bg-white p-3 text-sm">تعذر تحميل الاجتماعات. تحقق من تطبيق ترحيل قاعدة البيانات والصلاحيات.</p>}
  <Section title="سجل الاجتماعات" hint={`${meetings?.length??0} اجتماع`}>
   {!meetings?.length?<EmptyState title="لا توجد اجتماعات مسجلة بعد." action={canManage?"استخدم زر اجتماع جديد لإضافة أول اجتماع.":undefined}/>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ivory text-start text-muted"><tr><th className="p-3 text-start">الاجتماع</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">المكان</th><th className="p-3 text-start">الحالة</th><th className="p-3"/></tr></thead><tbody>{meetings.map(m=><tr key={m.id} className="border-t border-line"><td className="p-3 font-semibold text-forest">{m.title}</td><td className="p-3" dir="ltr">{new Date(m.starts_at).toLocaleString("ar-DZ",{dateStyle:"medium",timeStyle:"short"})}</td><td className="p-3">{m.location||"—"}</td><td className="p-3"><span className="rounded bg-ivory px-2 py-1 text-xs">{status[m.status]??m.status}</span></td><td className="p-3"><Link className="text-forest underline" href={`/meetings/${m.id}`}>التفاصيل</Link></td></tr>)}</tbody></table></div>}
  </Section>
  {canManage&&<div id="new-meeting"><Section title="إنشاء اجتماع جديد"><div className="p-4"><MeetingForm/></div></Section></div>}
 </div>;
}
