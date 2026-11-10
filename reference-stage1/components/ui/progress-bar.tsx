export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 bg-ivory" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full bg-forest" style={{ width: `${v}%` }} />
      </div>
      <span className="w-12 text-end text-xs text-muted">{v}%</span>
    </div>
  );
}
