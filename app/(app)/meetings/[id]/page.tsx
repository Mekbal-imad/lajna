import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Section } from "@/components/ui/section";
import { MeetingForm } from "../meeting-form";
export default async function MeetingDetails({params}:{params:Promise<{id:string}>}) {
 await requirePermission("meetings.view"); const {id}=await params; const supabase=await createClient();
 const [{data:meeting,error},{data:attendees}]=await Promise.all([
  supabase.from("meetings").select("*").eq("id",id).maybeSingle(),
  supabase.from("meeting_attendees").select("user_id,attendance_status,invited,profiles(full_name)").eq("meeting_id",id),
 ]);
 if(error||!meeting) notFound();
 const ctx=await requirePermission("meetings.view"); const canManage=ctx.permissions.includes("meetings.manage");
 const attendance:Record<string,string>={present:"حاضر",absent:"غائب",excused:"غائب بعذر",late:"متأخر",invited:"لم يسجل"};
 return <div className="mx-auto max-w-5xl space-y-6"><div><Link href="/meetings" className="text-sm text-muted underline">الاجتماعات</Link><h1 className="mt-2 text-2xl font-bold text-forest">{meeting.title}</h1></div>
  <Section title="بيانات الاجتماع"><div className="grid gap-3 p-4 sm:grid-cols-2 text-sm"><p>التاريخ: {new Date(meeting.starts_at).toLocaleString("ar-DZ")}</p><p>المكان: {meeting.location||"—"}</p><p>الحالة: {meeting.status}</p><p>النوع: {meeting.meeting_type}</p><p className="sm:col-span-2 whitespace-pre-wrap">{meeting.description||"لا يوجد وصف."}</p></div></Section>
  <Section title="الحضور"><div className="divide-y divide-line">{attendees?.length?attendees.map((a:any)=><div key={a.user_id} className="flex justify-between p-3 text-sm"><span>{a.profiles?.full_name??"عضو"}</span><span>{attendance[a.attendance_status]??a.attendance_status}</span></div>):<p className="p-4 text-sm text-muted">لم تتم إضافة قائمة الحضور بعد. تُضاف إدارة الحضور في التحديث التالي.</p>}</div></Section>
  <Section title="محضر الاجتماع"><p className="whitespace-pre-wrap p-4 text-sm leading-8">{meeting.minutes||"لم يُسجل المحضر بعد."}</p></Section>
  {canManage&&<Section title="تعديل بيانات الاجتماع"><div className="p-4"><MeetingForm meeting={meeting}/></div></Section>}
 </div>;
}
