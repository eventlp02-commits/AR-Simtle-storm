import { describe, expect, it } from "vitest";
import { percentile } from "../app/lib/runtime-metrics";

describe("percentile", () => {
  it("returns zero for an empty sample", () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it("uses the nearest-rank value without mutating samples", () => {
    const samples = Array.from({ length: 20 }, (_, index) => 20 - index);

    expect(percentile(samples, 0.95)).toBe(19);
    expect(samples[0]).toBe(20);
  });
});
