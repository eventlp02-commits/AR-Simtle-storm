import * as THREE from "three";
import type { AccessoryKind } from "./accessory-drop-controller";
import type { HeadCollider } from "./physics";

export const ACCESSORY_TRIANGLE_BUDGET = 1_800;
export const MAX_ACCESSORY_RADIAL_SEGMENTS = 24;
export const SUNGLASSES_FACE_WIDTH_RATIO = 0.9;

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
  sunglasses: THREE.Group;
  hat: THREE.Group;
  orbit: THREE.Group;
  orbitSpinner: THREE.Group;
  hatDetail: THREE.Object3D;
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

const centeredExtrude = (shape: THREE.Shape, depth: number) => {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
};

const createLensShape = (inset = 0) => {
  const shape = new THREE.Shape();
  const width = 0.255 - inset;
  const top = 0.135 - inset * 0.45;
  const bottom = -0.132 + inset * 0.45;
  shape.moveTo(-width * 0.98, top * 0.55);
  shape.quadraticCurveTo(-width * 0.88, top, -width * 0.48, top * 1.04);
  shape.quadraticCurveTo(width * 0.45, top * 1.08, width * 0.94, top * 0.6);
  shape.quadraticCurveTo(width * 1.06, 0, width * 0.88, bottom * 0.72);
  shape.quadraticCurveTo(width * 0.28, bottom * 1.08, -width * 0.56, bottom);
  shape.quadraticCurveTo(-width, bottom * 0.58, -width * 0.98, top * 0.55);
  shape.closePath();
  return shape;
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

  const sunglasses = new THREE.Group();
  sunglasses.name = "gift-sunglasses";
  const frameMaterial = surfaceMaterial(0xc9b27c, {
    metalness: 0.78,
    roughness: 0.2,
  });
  const lensMaterial = surfaceMaterial(0x14233d, {
    opacity: 0.72,
    metalness: 0.16,
    roughness: 0.12,
  });
  const templeMaterial = surfaceMaterial(0x9e895e, {
    metalness: 0.72,
    roughness: 0.26,
  });
  const frameShape = createLensShape();
  frameShape.holes.push(createLensShape(0.035));
  const frameGeometry = centeredExtrude(frameShape, 0.065);
  const lensGeometry = centeredExtrude(createLensShape(0.044), 0.035);
  const templeGeometry = new THREE.BoxGeometry(0.38, 0.032, 0.045);
  for (const direction of [-1, 1]) {
    const side = direction < 0 ? "left" : "right";
    const frame = mesh(
      frameGeometry,
      frameMaterial,
      `sunglasses-${side}-frame`,
      5,
    );
    frame.position.set(direction * 0.278, 0, 0.235);
    const lens = mesh(
      lensGeometry,
      lensMaterial,
      `sunglasses-${side}-lens`,
      4,
    );
    lens.position.set(direction * 0.278, 0, 0.218);
    const temple = mesh(
      templeGeometry,
      templeMaterial,
      `sunglasses-${side}-temple`,
      1,
    );
    temple.position.set(direction * 0.72, 0.025, -0.21);
    temple.rotation.y = direction * -0.16;
    const nosePad = mesh(
      new THREE.SphereGeometry(0.035, 6, 4),
      surfaceMaterial(0xd8c69b, { opacity: 0.82, metalness: 0.28, roughness: 0.22 }),
      `sunglasses-${side}-nose-pad`,
      5,
    );
    nosePad.scale.set(0.7, 1, 0.48);
    nosePad.position.set(direction * 0.075, -0.055, 0.255);
    sunglasses.add(frame, lens, temple, nosePad);
  }
  const bridge = mesh(
    new THREE.TorusGeometry(0.085, 0.018, 5, 12, Math.PI),
    frameMaterial,
    "sunglasses-curved-bridge",
    5,
  );
  bridge.position.set(0, -0.012, 0.245);
  bridge.rotation.z = Math.PI;
  sunglasses.add(bridge);

  const hat = new THREE.Group();
  hat.name = "gift-top-hat";
  const crown = mesh(
    new THREE.CylinderGeometry(0.34, 0.4, 0.5, 16, 1, false),
    surfaceMaterial(0x17243d, { metalness: 0.34, roughness: 0.38 }),
    "hat-crown",
    4,
  );
  crown.position.set(0, 0.1, 0.04);
  const brim = mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20, 1, false),
    surfaceMaterial(0x0d1729, { metalness: 0.3, roughness: 0.4 }),
    "hat-brim",
    3,
  );
  brim.position.set(0, -0.16, 0);
  const hatDetail = mesh(
    new THREE.CylinderGeometry(0.405, 0.41, 0.105, 16, 1, true),
    surfaceMaterial(0xbda66f, { metalness: 0.72, roughness: 0.24 }),
    "hat-band",
    5,
  );
  hatDetail.position.set(0, -0.06, 0.045);
  hat.add(crown, brim, hatDetail);

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

  root.add(occluder, orbit, hat, sunglasses);
  const measuredTriangleCount = triangleCount(root);
  if (measuredTriangleCount > ACCESSORY_TRIANGLE_BUDGET) {
    throw new Error(`Head accessory triangle budget exceeded: ${measuredTriangleCount}`);
  }

  return {
    root,
    occluder,
    sunglasses,
    hat,
    orbit,
    orbitSpinner,
    hatDetail,
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

  rig.sunglasses.visible = activeAccessory === "sunglasses";
  rig.sunglasses.position.set(0, transform.height * 0.1, 0);
  rig.sunglasses.scale.setScalar(transform.width * SUNGLASSES_FACE_WIDTH_RATIO);

  rig.hat.visible = activeAccessory === "hat";
  rig.hat.position.set(0, transform.height * 0.43, 0);
  rig.hat.scale.setScalar(transform.width * 0.68);
  rig.hatDetail.visible = quality !== "LOW";

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
}
