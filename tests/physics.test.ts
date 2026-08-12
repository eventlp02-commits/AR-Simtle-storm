import { describe, expect, it } from "vitest";
import {
  buildHeadCollider,
  interpolateHeadCollider,
  resolveParticleCollision,
  type HeadCollider,
  type ParticleBody,
} from "../app/lib/physics";

const square: HeadCollider = {
  points: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ],
  trackingCenter: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  timestampMs: 16,
};

describe("buildHeadCollider", () => {
  const ovalAt = (offsetX: number) =>
    Array.from({ length: 36 }, (_, index) => {
      const angle = (index / 36) * Math.PI * 2;
      return { x: offsetX + Math.cos(angle), y: Math.sin(angle) };
    });

  it("resamples a dense face oval into a stable 16 point collider", () => {
    const collider = buildHeadCollider(ovalAt(0), null, 16);
    expect(collider.points).toHaveLength(16);
    expect(collider.velocity).toEqual({ x: 0, y: 0 });
  });

  it("smooths tracked head velocity so a single landmark jump cannot spike the impulse", () => {
    const initial = buildHeadCollider(ovalAt(0), null, 0);
    const moved = buildHeadCollider(ovalAt(10), initial, 100);

    expect(moved.velocity.x).toBeCloseTo(35, 5);
    expect(moved.velocity.y).toBeCloseTo(0, 5);
  });

  it("limits a reverse tracking spike without keeping a false forward impulse", () => {
    const initial = buildHeadCollider(ovalAt(0), null, 0);
    const moved = buildHeadCollider(ovalAt(10), initial, 100);
    const jitteredBack = buildHeadCollider(ovalAt(0), moved, 200);

    expect(jitteredBack.velocity.x).toBeCloseTo(-12.25, 5);
  });

  it("measures steady motion from raw centers instead of an intentionally lagged outline", () => {
    const initial = buildHeadCollider(ovalAt(0), null, 0);
    const firstMove = buildHeadCollider(ovalAt(10), initial, 100);
    const secondMove = buildHeadCollider(ovalAt(20), firstMove, 200);

    expect(secondMove.velocity.x).toBeCloseTo(57.75, 5);
  });

  it("normalizes a horizontally mirrored oval so collision normals still face outward", () => {
    const mirroredOval = [...square.points].reverse();
    const collider = buildHeadCollider(mirroredOval, null, 16, 4);
    const particle: ParticleBody = {
      x: -0.95,
      y: 0,
      previousX: -1.2,
      previousY: 0,
      vx: 0.25,
      vy: 0,
      radius: 0.1,
    };

    expect(resolveParticleCollision(particle, collider)).toBe(true);
    expect(particle.vx).toBeLessThan(0);
  });
});

describe("resolveParticleCollision", () => {
  it("prevents a high speed particle from tunnelling through the head", () => {
    const particle: ParticleBody = {
      x: 3,
      y: 0,
      previousX: -3,
      previousY: 0,
      vx: 375,
      vy: 0,
      radius: 0.1,
    };

    const collided = resolveParticleCollision(particle, square);

    expect(collided).toBe(true);
    expect(particle.vx).toBeLessThan(0);
    expect(particle.x).toBeLessThan(-1);
  });

  it("adds head velocity so a fast head can swat a particle", () => {
    const movingHead: HeadCollider = {
      ...square,
      velocity: { x: -4, y: 0 },
    };
    const particle: ParticleBody = {
      x: -0.95,
      y: 0,
      previousX: -1.2,
      previousY: 0,
      vx: 0.25,
      vy: 0,
      radius: 0.1,
    };

    expect(resolveParticleCollision(particle, movingHead)).toBe(true);
    expect(particle.vx).toBeLessThan(-10);
  });

  it("bounds the post-collision velocity when the tracked head moves extremely fast", () => {
    const movingHead: HeadCollider = {
      ...square,
      velocity: { x: -2_000, y: 1_500 },
    };
    const particle: ParticleBody = {
      x: -0.95,
      y: 0,
      previousX: -1.2,
      previousY: 0,
      vx: 300,
      vy: 0,
      radius: 0.1,
    };

    expect(resolveParticleCollision(particle, movingHead)).toBe(true);
    expect(Math.hypot(particle.vx, particle.vy)).toBeLessThanOrEqual(1_600);
  });

  it("does not teleport a distant particle onto the head boundary", () => {
    const particle: ParticleBody = {
      x: -10,
      y: 0,
      previousX: -11,
      previousY: 0,
      vx: 1,
      vy: 0,
      radius: 0.1,
    };

    expect(resolveParticleCollision(particle, square)).toBe(false);
    expect(particle.x).toBe(-10);
    expect(particle.y).toBe(0);
  });
});

describe("interpolateHeadCollider", () => {
  it("interpolates outline, tracking center and head velocity", () => {
    const target: HeadCollider = {
      points: square.points.map((point) => ({ x: point.x + 10, y: point.y + 4 })),
      trackingCenter: { x: 10, y: 4 },
      velocity: { x: 100, y: -20 },
      timestampMs: 32,
    };

    const midpoint = interpolateHeadCollider(square, target, 0.5);

    expect(midpoint?.points[0]).toEqual({ x: 4, y: 1 });
    expect(midpoint?.trackingCenter).toEqual({ x: 5, y: 2 });
    expect(midpoint?.velocity).toEqual({ x: 50, y: -10 });
    expect(midpoint?.timestampMs).toBe(32);
  });

  it("falls back safely when the collider topology changes", () => {
    const triangle: HeadCollider = {
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
      ],
      trackingCenter: { x: 1, y: 1 },
      velocity: { x: 4, y: 2 },
      timestampMs: 48,
    };

    expect(interpolateHeadCollider(square, triangle, 0.5)).toEqual(triangle);
    expect(interpolateHeadCollider(null, triangle, 0.5)).toEqual(triangle);
    expect(interpolateHeadCollider(square, null, 0.5)).toEqual(square);
  });
});
