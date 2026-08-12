import * as THREE from "three";
import type { AccessoryKind } from "./accessory-drop-controller";
import type { HeadCollider } from "./physics";

export const ACCESSORY_TRIANGLE_BUDGET = 1_800;
export const MAX_ACCESSORY_RADIAL_SEGMENTS = 24;

export interface HeadAccessoryTransform {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  roll: number;
}

export interface HeadAccessoryRig {
  root: THREE.Group;
  occluder: THREE.Mesh;
  orbit: THREE.Group;
  orbitSpinner: THREE.Group;
  planets: THREE.Object3D[];
  triangleCount: number;
  dispose: () => void;
}

type AccessoryQuality = "HIGH" | "MEDIUM" | "LOW";

const normalizeAngle = (angle: number) => {
  let normalized = angle;
  while (normalized > Math.PI / 2) normalized -= Math.PI;
  while (normalized < -Math.PI / 2) normalized += Math.PI;
  return normalized;
};

export function headAccessoryTransform(
  collider: HeadCollider | null,
): HeadAccessoryTransform | null {
  if (!collider || collider.points.length < 3) return null;
  const { x: centerX, y: centerY } = collider.trackingCenter;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  for (const point of collider.points) {
    const x = point.x - centerX;
    const y = point.y - centerY;
    covarianceXX += x * x;
    covarianceYY += y * y;
    covarianceXY += x * y;
  }
  const principalAngle =
    0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY);
  const roll = normalizeAngle(principalAngle + Math.PI / 2);
  const cosine = Math.cos(roll);
  const sine = Math.sin(roll);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of collider.points) {
    const deltaX = point.x - centerX;
    const deltaY = point.y - centerY;
    const localX = deltaX * cosine + deltaY * sine;
    const localY = -deltaX * sine + deltaY * cosine;
    minX = Math.min(minX, localX);
    maxX = Math.max(maxX, localX);
    minY = Math.min(minY, localY);
    maxY = Math.max(maxY, localY);
  }
  return {
    centerX,
    centerY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    roll,
  };
}

const surfaceMaterial = (
  color: THREE.ColorRepresentation,
  options: { opacity?: number; metalness?: number; roughness?: number } = {},
) => {
  const opacity = options.opacity ?? 1;
  return new THREE.MeshStandardMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    metalness: options.metalness ?? 0.35,
    roughness: options.roughness ?? 0.32,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: opacity >= 0.95,
    toneMapped: false,
  });
};

const mesh = (
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  name: string,
  renderOrder: number,
) => {
  const object = new THREE.Mesh(geometry, meshMaterial);
  object.name = name;
  object.frustumCulled = false;
  object.renderOrder = renderOrder;
  return object;
};

const triangleCount = (root: THREE.Object3D) => {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    count += geometry.index
      ? geometry.index.count / 3
      : (geometry.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(count);
};

export function createHeadAccessoryRig(): HeadAccessoryRig {
  const root = new THREE.Group();
  root.name = "head-accessory-root";
  root.visible = false;

  const occluderMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthTest: true,
    depthWrite: true,
  });
  const occluder = mesh(
    new THREE.SphereGeometry(1, 12, 8),
    occluderMaterial,
    "head-depth-occluder",
    0,
  );

  const orbit = new THREE.Group();
  orbit.name = "gift-planet-orbit";
  const orbitTilt = new THREE.Group();
  orbitTilt.name = "orbit-tilt";
  orbitTilt.rotation.x = 1.02;
  const orbitRing = mesh(
    new THREE.TorusGeometry(0.5, 0.024, 6, MAX_ACCESSORY_RADIAL_SEGMENTS),
    surfaceMaterial(0x7fe8e3, {
      opacity: 0.9,
      metalness: 0.62,
      roughness: 0.18,
    }),
    "orbit-ring",
    3,
  );
  const orbitSpinner = new THREE.Group();
  orbitSpinner.name = "planet-spinner";
  const planetGeometry = new THREE.SphereGeometry(0.065, 7, 5);
  const planetMaterials = [
    surfaceMaterial(0x77c8ff, { metalness: 0.2, roughness: 0.26 }),
    surfaceMaterial(0xff93b5, { metalness: 0.14, roughness: 0.3 }),
    surfaceMaterial(0xf1c56e, { metalness: 0.48, roughness: 0.24 }),
  ];
  const planetAngles = [0.15, 2.42, 4.46];
  const planets = planetAngles.map((angle, index) => {
    const planet = mesh(
      planetGeometry,
      planetMaterials[index],
      `orbit-planet-${index + 1}`,
      5,
    );
    planet.position.set(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0);
    planet.scale.setScalar(index === 0 ? 1.25 : index === 1 ? 0.92 : 0.74);
    orbitSpinner.add(planet);
    return planet;
  });
  orbitTilt.add(orbitRing, orbitSpinner);
  orbit.add(orbitTilt);

  root.add(occluder, orbit);
  const measuredTriangleCount = triangleCount(root);
  if (measuredTriangleCount > ACCESSORY_TRIANGLE_BUDGET) {
    throw new Error(`Head accessory triangle budget exceeded: ${measuredTriangleCount}`);
  }

  return {
    root,
    occluder,
    orbit,
    orbitSpinner,
    planets,
    triangleCount: measuredTriangleCount,
    dispose: () => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.forEach((value) => materials.add(value));
      });
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
    },
  };
}

export function updateHeadAccessoryRig(
  rig: HeadAccessoryRig,
  transform: HeadAccessoryTransform | null,
  activeAccessory: AccessoryKind | null,
  viewportHeight: number,
  elapsedSeconds: number,
  quality: AccessoryQuality,
  reducedMotion: boolean,
) {
  rig.root.visible = Boolean(transform && activeAccessory);
  if (!transform || !activeAccessory) return;

  rig.root.position.set(transform.centerX, viewportHeight - transform.centerY, 0);
  rig.root.rotation.z = -transform.roll;
  rig.occluder.visible = true;
  rig.occluder.scale.set(
    transform.width * 0.48,
    transform.height * 0.49,
    transform.width * 0.15,
  );

  rig.orbit.visible = true;
  rig.orbit.position.set(0, 0, 0);
  rig.orbit.scale.set(
    transform.width * 1.18,
    transform.width * 0.56,
    transform.width * 0.42,
  );
  rig.orbitSpinner.rotation.z = reducedMotion ? 0 : elapsedSeconds * 0.52;
  rig.planets.forEach((planet, index) => {
    planet.visible = quality === "HIGH" || index === 0;
  });
}
