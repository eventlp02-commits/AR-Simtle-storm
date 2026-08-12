import { describe, expect, it } from "vitest";
import {
  mouthOpenRatioFromLandmarks,
  teethVisibilityFromRgba,
} from "../app/lib/mouth-signals";

describe("mouthOpenRatioFromLandmarks", () => {
  it("measures lip separation relative to mouth width in source pixels", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    landmarks[61] = { x: 0.3, y: 0.5, z: 0 };
    landmarks[291] = { x: 0.7, y: 0.5, z: 0 };
    landmarks[13] = { x: 0.5, y: 0.45, z: 0 };
    landmarks[14] = { x: 0.5, y: 0.55, z: 0 };

    expect(
      mouthOpenRatioFromLandmarks(landmarks, { width: 1_000, height: 500 }),
    ).toBeCloseTo(0.125, 3);
  });
});

describe("teethVisibilityFromRgba", () => {
  it("counts bright low-chroma pixels but rejects saturated lip pixels", () => {
    const pixels = new Uint8ClampedArray([
      235, 230, 220, 255,
      245, 240, 232, 255,
      225, 220, 215, 255,
      130, 25, 40, 255,
      115, 18, 28, 255,
      90, 15, 22, 255,
    ]);

    expect(teethVisibilityFromRgba(pixels)).toBeCloseTo(0.5, 2);
  });
});
