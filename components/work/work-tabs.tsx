import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Header of the merged "المهام والقرارات" section. Tasks and decisions stay separate
 * (own pages, tables and permissions); this only organises them under one sidebar entry.
 */
export function WorkTabs({
  active, permissions, max = "max-w-6xl",
}: { active: "tasks" | "decisions"; permissions: string[]; max?: string }) {
  const tabs = [
    { key: "tasks", label: "المهام", href: "/tasks", permission: "tasks.view" },
    { key: "decisions", label: "القرارات", href: "/decisions", permission: "decisions.view" },
  ].filter((t) => permissions.includes(t.permission));

  return (
    <div className={cn("mx-auto", max)}>
      <p className="text-xs font-medium text-gold-dark">المهام والقرارات</p>
      <nav className="mt-1 flex gap-1 border-b border-line" aria-label="أقسام المهام والقرارات">
        {tabs.map((t) => (
          <Link
            key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm",
              t.key === active ? "border-forest font-bold text-forest" : "border-transparent text-muted hover:text-forest",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
