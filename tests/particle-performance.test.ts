import { describe, expect, it } from "vitest";
import { runDeterministicParticleBenchmark } from "../app/lib/performance-replay";

describe("deterministic particle performance replay", () => {
  it("keeps a 60-second high-quality workload within budget", () => {
    const result = runDeterministicParticleBenchmark({
      frames: 3_600,
      fireworkBudget: 120,
      rainBudget: 180,
    });

    expect(result.maxFireworks).toBeLessThanOrEqual(120);
    expect(result.maxRain).toBeLessThanOrEqual(180);
    expect(result.elapsedMs).toBeLessThan(1_500);
  });

  it("keeps the low-quality replay at sixty physical firework particles", () => {
    const result = runDeterministicParticleBenchmark({
      frames: 1_800,
      fireworkBudget: 60,
      rainBudget: 90,
    });

    expect(result.maxFireworks).toBeLessThanOrEqual(60);
    expect(result.maxRain).toBeLessThanOrEqual(90);
  });
});
