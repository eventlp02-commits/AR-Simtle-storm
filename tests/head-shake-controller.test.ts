import { describe, expect, it } from "vitest";
import {
  HeadShakeController,
  WearableAccessoryController,
} from "../app/lib/head-shake-controller";

const feed = (controller: HeadShakeController, values: Array<[number, number]>) =>
  values.map(([yaw, timestampMs]) => controller.observe(yaw, timestampMs));

describe("HeadShakeController", () => {
  it("requires opposite yaw extremes within the gesture window", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    const results = feed(controller, [
      [0, 0], [0.24, 100], [0.31, 180], [0.08, 330], [-0.3, 520],
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("recognizes a gentle shake without requiring an exaggerated head turn", () => {
    const controller = new HeadShakeController();
    const results = feed(controller, [
      [0, 0], [0.08, 80], [0.15, 170], [0.04, 300], [-0.08, 410], [-0.16, 520],
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("does not trigger for one direction, small motion, or screen translation", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(feed(controller, [[0, 0], [0.31, 100], [0.1, 220]])).not.toContain(true);
    expect(feed(controller, [[0.03, 500], [-0.05, 650], [0.04, 800]])).not.toContain(true);
    // A face moving across the camera keeps the same pose yaw, so the pose-only input stays flat.
    expect(feed(controller, [[0.01, 1_000], [0.01, 1_100], [0.01, 1_200]])).not.toContain(true);
  });

  it("does not mistake one monotonic left-to-right turn for a shake", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    const results = feed(controller, [
      [-0.16, 0], [-0.13, 80], [-0.07, 160], [0, 240], [0.07, 320], [0.13, 400],
    ]);

    expect(results).not.toContain(true);
  });

  it("expires an unfinished gesture and suppresses repeats during cooldown", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(controller.observe(0, 0)).toBe(false);
    expect(controller.observe(0.3, 100)).toBe(false);
    expect(controller.observe(-0.3, 1_400)).toBe(false);
    expect(controller.observe(0, 1_450)).toBe(false);
    expect(controller.observe(0.3, 1_500)).toBe(false);
    expect(controller.observe(-0.3, 1_600)).toBe(true);
    expect(controller.observe(0.3, 1_800)).toBe(false);
    expect(controller.observe(0, 2_200)).toBe(false);
    expect(controller.observe(-0.3, 2_300)).toBe(false);
    expect(controller.observe(0.3, 2_500)).toBe(true);
  });

  it("resets an unfinished gesture when tracking disappears", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    controller.observe(0.3, 0);
    controller.resetTracking();
    expect(controller.observe(-0.3, 100)).toBe(false);
  });

  it("requires returning to neutral before rearming after a completed shake", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(controller.observe(0, 0)).toBe(false);
    expect(controller.observe(0.3, 100)).toBe(false);
    expect(controller.observe(-0.3, 200)).toBe(true);
    expect(controller.observe(-0.3, 900)).toBe(false);
    expect(controller.observe(0.3, 1_000)).toBe(false);
    expect(controller.observe(0, 1_100)).toBe(false);
    expect(controller.observe(-0.3, 1_250)).toBe(false);
    expect(controller.observe(0.3, 1_450)).toBe(true);
  });
});

describe("WearableAccessoryController", () => {
  it("cycles models at one fixed two-second display window and resets", () => {
    const controller = new WearableAccessoryController();
    expect(controller.getActive(0)).toBeNull();
    expect(controller.next(100)).toBe("sunglasses");
    expect(controller.markReady("sunglasses", 500)).toBe(true);
    expect(controller.getActive(2_499)).toBe("sunglasses");
    expect(controller.getActive(2_500)).toBeNull();
    expect(controller.next(3_000)).toBe("hat");
    expect(controller.next(3_500)).toBe("sunglasses");
    controller.reset();
    expect(controller.getActive(3_600)).toBeNull();
  });

  it("exposes animation age and a smooth fade during the end of the two-second window", () => {
    const controller = new WearableAccessoryController();
    controller.next(100);

    expect(controller.getPresentation(5_000)).toEqual({
      kind: "sunglasses",
      elapsedSeconds: 0,
      opacity: 0,
    });
    expect(controller.markReady("sunglasses", 5_000)).toBe(true);

    expect(controller.getPresentation(6_000)).toEqual({
      kind: "sunglasses",
      elapsedSeconds: 1,
      opacity: 1,
    });
    const fading = controller.getPresentation(6_800);
    expect(fading?.kind).toBe("sunglasses");
    expect(fading?.elapsedSeconds).toBeCloseTo(1.8, 5);
    expect(fading?.opacity).toBeGreaterThan(0);
    expect(fading?.opacity).toBeLessThan(0.5);
    expect(controller.getPresentation(7_000)).toBeNull();
  });

  it("ignores a stale asset-ready callback after a newer shake switches models", () => {
    const controller = new WearableAccessoryController();
    controller.next(0);
    controller.next(100);

    expect(controller.markReady("sunglasses", 200)).toBe(false);
    expect(controller.markReady("hat", 300)).toBe(true);
    expect(controller.getPresentation(301)?.kind).toBe("hat");
  });

  it("clears only the matching pending model when an asset load fails", () => {
    const controller = new WearableAccessoryController();
    controller.next(0);
    expect(controller.markFailed("hat")).toBe(false);
    expect(controller.getPresentation(100)?.kind).toBe("sunglasses");
    expect(controller.markFailed("sunglasses")).toBe(true);
    expect(controller.getPresentation(101)).toBeNull();
    expect(controller.next(200)).toBe("hat");
  });
});
