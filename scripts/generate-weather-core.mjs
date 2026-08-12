import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      const base64 = Buffer.from(result).toString("base64");
      this.result = `data:${blob.type};base64,${base64}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

const glassMaterial = new THREE.MeshPhysicalMaterial({
  name: "AtmosphericGlass",
  color: 0x77d9ff,
  emissive: 0x062844,
  emissiveIntensity: 0.42,
  metalness: 0.05,
  roughness: 0.08,
  transmission: 0.82,
  thickness: 0.18,
  transparent: true,
  opacity: 0.46,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const energyMaterial = new THREE.MeshStandardMaterial({
  name: "StormEnergy",
  color: 0x5ae8ff,
  emissive: 0x0b7fff,
  emissiveIntensity: 2.8,
  metalness: 0.08,
  roughness: 0.2,
});

const accentMaterial = new THREE.MeshStandardMaterial({
  name: "SolarAccent",
  color: 0xffd56a,
  emissive: 0xff7a16,
  emissiveIntensity: 1.1,
  metalness: 0.78,
  roughness: 0.2,
});

function createLightningBolt() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.08, 0.3);
  shape.lineTo(0.11, 0.07);
  shape.lineTo(0.02, 0.07);
  shape.lineTo(0.12, -0.3);
  shape.lineTo(-0.13, -0.02);
  shape.lineTo(-0.03, -0.02);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 2,
  });
  geometry.center();
  const bolt = new THREE.Mesh(geometry, accentMaterial);
  bolt.name = "LightningGlyph";
  bolt.position.set(0.06, -0.04, 0.43);
  bolt.rotation.z = -0.1;
  return bolt;
}

function createCloud() {
  const cloud = new THREE.Group();
  cloud.name = "EnergyCloud";
  const geometry = new THREE.SphereGeometry(1, 20, 12);
  const puffs = [
    [-0.2, 0.1, 0, 0.18],
    [-0.05, 0.17, 0.02, 0.22],
    [0.14, 0.12, 0, 0.19],
    [0.02, 0.07, 0.04, 0.24],
  ];
  for (const [x, y, z, scale] of puffs) {
    const puff = new THREE.Mesh(geometry, energyMaterial);
    puff.position.set(x, y, z);
    puff.scale.setScalar(scale);
    cloud.add(puff);
  }
  cloud.position.set(-0.02, 0.08, 0.36);
  return cloud;
}

function createRainDrops() {
  const drops = new THREE.Group();
  drops.name = "RainDrops";
  const geometry = new THREE.SphereGeometry(1, 14, 10);
  [-0.16, 0, 0.16].forEach((x, index) => {
    const drop = new THREE.Mesh(geometry, energyMaterial);
    drop.name = `RainDrop${index + 1}`;
    drop.position.set(x, -0.3 - (index % 2) * 0.06, 0.34);
    drop.scale.set(0.045, 0.1, 0.045);
    drop.rotation.z = 0.08 * (index - 1);
    drops.add(drop);
  });
  return drops;
}

function createOrbitRing(name, radius, tube, rotation, satelliteCount) {
  const group = new THREE.Group();
  group.name = name;
  group.rotation.set(...rotation);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 12, 96),
    accentMaterial,
  );
  torus.name = `${name}_Mesh`;
  group.add(torus);

  const satelliteGeometry = new THREE.IcosahedronGeometry(tube * 2.2, 1);
  for (let index = 0; index < satelliteCount; index += 1) {
    const angle = (index / satelliteCount) * Math.PI * 2;
    const satellite = new THREE.Mesh(
      satelliteGeometry,
      index % 2 === 0 ? energyMaterial : accentMaterial,
    );
    satellite.name = `${name}_Satellite${index + 1}`;
    satellite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    group.add(satellite);
  }
  return group;
}

function quaternionTrack(node, turns, durationSeconds) {
  const times = [0, 0.25, 0.5, 0.75, 1].map((value) => value * durationSeconds);
  const values = [];
  const base = node.quaternion.clone();
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const spin = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      fraction * Math.PI * 2 * turns,
    );
    const quaternion = base.clone().multiply(spin).normalize();
    values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new THREE.QuaternionKeyframeTrack(
    `${node.name}.quaternion`,
    times,
    values,
    THREE.InterpolateLinear,
  );
}

const weatherCore = new THREE.Group();
weatherCore.name = "WeatherCore";
weatherCore.userData = {
  assetType: "interactive-weather-core",
  authoringTool: "Three.js",
  unitScaleMeters: 1,
  intendedUse: "Web AR hero and loading scene",
};

const glassShell = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 32),
  glassMaterial,
);
glassShell.name = "GlassShell";
weatherCore.add(glassShell);

const innerShell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.88, 2),
  glassMaterial,
);
innerShell.name = "AtmosphereFacet";
innerShell.material = glassMaterial;
innerShell.scale.set(1, 0.98, 1);
weatherCore.add(innerShell);

const energyCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.34, 3),
  energyMaterial,
);
energyCore.name = "EnergyCore";
energyCore.rotation.set(0.25, 0.35, -0.18);
weatherCore.add(energyCore);
weatherCore.add(createCloud(), createRainDrops(), createLightningBolt());

const ringA = createOrbitRing("OrbitRingA", 1.17, 0.018, [0.78, 0.08, 0.18], 3);
const ringB = createOrbitRing("OrbitRingB", 1.25, 0.015, [1.35, 0.55, -0.28], 4);
const ringC = createOrbitRing("OrbitRingC", 1.08, 0.012, [0.24, 1.12, 0.62], 2);
weatherCore.add(ringA, ringB, ringC);

const idleClip = new THREE.AnimationClip("Idle", 6, [
  quaternionTrack(ringA, 1, 6),
  quaternionTrack(ringB, -1, 6),
  quaternionTrack(ringC, 1, 4),
  new THREE.VectorKeyframeTrack(
    "EnergyCore.scale",
    [0, 1.5, 3, 4.5, 6],
    [1, 1, 1, 1.1, 1.1, 1.1, 1, 1, 1, 1.08, 1.08, 1.08, 1, 1, 1],
  ),
]);

weatherCore.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(weatherCore, {
  binary: true,
  animations: [idleClip],
  onlyVisible: true,
  trs: true,
});

let triangleCount = 0;
weatherCore.traverse((object) => {
  if (!object.isMesh) return;
  const geometry = object.geometry;
  triangleCount += geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
});

const primaryOutput = new URL("../public/models/weather-core.glb", import.meta.url);
const deliverableOutput = new URL("../../../outputs/weather-core.glb", import.meta.url);
const metadataOutput = new URL("../../../outputs/weather-core.metadata.json", import.meta.url);
await Promise.all([
  mkdir(new URL("../public/models/", import.meta.url), { recursive: true }),
  mkdir(new URL("../../../outputs/", import.meta.url), { recursive: true }),
]);
const bytes = new Uint8Array(glb);
await Promise.all([
  writeFile(primaryOutput, bytes),
  writeFile(deliverableOutput, bytes),
  writeFile(
    metadataOutput,
    `${JSON.stringify(
      {
        file: "weather-core.glb",
        generatedWith: `three@${THREE.REVISION}`,
        byteLength: bytes.byteLength,
        triangleCount,
        materialCount: 3,
        animationClips: ["Idle"],
        sourceScript: fileURLToPath(import.meta.url),
      },
      null,
      2,
    )}\n`,
  ),
]);

console.log(
  JSON.stringify({
    output: fileURLToPath(deliverableOutput),
    byteLength: bytes.byteLength,
    triangleCount,
  }),
);
