import { describe, expect, it } from "vitest";
import { ParticleSystem } from "../app/lib/particle-system";
import type { HeadCollider } from "../app/lib/physics";

const PARTICLE_STRIDE = 12;

describe("ParticleSystem", () => {
  it("never exceeds the requested rain budget", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnRain(30, 1_280, 720, 6);

    expect(particles.getCounts()).toEqual({ rain: 6, fireworks: 0, total: 6 });
  });

  it("stages five launches before their corresponding radial bursts", () => {
    const particles = new ParticleSystem(240, () => 0.5);
    particles.spawnFireworks(1_280, 720, 120);

    expect(particles.getCounts().fireworks).toBe(1);
    particles.update(0.15, null);
    expect(particles.getCounts().fireworks).toBe(2);
    particles.update(0.28, null);
    expect(particles.getCounts().fireworks).toBeGreaterThanOrEqual(24);
    expect(particles.getCounts().fireworks).toBeLessThan(120);
    particles.update(0.8, null);
    expect(particles.getCounts().fireworks).toBe(120);
  });

  it("caps fireworks independently and reuses expired slots", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnFireworks(1_280, 720, 8);
    expect(particles.getCounts().fireworks).toBe(1);

    particles.update(1.2, null);
    expect(particles.getCounts().fireworks).toBe(8);

    particles.update(4, null);
    expect(particles.getCounts().total).toBe(0);

    particles.spawnRain(5, 1_280, 720, 5);
    expect(particles.getCounts().rain).toBe(5);
  });

  it("keeps deterministic burst particles alive one second longer", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnFireworks(800, 600, 5);

    particles.update(1.2, null);
    particles.update(1, null);
    expect(particles.getCounts().fireworks).toBe(5);

    particles.update(2, null);
    expect(particles.getCounts().fireworks).toBe(0);
  });

  it("clears active fireworks and pending launches before a replacement", () => {
    const particles = new ParticleSystem(240, () => 0.5);
    particles.spawnFireworks(1_280, 720, 120);
    particles.clearFireworks();
    particles.spawnFireworks(1_280, 720, 120);

    expect(particles.getCounts()).toEqual({ rain: 0, fireworks: 1, total: 1 });
    particles.update(1.2, null);
    expect(particles.getCounts()).toEqual({ rain: 0, fireworks: 120, total: 120 });
  });

  it("copies active particles into a packed render buffer", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnRain(2, 800, 600, 2);
    particles.spawnFireworks(800, 600, 3);
    particles.update(1.2, null);

    const packed = new Float32Array(20 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);

    expect(count).toBe(5);
    expect(packed.slice(0, count * PARTICLE_STRIDE).some((value) => value !== 0)).toBe(true);
    expect(packed[9]).toBeGreaterThan(500);
    expect(packed[10]).toBe(0);
  });

  it("launches and bursts outside the tracked head", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    const head: HeadCollider = {
      points: [
        { x: 250, y: 60 },
        { x: 550, y: 60 },
        { x: 550, y: 460 },
        { x: 250, y: 460 },
      ],
      trackingCenter: { x: 400, y: 300 },
      velocity: { x: 0, y: 0 },
      timestampMs: 16,
    };
    particles.spawnFireworks(800, 600, 10, head);
    particles.update(0.42, null);

    const packed = new Float32Array(20 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    expect(count).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < count; index += 1) {
      const offset = index * PARTICLE_STRIDE;
      const x = packed[offset];
      const y = packed[offset + 1];
      expect(packed[offset + 2]).toBeGreaterThanOrEqual(6);
      expect(x >= 250 && x <= 550 && y >= 60 && y <= 460).toBe(false);
    }
  });

  it("stratifies a burst evenly around a full radial shell", () => {
    const particles = new ParticleSystem(40, () => 0.5);
    particles.spawnFireworks(800, 600, 30);
    particles.update(0.42, null);

    const packed = new Float32Array(40 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    const angles: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = index * PARTICLE_STRIDE;
      if (packed[offset + 7] === 1) {
        angles.push((packed[offset + 8] + Math.PI * 2) % (Math.PI * 2));
      }
    }
    angles.sort((a, b) => a - b);
    expect(angles).toHaveLength(6);
    const gaps = angles.map((angle, index) => {
      const next = angles[(index + 1) % angles.length];
      return (next - angle + Math.PI * 2) % (Math.PI * 2);
    });
    for (const gap of gaps) expect(gap).toBeCloseTo((Math.PI * 2) / 6, 3);
  });

  it("uses a restrained burst-level palette", () => {
    const particles = new ParticleSystem(40, () => 0.5);
    particles.spawnFireworks(800, 600, 30);
    particles.update(1.2, null);

    const packed = new Float32Array(40 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    const colors = new Set<string>();
    for (let index = 0; index < count; index += 1) {
      const offset = index * PARTICLE_STRIDE;
      colors.add(
        [packed[offset + 3], packed[offset + 4], packed[offset + 5]]
          .map((channel) => channel.toFixed(2))
          .join(","),
      );
    }

    expect(colors.size).toBeGreaterThanOrEqual(4);
    expect(colors.size).toBeLessThanOrEqual(6);
  });

  it("packs a stable front or behind depth layer for every spark", () => {
    const particles = new ParticleSystem(40, () => 0.5);
    particles.spawnFireworks(800, 600, 30);
    particles.update(1.2, null);

    const packed = new Float32Array(40 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    const depthLayers = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const offset = index * PARTICLE_STRIDE;
      if (packed[offset + 7] === 1) depthLayers.add(packed[offset + 11]);
    }

    expect(depthLayers).toEqual(new Set([-1, 1]));
  });

  it("packs a full-strength impact pulse when a firework strikes the head", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnFireworks(800, 600, 5);
    const collider: HeadCollider = {
      points: [
        { x: 96, y: 112 },
        { x: 128, y: 112 },
        { x: 128, y: 152 },
        { x: 96, y: 152 },
      ],
      trackingCenter: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timestampMs: 16,
    };

    particles.update(0.42, collider);
    const packed = new Float32Array(20 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    const impacts = Array.from(
      { length: count },
      (_, index) => packed[index * PARTICLE_STRIDE + 10],
    );

    expect(Math.max(...impacts)).toBe(1);
  });

  it("keeps the collision flash readable for at least 150 milliseconds", () => {
    const particles = new ParticleSystem(20, () => 0.5);
    particles.spawnFireworks(800, 600, 5);
    const collider: HeadCollider = {
      points: [
        { x: 96, y: 112 },
        { x: 128, y: 112 },
        { x: 128, y: 152 },
        { x: 96, y: 152 },
      ],
      trackingCenter: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timestampMs: 16,
    };
    particles.update(0.42, collider);
    particles.update(0.15, null);

    const packed = new Float32Array(20 * PARTICLE_STRIDE);
    const count = particles.writeRenderData(packed);
    const impacts = Array.from(
      { length: count },
      (_, index) => packed[index * PARTICLE_STRIDE + 10],
    );

    expect(Math.max(...impacts)).toBeGreaterThan(0.5);
  });

  it("never exceeds the fixed visual budget across five bursts", () => {
    const particles = new ParticleSystem(240, () => 0.5);
    particles.spawnFireworks(1_280, 720, 240);
    particles.update(1.2, null);

    expect(particles.getCounts().fireworks).toBe(120);
  });
});
