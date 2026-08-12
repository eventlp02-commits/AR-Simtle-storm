import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { AccessoryKind } from "./accessory-drop-controller";
import type { WearableAccessoryKind } from "./head-shake-controller";
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
  headAnchor: THREE.Group;
  wearableStage: THREE.Group;
  occluder: THREE.Mesh;
  orbit: THREE.Group;
  orbitSpinner: THREE.Group;
  planets: THREE.Object3D[];
  sunglasses: THREE.Group;
  hat: THREE.Group;
  triangleCount: number;
  dispose: () => void;
}

export interface WearableAssetUrls {
  sunglasses: string;
  hat: string;
}

export interface WearableStageTransform {
  centerX: number;
  centerY: number;
  size: number;
}

export function wearableStageTransform(
  viewportWidth: number,
  viewportHeight: number,
): WearableStageTransform {
  return {
    centerX: Math.round(viewportWidth * 0.835),
    centerY: Math.round(viewportHeight * 0.55),
    size: Math.round(Math.min(viewportWidth, viewportHeight) * 0.23),
  };
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

export function setSunglassesMaterial(root: THREE.Object3D) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x30343b,
    metalness: 0.42,
    roughness: 0.34,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    object.renderOrder = 3;
  });
}

const normalizeWearable = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const width = Math.max(size.x, 1e-4);
  const scale = 1 / width;
  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);
  object.updateMatrixWorld(true);
};

export function retryableCachedAsset<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
) {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load().catch((error) => {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

const loadWearableTemplate = (
  loader: GLTFLoader,
  url: string,
  prepare?: (object: THREE.Object3D) => void,
) => {
  return loader.loadAsync(url).then((gltf) => {
    normalizeWearable(gltf.scene);
    prepare?.(gltf.scene);
    return gltf.scene;
  });
};

export async function loadHeadAccessoryAsset(
  rig: HeadAccessoryRig,
  kind: WearableAccessoryKind,
  urls: WearableAssetUrls,
) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const mount = kind === "sunglasses" ? rig.sunglasses : rig.hat;
  const object = await loadWearableTemplate(
    loader,
    urls[kind],
    kind === "sunglasses" ? setSunglassesMaterial : undefined,
  );
  mount.add(object);
  return object;
}

const disposeObject = (root: THREE.Object3D) => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.forEach((material) => {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
};

export function unloadHeadAccessoryAsset(
  rig: HeadAccessoryRig,
  kind: WearableAccessoryKind,
) {
  const mount = kind === "sunglasses" ? rig.sunglasses : rig.hat;
  for (const child of [...mount.children]) {
    mount.remove(child);
    disposeObject(child);
  }
}

export function unloadHeadAccessoryObject(object: THREE.Object3D) {
  object.removeFromParent();
  disposeObject(object);
}

export function createHeadAccessoryRig(): HeadAccessoryRig {
  const root = new THREE.Group();
  root.name = "head-accessory-root";
  root.visible = false;
  const headAnchor = new THREE.Group();
  headAnchor.name = "head-accessory-anchor";
  const wearableStage = new THREE.Group();
  wearableStage.name = "wearable-side-stage";

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

  const sunglasses = new THREE.Group();
  sunglasses.name = "gift-sunglasses";
  sunglasses.visible = false;
  const hat = new THREE.Group();
  hat.name = "gift-hat";
  hat.visible = false;

  headAnchor.add(occluder, orbit);
  wearableStage.add(sunglasses, hat);
  root.add(headAnchor, wearableStage);
  const measuredTriangleCount = triangleCount(root);
  if (measuredTriangleCount > ACCESSORY_TRIANGLE_BUDGET) {
    throw new Error(`Head accessory triangle budget exceeded: ${measuredTriangleCount}`);
  }

  return {
    root,
    headAnchor,
    wearableStage,
    occluder,
    orbit,
    orbitSpinner,
    planets,
    sunglasses,
    hat,
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
  wearableAccessory: WearableAccessoryKind | null = null,
  viewportWidth = 0,
) {
  rig.root.visible = Boolean((transform && activeAccessory) || wearableAccessory);
  rig.headAnchor.visible = Boolean(transform && activeAccessory);
  rig.wearableStage.visible = Boolean(wearableAccessory);
  if (!transform && !wearableAccessory) return;

  if (transform) {
    rig.headAnchor.position.set(transform.centerX, viewportHeight - transform.centerY, 0);
    rig.headAnchor.rotation.set(0, 0, -transform.roll);
  }
  rig.occluder.visible = activeAccessory === "orbit";
  if (transform) {
    rig.occluder.scale.set(
      transform.width * 0.48,
      transform.height * 0.49,
      transform.width * 0.15,
    );
  }

  rig.orbit.visible = activeAccessory === "orbit";
  rig.orbit.position.set(0, 0, 0);
  if (transform) {
    rig.orbit.scale.set(
      transform.width * 1.18,
      transform.width * 0.56,
      transform.width * 0.42,
    );
  }
  rig.orbitSpinner.rotation.z = reducedMotion ? 0 : elapsedSeconds * 0.52;
  rig.planets.forEach((planet, index) => {
    planet.visible = quality === "HIGH" || index === 0;
  });

  rig.sunglasses.visible = wearableAccessory === "sunglasses";
  const stage = wearableStageTransform(viewportWidth, viewportHeight);
  rig.wearableStage.position.set(stage.centerX, viewportHeight - stage.centerY, 0);
  rig.wearableStage.rotation.set(0, 0, 0);
  const localStagePosition = new THREE.Vector3(0, 0, 1);
  rig.sunglasses.position.copy(localStagePosition);
  rig.sunglasses.scale.setScalar(stage.size);
  rig.sunglasses.rotation.set(0, Math.PI, 0);

  rig.hat.visible = wearableAccessory === "hat";
  rig.hat.position.copy(localStagePosition);
  rig.hat.scale.setScalar(stage.size);
  rig.hat.rotation.set(0, Math.PI, 0);
}
