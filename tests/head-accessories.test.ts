import { describe, expect, it, vi } from "vitest";
import type { HeadCollider } from "../app/lib/physics";
import {
  ACCESSORY_TRIANGLE_BUDGET,
  MAX_ACCESSORY_RADIAL_SEGMENTS,
  createHeadAccessoryRig,
  headAccessoryTransform,
  retryableCachedAsset,
  setSunglassesMaterial,
  unloadHeadAccessoryAsset,
  wearableStageTransform,
  updateHeadAccessoryRig,
} from "../app/lib/head-accessories";
import * as THREE from "three";

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
  it("uses one face-independent side-stage transform for both models", () => {
    expect(wearableStageTransform(1_000, 600)).toEqual({
      centerX: 835,
      centerY: 330,
      size: 138,
    });
  });
  it("contains independent orbit and wearable mounts inside the procedural budget", () => {
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

    expect(rig.root.getObjectByName("gift-sunglasses")).toBeTruthy();
    expect(rig.root.getObjectByName("gift-hat")).toBeTruthy();
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

  it("keeps temporary orbit and one persistent wearable independently visible", () => {
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
      "sunglasses",
      1_000,
    );

    expect(rig.orbit.visible).toBe(true);
    expect(rig.occluder.visible).toBe(true);
    expect(rig.orbitSpinner.rotation.z).toBe(0);
    expect(rig.sunglasses.visible).toBe(true);
    expect(rig.hat.visible).toBe(false);
    expect(rig.headAnchor.position.x).toBeCloseTo(320, 4);
    expect(rig.headAnchor.position.y).toBeCloseTo(470, 4);
    expect(rig.orbit.scale.x / transform.width).toBeCloseTo(1.18, 2);

    expect(rig.headAnchor.rotation.z).toBeCloseTo(0, 3);

    updateHeadAccessoryRig(rig, transform, null, 720, 3, "HIGH", false, "hat", 1_000);
    expect(rig.root.visible).toBe(true);
    expect(rig.orbit.visible).toBe(false);
    expect(rig.sunglasses.visible).toBe(false);
    expect(rig.hat.visible).toBe(true);
    const sunglassesPosition = rig.sunglasses.position.clone();
    const sunglassesScale = rig.sunglasses.scale.clone();
    expect(rig.hat.position).toEqual(sunglassesPosition);
    expect(rig.hat.scale).toEqual(sunglassesScale);
    expect(rig.wearableStage.position.x).toBeCloseTo(835, 3);
    expect(rig.wearableStage.position.y).toBeCloseTo(324, 3);
    expect(rig.occluder.visible).toBe(false);
    rig.dispose();
  });

  it("applies a lightweight shallow-black physically based material to sunglasses", () => {
    const root = new THREE.Group();
    const original = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const lens = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
    root.add(lens);
    setSunglassesMaterial(root);

    expect(lens.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const material = lens.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0x30343b);
    expect(material.roughness).toBeGreaterThan(0.25);
    expect(material.metalness).toBeGreaterThan(0.25);
    original.dispose();
    lens.geometry.dispose();
    material.dispose();
  });

  it("evicts a failed asset load so a later live session can retry", async () => {
    const cache = new Map<string, Promise<string>>();
    let attempts = 0;
    const load = () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve("ready");
    };

    await expect(retryableCachedAsset(cache, "hat", load)).rejects.toThrow("offline");
    await expect(retryableCachedAsset(cache, "hat", load)).resolves.toBe("ready");
    expect(attempts).toBe(2);
  });

  it("removes and disposes wearable GPU resources after the display window", () => {
    const rig = createHeadAccessoryRig();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    rig.sunglasses.add(new THREE.Mesh(geometry, material));

    unloadHeadAccessoryAsset(rig, "sunglasses");

    expect(rig.sunglasses.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
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
