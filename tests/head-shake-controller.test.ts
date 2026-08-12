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

  it("does not trigger for one direction, small motion, or screen translation", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(feed(controller, [[0, 0], [0.31, 100], [0.1, 220]])).not.toContain(true);
    expect(feed(controller, [[0.03, 500], [-0.05, 650], [0.04, 800]])).not.toContain(true);
    // A face moving across the camera keeps the same pose yaw, so the pose-only input stays flat.
    expect(feed(controller, [[0.01, 1_000], [0.01, 1_100], [0.01, 1_200]])).not.toContain(true);
  });

  it("expires an unfinished gesture and suppresses repeats during cooldown", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(controller.observe(0.3, 0)).toBe(false);
    expect(controller.observe(-0.3, 1_300)).toBe(false);
    expect(controller.observe(0.3, 1_400)).toBe(true);
    expect(controller.observe(-0.3, 1_600)).toBe(false);
    expect(controller.observe(0.3, 1_800)).toBe(false);
    expect(controller.observe(0, 2_000)).toBe(false);
    expect(controller.observe(-0.3, 2_100)).toBe(false);
    expect(controller.observe(0.3, 2_300)).toBe(true);
  });

  it("resets an unfinished gesture when tracking disappears", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    controller.observe(0.3, 0);
    controller.resetTracking();
    expect(controller.observe(-0.3, 100)).toBe(false);
  });

  it("requires returning to neutral before rearming after a completed shake", () => {
    const controller = new HeadShakeController({ smoothing: 1 });
    expect(controller.observe(0.3, 0)).toBe(false);
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
    expect(controller.getActive(2_099)).toBe("sunglasses");
    expect(controller.getActive(2_100)).toBeNull();
    expect(controller.next(3_000)).toBe("hat");
    expect(controller.next(3_500)).toBe("sunglasses");
    controller.reset();
    expect(controller.getActive(3_600)).toBeNull();
  });
});
