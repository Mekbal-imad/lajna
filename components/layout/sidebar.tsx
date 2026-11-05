"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV_GROUPS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({
  open, onClose, permissions,
}: { open: boolean; onClose: () => void; permissions: string[] }) {
  const pathname = usePathname();

  return (
    <>
      {open ? (
        <button
          aria-label="إغلاق القائمة"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-forest/25 lg:hidden"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-ivory text-forest border-e border-line transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="font-display text-base font-bold leading-tight">لجنة التنظيم والصيانة والنظافة</p>
            <p className="mt-0.5 text-xs text-muted">منصة الإدارة والمتابعة</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-1 lg:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => ({
            ...group,
            items: group.items.filter((i) => !i.permission || permissions.includes(i.permission)),
          }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1 text-xs text-gold-dark">{group.title}</p>
              <ul>
                {group.items.map(({ href, label, icon: Icon, ready }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  const base = "flex items-center gap-3 rounded px-2 py-2 text-sm";
                  return (
                    <li key={href}>
                      {ready ? (
                        <Link
                          href={href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            base,
                            active ? "bg-white font-bold text-forest border-s-2 border-gold" : "text-forest/80 hover:bg-white/60",
                          )}
                        >
                          <Icon size={18} />
                          {label}
                        </Link>
                      ) : (
                        <span className={cn(base, "cursor-not-allowed text-forest/40")} aria-disabled="true">
                          <Icon size={18} />
                          <span className="flex-1">{label}</span>
                          <span className="text-[10px]">قريبًا</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
