import { cn } from "@/lib/utils";

export function Section({
  title, hint, children, className,
}: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border border-line bg-white", className)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold text-forest">{title}</h2>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, action }: { title: string; action?: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-muted">
      <p>{title}</p>
      {action ? <p className="mt-1 text-forest">{action}</p> : null}
    </div>
  );
}
