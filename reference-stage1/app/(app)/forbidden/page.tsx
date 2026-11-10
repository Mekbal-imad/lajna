import Link from "next/link";

export const metadata = { title: "غير مصرح" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-forest">لا تملك صلاحية الوصول</h1>
      <p className="mt-2 text-sm text-muted">هذه الصفحة غير متاحة لدورك الحالي. إن كنت تحتاجها فتواصل مع مدير النظام.</p>
      <Link href="/dashboard" className="mt-6 inline-block rounded bg-forest px-4 py-2 text-ivory hover:bg-forest-700">
        العودة إلى لوحة القيادة
      </Link>
    </div>
  );
}
