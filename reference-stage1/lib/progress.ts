/** Pure project-progress maths. Mirrors the SQL view `project_progress` (keep them in sync). */

export type ProgressTask = { id: string; status: string; progress: number; weight: number };

/** Completed (approved) = 100; submitted-but-unapproved never counts as fully done. */
export function effectiveProgress(status: string, progress: number): number {
  if (status === "completed") return 100;
  if (status === "awaiting_approval") return Math.min(progress, 99);
  return progress;
}

export type ProjectProgress = {
  progress: number;
  weightsTotal: number;
  isDefaultDistribution: boolean;
  /** Points each task adds to the project total (they sum to `progress`). */
  contributions: { id: string; share: number; points: number }[];
};

export function projectProgress(tasks: ProgressTask[]): ProjectProgress {
  const live = tasks.filter((t) => t.status !== "cancelled");
  if (live.length === 0) return { progress: 0, weightsTotal: 0, isDefaultDistribution: false, contributions: [] };

  const weightsTotal = live.reduce((s, t) => s + t.weight, 0);
  const isDefaultDistribution = weightsTotal === 0;
  const contributions = live.map((t) => {
    const share = isDefaultDistribution ? 1 / live.length : t.weight / weightsTotal;
    return { id: t.id, share, points: share * effectiveProgress(t.status, t.progress) };
  });
  const progress = contributions.reduce((s, c) => s + c.points, 0);
  return { progress: Math.round(progress * 10) / 10, weightsTotal, isDefaultDistribution, contributions };
}

/** Equal whole-number-cents split of 100% across n tasks; the remainder goes to the last ones. */
export function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  const cents = 10000;
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i >= n - extra ? 1 : 0)) / 100);
}
