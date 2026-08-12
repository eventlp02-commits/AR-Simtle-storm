import { describe, expect, it } from "vitest";
import { AdaptiveQuality } from "../app/lib/quality-controller";

describe("AdaptiveQuality", () => {
  it("degrades in steps under sustained low frame rate", () => {
    const quality = new AdaptiveQuality();

    expect(quality.update(40, 0)).toBe("HIGH");
    expect(quality.update(40, 2_100)).toBe("MEDIUM");
    expect(quality.update(40, 5_200)).toBe("LOW");
    expect(quality.getBudget()).toEqual({ rain: 90, fireworks: 60, resolutionScale: 0.78 });
  });

  it("reduces the physical firework budget at every quality level", () => {
    const quality = new AdaptiveQuality();

    expect(quality.getBudget().fireworks).toBe(120);
    quality.update(40, 0);
    quality.update(40, 2_100);
    expect(quality.getBudget().fireworks).toBe(90);
    quality.update(40, 5_200);
    expect(quality.getBudget().fireworks).toBe(60);
  });

  it("recovers only after five seconds above 55fps", () => {
    const quality = new AdaptiveQuality();
    quality.update(40, 0);
    quality.update(40, 2_100);
    quality.update(40, 5_200);

    expect(quality.update(58, 5_300)).toBe("LOW");
    expect(quality.update(58, 10_200)).toBe("LOW");
    expect(quality.update(58, 10_400)).toBe("MEDIUM");
  });
});
