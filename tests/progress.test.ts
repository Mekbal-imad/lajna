import { describe, expect, it } from "vitest";
import { effectiveProgress, equalWeights, projectProgress } from "../lib/progress";

describe("projectProgress", () => {
  it("matches the worked example from the requirements (20/30/40/10 → 70%)", () => {
    const r = projectProgress([
      { id: "a", status: "completed", progress: 100, weight: 20 },
      { id: "b", status: "completed", progress: 100, weight: 30 },
      { id: "c", status: "in_progress", progress: 50, weight: 40 },
      { id: "d", status: "not_started", progress: 0, weight: 10 },
    ]);
    expect(r.progress).toBe(70);
    expect(r.weightsTotal).toBe(100);
    expect(r.isDefaultDistribution).toBe(false);
    expect(r.contributions.reduce((s, c) => s + c.points, 0)).toBeCloseTo(70);
  });

  it("uses equal weights when none were set, and says so", () => {
    const r = projectProgress([
      { id: "a", status: "in_progress", progress: 100, weight: 0 },
      { id: "b", status: "in_progress", progress: 0, weight: 0 },
    ]);
    expect(r.progress).toBe(50);
    expect(r.isDefaultDistribution).toBe(true);
  });

  it("ignores cancelled tasks and handles an empty project", () => {
    expect(projectProgress([]).progress).toBe(0);
    const r = projectProgress([
      { id: "a", status: "cancelled", progress: 0, weight: 50 },
      { id: "b", status: "completed", progress: 100, weight: 50 },
    ]);
    expect(r.progress).toBe(100);
  });

  it("does not count an unapproved 100% as complete", () => {
    expect(effectiveProgress("awaiting_approval", 100)).toBe(99);
    expect(effectiveProgress("completed", 20)).toBe(100);
  });
});

describe("equalWeights", () => {
  it("always totals exactly 100", () => {
    for (const n of [1, 2, 3, 6, 7, 9]) {
      const total = equalWeights(n).reduce((s, w) => s + Math.round(w * 100), 0);
      expect(total).toBe(10000);
    }
  });
});
