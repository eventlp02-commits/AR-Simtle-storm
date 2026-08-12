export type QualityLevel = "HIGH" | "MEDIUM" | "LOW";

const budgets = {
  HIGH: { rain: 180, fireworks: 120, resolutionScale: 1 },
  MEDIUM: { rain: 135, fireworks: 90, resolutionScale: 0.9 },
  LOW: { rain: 90, fireworks: 60, resolutionScale: 0.78 },
} as const;

export class AdaptiveQuality {
  private level: QualityLevel = "HIGH";
  private lowSinceMs: number | null = null;
  private recoverySinceMs: number | null = null;

  update(fps: number, nowMs: number): QualityLevel {
    if (fps < 45) {
      this.recoverySinceMs = null;
      this.lowSinceMs ??= nowMs;
      const required = this.level === "HIGH" ? 2_000 : 3_000;
      if (nowMs - this.lowSinceMs >= required) {
        this.level = this.level === "HIGH" ? "MEDIUM" : "LOW";
        this.lowSinceMs = nowMs;
      }
    } else if (fps > 55) {
      this.lowSinceMs = null;
      this.recoverySinceMs ??= nowMs;
      if (nowMs - this.recoverySinceMs >= 5_000) {
        this.level = this.level === "LOW" ? "MEDIUM" : "HIGH";
        this.recoverySinceMs = nowMs;
      }
    } else {
      this.lowSinceMs = null;
      this.recoverySinceMs = null;
    }

    return this.level;
  }

  getBudget() {
    return { ...budgets[this.level] };
  }

  getLevel() {
    return this.level;
  }
}
