import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modelUrl = new URL("../public/models/weather-core.glb", import.meta.url);
const cinematicModelUrl = new URL("../app/assets/cinematic-storm-sphere.glb", import.meta.url);
const optimizedCinematicModelUrl = new URL(
  "../app/assets/cinematic-storm-sphere.optimized.glb",
  import.meta.url,
);

test("weather core exposes reproducible inspect and non-destructive optimization scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const inspectScript = packageJson.scripts?.["inspect:weather-core"] ?? "";
  const optimizeScript = packageJson.scripts?.["optimize:weather-core"] ?? "";

  assert.match(inspectScript, /gltf-transform inspect/);
  assert.match(inspectScript, /cinematic-storm-sphere\.glb/);
  assert.match(optimizeScript, /gltf-transform optimize/);
  assert.match(optimizeScript, /cinematic-storm-sphere\.optimized\.glb/);
  assert.notEqual(inspectScript, optimizeScript);
  assert.equal(packageJson.devDependencies?.["@gltf-transform/cli"], "4.4.2");
});

test("homepage weather core pauses and throttles its WebGL loop", async () => {
  const source = await readFile(
    new URL("../app/components/WeatherCoreHero.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /IntersectionObserver/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /IDLE_FRAME_INTERVAL_MS\s*=\s*1_000\s*\/\s*30/);
  assert.match(source, /REDUCED_MOTION_FRAME_INTERVAL_MS\s*=\s*1_000\s*\/\s*12/);
  assert.match(source, /MeshoptDecoder/);
  assert.match(source, /setMeshoptDecoder/);
  assert.match(source, /cinematic-storm-sphere\.optimized\.glb\?url/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial/);
  assert.match(source, /transmission:\s*0\.72/);
  assert.match(source, /clearcoat:\s*1/);
});

test("weather core failure stays isolated and leaves a visible non-WebGL fallback", async () => {
  const [component, experience, styles] = await Promise.all([
    readFile(new URL("../app/components/WeatherCoreHero.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SmileStormExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /weather-core-fallback/);
  assert.match(component, /try[\s\S]*new THREE\.WebGLRenderer/);
  assert.match(component, /setStatus\("error"\)/);
  assert.match(experience, /WeatherCoreErrorBoundary/);
  assert.match(styles, /\.weather-core-fallback/);
});

function parseGlb(bytes) {
  assert.equal(bytes.toString("utf8", 0, 4), "glTF", "GLB magic header");
  assert.equal(bytes.readUInt32LE(4), 2, "GLB version");
  assert.equal(bytes.readUInt32LE(8), bytes.length, "declared GLB length");
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.toString("utf8", 16, 20), "JSON", "first chunk is JSON");
  return JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).trim());
}

test("weather core is a lightweight animated Web GLB", async () => {
  let bytes;
  try {
    bytes = await readFile(modelUrl);
  } catch {
    bytes = null;
  }

  assert.ok(bytes, "expected public/models/weather-core.glb to be generated");
  assert.ok(bytes.length < 3 * 1024 * 1024, "GLB must stay below 3 MB");

  const gltf = parseGlb(bytes);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name));
  assert.equal(gltf.asset?.version, "2.0");
  assert.ok(nodeNames.has("WeatherCore"));
  assert.ok(nodeNames.has("GlassShell"));
  assert.ok(nodeNames.has("EnergyCore"));
  assert.ok(nodeNames.has("OrbitRingA"));
  assert.ok(nodeNames.has("OrbitRingB"));
  assert.ok(nodeNames.has("OrbitRingC"));
  assert.ok((gltf.animations ?? []).some((animation) => animation.name === "Idle"));
  assert.ok((gltf.materials ?? []).length <= 3, "use at most three materials");
  assert.equal((gltf.cameras ?? []).length, 0, "do not bake a camera into the asset");

  const triangleCount = (gltf.meshes ?? []).reduce(
    (meshTotal, mesh) =>
      meshTotal +
      (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
        const accessor = gltf.accessors?.[primitive.indices];
        return primitiveTotal + (accessor?.count ?? 0) / 3;
      }, 0),
    0,
  );
  assert.ok(triangleCount <= 40_000, `triangle budget exceeded: ${triangleCount}`);
});

test("downloaded cinematic storm sphere is optimized for the homepage", async () => {
  let bytes;
  try {
    bytes = await readFile(cinematicModelUrl);
  } catch {
    bytes = null;
  }

  assert.ok(bytes, "expected app/assets/cinematic-storm-sphere.glb to be generated");
  assert.ok(bytes.length < 6 * 1024 * 1024, "homepage GLB must stay below 6 MB");

  const gltf = parseGlb(bytes);
  assert.equal(gltf.asset?.version, "2.0");
  assert.ok((gltf.images ?? []).length >= 1, "retain the source model textures");
  assert.ok((gltf.materials ?? []).length >= 1, "retain the source material");

  const triangleCount = (gltf.meshes ?? []).reduce(
    (meshTotal, mesh) =>
      meshTotal +
      (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
        const accessor = gltf.accessors?.[primitive.indices];
        return primitiveTotal + (accessor?.count ?? 0) / 3;
      }, 0),
    0,
  );
  assert.ok(triangleCount <= 80_000, `homepage triangle budget exceeded: ${triangleCount}`);
});

test("optimized cinematic sphere is materially smaller than its source", async () => {
  const [source, optimized] = await Promise.all([
    readFile(cinematicModelUrl),
    readFile(optimizedCinematicModelUrl),
  ]);

  assert.ok(optimized.length < source.length * 0.5);
  const gltf = parseGlb(optimized);
  assert.ok(gltf.extensionsRequired?.includes("EXT_meshopt_compression"));
});
