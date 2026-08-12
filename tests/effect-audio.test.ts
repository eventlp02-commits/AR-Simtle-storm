import { describe, expect, it } from "vitest";
import {
  EffectAudioController,
  type AudioFrameClock,
  type AudioTrack,
} from "../app/lib/effect-audio";

class FakeTrack implements AudioTrack {
  loop = false;
  volume = 1;
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
  }
}

class FakeFrameClock implements AudioFrameClock {
  private timestampMs = 0;
  private nextId = 1;
  private readonly callbacks = new Map<number, (timestampMs: number) => void>();

  now = () => this.timestampMs;

  request = (callback: (timestampMs: number) => void) => {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number) => {
    this.callbacks.delete(id);
  };

  advance(milliseconds: number) {
    this.timestampMs += milliseconds;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.timestampMs);
  }
}

const setup = () => {
  const surprise = new FakeTrack();
  const rain = new FakeTrack();
  const fireworks = new FakeTrack();
  const clock = new FakeFrameClock();
  const controller = new EffectAudioController(
    { surprise, rain, fireworks },
    clock,
  );
  return { controller, surprise, rain, fireworks, clock };
};

describe("EffectAudioController", () => {
  it("plays surprise only for the first firework while restarting a one-shot firework track", () => {
    const { controller, surprise, fireworks } = setup();

    controller.startFireworks();
    fireworks.currentTime = 1.25;
    controller.startFireworks();

    expect(surprise.playCalls).toBe(1);
    expect(surprise.loop).toBe(false);
    expect(fireworks.playCalls).toBe(2);
    expect(fireworks.loop).toBe(false);
    expect(fireworks.currentTime).toBe(0);
  });

  it("loops rain and fades it to silence over 600ms before pausing and rewinding", () => {
    const { controller, rain, clock } = setup();

    controller.startRain();
    const playingVolume = rain.volume;
    controller.stopRain();
    clock.advance(300);

    expect(rain.loop).toBe(true);
    expect(rain.playCalls).toBe(1);
    expect(rain.volume).toBeCloseTo(playingVolume / 2, 2);
    expect(rain.pauseCalls).toBe(0);

    clock.advance(300);
    expect(rain.volume).toBe(0);
    expect(rain.pauseCalls).toBe(1);
    expect(rain.currentTime).toBe(0);
  });

  it("fades fireworks over 600ms and cancels that stale fade when a new burst starts", () => {
    const { controller, fireworks, clock } = setup();

    controller.startFireworks();
    controller.stopFireworks();
    clock.advance(300);
    expect(fireworks.volume).toBeGreaterThan(0);

    controller.startFireworks();
    const restartedVolume = fireworks.volume;
    clock.advance(300);

    expect(fireworks.volume).toBe(restartedVolume);
    expect(fireworks.pauseCalls).toBe(0);
    expect(fireworks.playCalls).toBe(2);
  });

  it("unlocks every track without consuming the first-firework surprise", async () => {
    const { controller, surprise, rain, fireworks } = setup();

    await expect(controller.unlock()).resolves.toBeUndefined();
    controller.startFireworks();

    expect(surprise.playCalls).toBe(2);
    expect(rain.playCalls).toBe(1);
    expect(fireworks.playCalls).toBe(2);
    expect(surprise.pauseCalls).toBe(1);
    expect(rain.pauseCalls).toBe(1);
    expect(fireworks.pauseCalls).toBe(1);
  });

  it("mutes active ambience and does not play newly triggered sounds while muted", () => {
    const { controller, surprise, rain, fireworks, clock } = setup();

    controller.startRain();
    controller.setMuted(true);
    clock.advance(600);
    controller.startFireworks();

    expect(controller.isMuted()).toBe(true);
    expect(rain.volume).toBe(0);
    expect(rain.pauseCalls).toBe(1);
    expect(fireworks.playCalls).toBe(0);
    expect(surprise.playCalls).toBe(0);
  });

  it("restores requested rain after unmuting without replaying an old firework", () => {
    const { controller, rain, fireworks, clock } = setup();

    controller.startRain();
    controller.setMuted(true);
    clock.advance(600);
    controller.startFireworks();
    controller.setMuted(false);

    expect(controller.isMuted()).toBe(false);
    expect(rain.playCalls).toBe(2);
    expect(rain.volume).toBeGreaterThan(0);
    expect(fireworks.playCalls).toBe(0);
  });
});
