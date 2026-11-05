import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "late" | "info" | "idle";

const TONES: Record<Tone, string> = {
  ok: "bg-st-ok/10 text-st-ok",
  warn: "bg-st-warn/10 text-st-warn",
  late: "bg-st-late/10 text-st-late",
  info: "bg-st-info/10 text-st-info",
  idle: "bg-st-idle/10 text-st-idle",
};

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}
