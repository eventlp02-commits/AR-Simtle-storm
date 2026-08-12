import { describe, expect, it } from "vitest";
import type { HeadCollider } from "../app/lib/physics";
import {
  ACCESSORY_TRIANGLE_BUDGET,
  MAX_ACCESSORY_RADIAL_SEGMENTS,
  createHeadAccessoryRig,
  headAccessoryTransform,
  updateHeadAccessoryRig,
} from "../app/lib/head-accessories";

const geometryDepth = (object: unknown) => {
  if (!object || typeof object !== "object" || !("geometry" in object)) return 0;
  const geometry = object.geometry;
  if (!geometry || typeof geometry !== "object" || !("computeBoundingBox" in geometry)) return 0;
  const typed = geometry as {
    boundingBox: { min: { z: number }; max: { z: number } } | null;
    computeBoundingBox: () => void;
  };
  typed.computeBoundingBox();
  return typed.boundingBox ? typed.boundingBox.max.z - typed.boundingBox.min.z : 0;
};

const ellipseCollider = (roll = 0): HeadCollider => {
  const center = { x: 320, y: 250 };
  const points = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    const x = Math.cos(angle) * 92;
    const y = Math.sin(angle) * 138;
    return {
      x: center.x + x * Math.cos(roll) - y * Math.sin(roll),
      y: center.y + x * Math.sin(roll) + y * Math.cos(roll),
    };
  });
  return {
    points,
    trackingCenter: center,
    velocity: { x: 0, y: 0 },
    timestampMs: 16,
  };
};

describe("headAccessoryTransform", () => {
  it("derives stable face dimensions and roll from the collider", () => {
    const transform = headAccessoryTransform(ellipseCollider(0.18));

    expect(transform).not.toBeNull();
    expect(transform?.centerX).toBeCloseTo(320, 4);
    expect(transform?.centerY).toBeCloseTo(250, 4);
    expect(transform?.width).toBeGreaterThan(180);
    expect(transform?.height).toBeGreaterThan(270);
    expect(transform?.roll).toBeCloseTo(0.18, 1);
  });

  it("returns null for a missing or incomplete collider", () => {
    expect(headAccessoryTransform(null)).toBeNull();
    expect(
      headAccessoryTransform({
        points: [{ x: 0, y: 0 }],
        trackingCenter: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        timestampMs: 0,
      }),
    ).toBeNull();
  });
});

describe("low-poly head accessory rig", () => {
  it("contains only the planet orbit inside a strict triangle budget", () => {
    const rig = createHeadAccessoryRig();
    let measuredTriangles = 0;
    rig.root.traverse((object) => {
      if (!("geometry" in object)) return;
      const geometry = object.geometry;
      if (!geometry || typeof geometry !== "object" || !("attributes" in geometry)) return;
      const typedGeometry = geometry as {
        index?: { count: number } | null;
        attributes: { position?: { count: number } };
      };
      measuredTriangles += typedGeometry.index
        ? typedGeometry.index.count / 3
        : (typedGeometry.attributes.position?.count ?? 0) / 3;
    });

    expect(rig.root.getObjectByName("gift-sunglasses")).toBeFalsy();
    expect(rig.root.getObjectByName("gift-top-hat")).toBeFalsy();
    expect(rig.root.getObjectByName("gift-planet-orbit")).toBeTruthy();
    expect(rig.root.getObjectByName("head-depth-occluder")).toBeTruthy();
    expect(geometryDepth(rig.root.getObjectByName("orbit-ring"))).toBeGreaterThan(0.02);
    expect(measuredTriangles).toBeLessThanOrEqual(ACCESSORY_TRIANGLE_BUDGET);
    expect(rig.triangleCount).toBe(Math.round(measuredTriangles));
    expect(MAX_ACCESSORY_RADIAL_SEGMENTS).toBeLessThanOrEqual(32);
    rig.dispose();
  });

  it("uses an invisible depth-writing head occluder", () => {
    const rig = createHeadAccessoryRig();
    const material = rig.occluder.material;
    if (Array.isArray(material)) throw new Error("expected one occluder material");

    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.depthTest).toBe(true);
    rig.dispose();
  });

  it("shows only one active gift and freezes orbital motion for reduced motion", () => {
    const rig = createHeadAccessoryRig();
    const transform = headAccessoryTransform(ellipseCollider());
    if (!transform) throw new Error("expected transform");

    updateHeadAccessoryRig(
      rig,
      transform,
      "orbit",
      720,
      2,
      "HIGH",
      true,
    );

    expect(rig.orbit.visible).toBe(true);
    expect(rig.occluder.visible).toBe(true);
    expect(rig.orbitSpinner.rotation.z).toBe(0);
    expect(rig.root.position.x).toBeCloseTo(320, 4);
    expect(rig.root.position.y).toBeCloseTo(470, 4);
    expect(rig.orbit.scale.x / transform.width).toBeCloseTo(1.18, 2);

    updateHeadAccessoryRig(rig, transform, null, 720, 3, "HIGH", false);
    expect(rig.root.visible).toBe(false);
    rig.dispose();
  });

  it("keeps the orbit face-relative proportions", () => {
    const rig = createHeadAccessoryRig();
    const transform = headAccessoryTransform(ellipseCollider());
    if (!transform) throw new Error("expected transform");

    updateHeadAccessoryRig(rig, transform, "orbit", 720, 0, "HIGH", false);
    expect(rig.orbit.scale.x / transform.width).toBeCloseTo(1.18, 2);
    rig.dispose();
  });
});
