"use client";
import { useActionState } from "react";
import { saveMeeting } from "./actions";
import type { ActionState } from "@/lib/errors";
const initial: ActionState = {};
export function MeetingForm({ meeting }: { meeting?: {id:string;title:string;meeting_type:string;status:string;starts_at:string;location:string|null;description:string|null;minutes:string|null} }) {
 const [state, action, pending] = useActionState(saveMeeting, initial);
 return <form action={action} className="space-y-4 border border-line bg-white p-4">
  {meeting && <input type="hidden" name="id" value={meeting.id}/>}
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="field">عنوان الاجتماع<input required name="title" defaultValue={meeting?.title} minLength={3} maxLength={180}/></label>
   <label className="field">التاريخ والوقت<input required type="datetime-local" name="startsAt" defaultValue={meeting?.starts_at ? new Date(meeting.starts_at).toISOString().slice(0,16) : ""}/></label>
   <label className="field">نوع الاجتماع<select name="meetingType" defaultValue={meeting?.meeting_type ?? "regular"}><option value="regular">عادي</option><option value="extraordinary">استثنائي</option><option value="coordination">تنسيقي</option><option value="evaluation">تقييم دوري</option></select></label>
   <label className="field">الحالة<select name="status" defaultValue={meeting?.status ?? "draft"}><option value="draft">مسودة</option><option value="scheduled">مجدول</option><option value="held">منعقد</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></select></label>
   <label className="field sm:col-span-2">المكان<input name="location" defaultValue={meeting?.location ?? ""}/></label>
   <label className="field sm:col-span-2">الوصف وجدول الأعمال<textarea name="description" rows={4} defaultValue={meeting?.description ?? ""}/></label>
   <label className="field sm:col-span-2">محضر الاجتماع<textarea name="minutes" rows={6} defaultValue={meeting?.minutes ?? ""}/></label>
  </div>
  {state.error && <p role="alert" className="text-sm text-st-late">{state.error}</p>}
  {state.ok && <p role="status" className="text-sm text-st-ok">{state.ok}</p>}
  <button disabled={pending} className="button-primary">{pending?"جارٍ الحفظ…":meeting?"حفظ التعديلات":"إنشاء الاجتماع"}</button>
 </form>;
}
