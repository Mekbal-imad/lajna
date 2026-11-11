# Project status

Last update: 2026-11-05 — Phase 2 (auth & permissions) written. **Nothing has been run yet** (no npm install, build, migration or test execution was possible in the authoring environment).

## Written
- Phase 1: Next.js/TS/Tailwind scaffold, Arabic RTL, light theme (Tajawal/Cairo), login, protected routes, responsive shell, dashboard with **mock data** (`lib/mock/dashboard.ts`), foundation migration + RLS.
- Phase 2:
  - Migration `20261105010000_phase2_auth.sql`: `my_permissions()`, `is_super_admin()`, role-assignment guard trigger, one-head-per-committee + head sync.
  - Session helpers (`lib/auth/session.ts`), permission-filtered navigation, `/forbidden`, `/auth/inactive` (signs out disabled accounts), login "disabled" message.
  - User management: list + search (`/users`), create (`/users/new`), detail (`/users/[id]`: profile, roles, committee membership, activate/deactivate), `/account` (change own password). All writes go through server actions with Zod + permission checks + audit log.
  - SQL tests: `supabase/tests/001_rls_foundation.sql`, `002_rls_phase2.sql`.
  - Docs translated to English (README, DEPLOYMENT, PERMISSIONS, DATABASE, ARCHITECTURE).

## Not done
- Everything above is untested. First steps for the integrator: `npm install && npm run typecheck && npm run build`, apply migrations on a dev project, run both SQL test files, then click through login → create user → assign role → committee membership → deactivate.
- `SUPABASE_SERVICE_ROLE_KEY` is now required (user creation).
- shadcn/ui not initialised (plain Tailwind components).
- No email invitation / password-reset flow; admin sets a temporary password.
- Committees pages, meetings, decisions, tasks, etc. (phases 3–6). Dashboard still shows mock data.
- Phase-1 SQL comments are partly Arabic.

## Decisions
- Tailwind 3.4; logical CSS properties (`ms-`, `start-`) for RTL.
- Permissions are DB-driven; navigation hiding is cosmetic.
- No hard delete of users from the app; deactivation only.

## Known issues
- None confirmed (untested).

## Next
Phase 3: dashboard on real data, committees pages, meetings, decisions, minutes.

## تحديث التطوير — 2026-11-06

### المنجز في هذه الدفعة
- إضافة Migration تشغيلية: `20261106000000_committee_operations.sql` تشمل الاجتماعات والحضور وجدول الأعمال والقرارات والمهام وإسنادها وتحديثات الإنجاز والمشاريع ومراحلها وإعدادات التنقيط وتقييم المشاركة ولقطات الأداء.
- إضافة سياسات RLS وصلاحيات منفصلة لهذه الوحدات.
- إضافة دالة `project_progress(uuid)` لحساب تقدم المشروع من أوزان المهام ونسب إنجازها.
- إضافة صفحة قائمة الاجتماعات وإنشاء اجتماع وتفاصيله وتعديله.
- إظهار رابط الاجتماعات في القائمة الجانبية للمستخدمين الذين يملكون `meetings.view`.
- إضافة مكونات تنسيق النماذج.

### لم يُنفذ بعد
- إدارة قائمة الحضور وتسجيل الحضور من الواجهة.
- CRUD كامل للقرارات واللجان والمهام والمشاريع.
- اعتماد تحديثات نسب الإنجاز من الواجهة.
- واجهة تقييم الأعضاء واحتساب اللقطة الشهرية/الفصلية.
- الرسوم البيانية والتقارير وبقية وحدات الخدمات والتوثيق.

### خطوات التشغيل
1. تطبيق Migration الجديدة في بيئة Supabase التجريبية بعد مراجعتها.
2. تشغيل `npm install` ثم `npm run typecheck` و`npm run build`.
3. اختبار الصلاحيات بحسابات مختلفة قبل نشر التغييرات.

### ملاحظة تحقق
تعذر تثبيت حزم npm في بيئة التنفيذ بسبب انتهاء مهلة التثبيت؛ لذلك لم يتم تأكيد نجاح TypeScript أو Next.js build في هذه الدفعة. لا تنشرها على الإنتاج قبل تنفيذ الاختبارات المذكورة.

---

## المرحلة 1 — إدارة الحضور (فرع `meetings-attendance`)

### ما أُنجز
- قسم «الحضور» في صفحة الاجتماع: دعوة جميع أعضاء لجنة الاجتماع (أو جميع الأعضاء النشطين إن لم تُحدَّد لجنة)، أو دعوة أعضاء بعينهم، وتسجيل الحالة (حاضر / متأخر / غائب بعذر / غائب / لم يُسجَّل بعد) مع ملاحظة، وإزالة الدعوة، وملخص بالأعداد، وعرض من سجّل ومتى.
- يعمل على أعمدة الإنتاج الفعلية: `invited` و`attendance_status` و`notes` و`recorded_by` و`recorded_at`.
- الاجتماع المؤرشف للعرض فقط. الصلاحية تُتحقق في الإجراء وتفرضها قاعدة البيانات (RLS).
- ملف `20261111000000_member_directory.sql`: عرض بالأسماء فقط ليرى كل عضو من حضر دون كشف بقية بيانات الملف الشخصي.

### اختبارات يدوية مطلوبة (لم تُنفَّذ بعد)
- [ ] مدير الاجتماعات: دعوة لجنة كاملة، دعوة محدَّدين، تسجيل كل حالة، إزالة دعوة.
- [ ] عضو عادي: يرى الأسماء والحالات ولا يرى أزرار التعديل.
- [ ] اجتماع مؤرشف: لا أزرار تعديل.
- [ ] رئيس لجنة فرعية (بعد تطبيق Migration B): يدير حضور اجتماع لجنته فقط.
- [ ] تحقق من الهاتف (آيفون).

### ملاحظة تحقق
نجح `tsc --noEmit`. لم يكتمل `next build` في بيئة التنفيذ لأن الوصول إلى Google Fonts محجوب؛ يُتحقق من البناء الكامل على Vercel.
