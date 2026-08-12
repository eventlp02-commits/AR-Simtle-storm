import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { AccessoryKind } from "./accessory-drop-controller";
import type { WearableAccessoryKind } from "./head-shake-controller";
import type { HeadCollider } from "./physics";
import type { CompactHeadPose } from "./vision-utils";

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
  sunglasses: THREE.Group;
  hat: THREE.Group;
  triangleCount: number;
  dispose: () => void;
}

export interface WearableAssetUrls {
  sunglasses: string;
  hat: string;
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

const wearableAssetCache = new Map<string, Promise<THREE.Object3D>>();

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
  return retryableCachedAsset(wearableAssetCache, url, () => loader.loadAsync(url).then((gltf) => {
    normalizeWearable(gltf.scene);
    prepare?.(gltf.scene);
    gltf.scene.traverse((object) => {
      object.userData.sharedAccessoryAsset = true;
    });
    return gltf.scene;
  }));
};

export async function loadHeadAccessoryAssets(
  rig: HeadAccessoryRig,
  urls: WearableAssetUrls,
) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const attach = async (
    url: string,
    mount: THREE.Group,
    prepare?: (object: THREE.Object3D) => void,
  ) => {
    const template = await loadWearableTemplate(loader, url, prepare);
    mount.add(template.clone(true));
  };
  const results = await Promise.allSettled([
    attach(urls.sunglasses, rig.sunglasses, setSunglassesMaterial),
    attach(urls.hat, rig.hat),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`${index === 0 ? "Sunglasses" : "Hat"} accessory failed to load`, result.reason);
    }
  });
}

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

  const sunglasses = new THREE.Group();
  sunglasses.name = "gift-sunglasses";
  sunglasses.visible = false;
  const hat = new THREE.Group();
  hat.name = "gift-hat";
  hat.visible = false;

  root.add(occluder, orbit, sunglasses, hat);
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
    sunglasses,
    hat,
    triangleCount: measuredTriangleCount,
    dispose: () => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.userData.sharedAccessoryAsset) return;
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
  pose: CompactHeadPose | null = null,
) {
  rig.root.visible = Boolean(transform && (activeAccessory || wearableAccessory));
  if (!transform || (!activeAccessory && !wearableAccessory)) return;

  rig.root.position.set(transform.centerX, viewportHeight - transform.centerY, 0);
  rig.root.rotation.set(
    -(pose?.pitch ?? 0),
    -(pose?.yaw ?? 0),
    -(pose?.roll ?? transform.roll),
  );
  rig.occluder.visible = true;
  rig.occluder.scale.set(
    transform.width * 0.48,
    transform.height * 0.49,
    transform.width * 0.15,
  );

  rig.orbit.visible = activeAccessory === "orbit";
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

  rig.sunglasses.visible = wearableAccessory === "sunglasses";
  // Keep the lenses in front of the depth-only head volume while the model's
  // long temples still cross its side silhouette as the head turns.
  rig.sunglasses.position.set(0, transform.height * 0.075, transform.width * 0.86);
  rig.sunglasses.scale.setScalar(transform.width * 1.16);
  rig.sunglasses.rotation.set(0, Math.PI, 0);

  rig.hat.visible = wearableAccessory === "hat";
  rig.hat.position.set(0, transform.height * 0.37, transform.width * 0.015);
  rig.hat.scale.setScalar(transform.width * 1.08);
  rig.hat.rotation.set(0, Math.PI, 0);
}
