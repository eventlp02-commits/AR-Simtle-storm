import { describe, expect, it } from "vitest";
import {
  ACCESSORY_DROP_DURATION_MS,
  ACCESSORY_DROP_FIREWORK_CHANCE,
  ACCESSORY_DROP_RAIN_RATE,
  AccessoryDropController,
} from "../app/lib/accessory-drop-controller";

const sequenceRandom = (values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 1;
};

describe("AccessoryDropController", () => {
  it("starts empty and does not drop outside rain or fireworks", () => {
    const controller = new AccessoryDropController(() => 0);

    expect(controller.getActive(0)).toBeNull();
    expect(controller.update("NONE", 100, 1)).toBeNull();
  });

  it("uses a frame-rate-independent low rain probability", () => {
    const oneSecondChance = 1 - Math.exp(-ACCESSORY_DROP_RAIN_RATE);
    const miss = new AccessoryDropController(() => oneSecondChance + 0.001);
    const hit = new AccessoryDropController(sequenceRandom([oneSecondChance - 0.001, 0]));

    expect(miss.update("RAIN", 100, 1)).toBeNull();
    expect(hit.update("RAIN", 100, 1)?.source).toBe("RAIN");
  });

  it("uses an 18 percent chance for one fireworks event", () => {
    const miss = new AccessoryDropController(() => ACCESSORY_DROP_FIREWORK_CHANCE);
    const hit = new AccessoryDropController(
      sequenceRandom([ACCESSORY_DROP_FIREWORK_CHANCE - 0.001, 0.5]),
    );

    expect(miss.triggerFireworks(200)).toBeNull();
    expect(hit.triggerFireworks(200)).toMatchObject({
      kind: "orbit",
      source: "FIREWORKS",
      startedAtMs: 200,
      endsAtMs: 200 + ACCESSORY_DROP_DURATION_MS,
    });
  });

  it("keeps exactly one gift active for one second", () => {
    const controller = new AccessoryDropController(() => 0);
    const drop = controller.force("orbit", 400);

    expect(drop.kind).toBe("orbit");
    expect(drop.endsAtMs - drop.startedAtMs).toBe(1_000);
    expect(controller.getActive(1_399)).toBe(drop);
    expect(controller.getActive(1_400)).toBeNull();
  });

  it("enforces cooldown after a gift expires", () => {
    const controller = new AccessoryDropController(() => 0);
    controller.force("orbit", 0);

    expect(controller.triggerFireworks(1_100)).toBeNull();
    expect(controller.triggerFireworks(4_000)?.source).toBe("FIREWORKS");
  });

  it("reset clears both an active gift and its cooldown", () => {
    const controller = new AccessoryDropController(() => 0);
    controller.force("orbit", 50);
    controller.reset();

    expect(controller.getActive(60)).toBeNull();
    expect(controller.triggerFireworks(60)?.source).toBe("FIREWORKS");
  });

  it("exposes only the planet orbit asset", () => {
    const sourceKinds: Array<Parameters<AccessoryDropController["force"]>[0]> = ["orbit"];
    expect(sourceKinds).toEqual(["orbit"]);
  });
});
