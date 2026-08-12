import * as THREE from "three";
import {
  createHeadAccessoryRig,
  headAccessoryTransform,
  loadHeadAccessoryAsset,
  unloadHeadAccessoryAsset,
  unloadHeadAccessoryObject,
  updateHeadAccessoryRig,
  type HeadAccessoryRig,
} from "./head-accessories";
import type { AccessoryKind } from "./accessory-drop-controller";
import type {
  WearableAccessoryKind,
  WearableAccessoryPresentation,
} from "./head-shake-controller";
import sunglassesAssetUrl from "../assets/accessories/sunglasses.optimized.glb?url";
import hatAssetUrl from "../assets/accessories/hat.optimized.glb?url";
import type { ParticleSystem } from "./particle-system";
import type { HeadCollider } from "./physics";

const PARTICLE_STRIDE = 12;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const createTrailTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建烟花拖尾纹理");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "lighter";

  const tail = context.createLinearGradient(0, 0, canvas.width, 0);
  tail.addColorStop(0, "rgba(255,255,255,0)");
  tail.addColorStop(0.16, "rgba(255,255,255,0.025)");
  tail.addColorStop(0.52, "rgba(255,255,255,0.22)");
  tail.addColorStop(0.82, "rgba(255,255,255,0.7)");
  tail.addColorStop(0.94, "rgba(255,255,255,1)");
  tail.addColorStop(1, "rgba(255,255,255,0.08)");
  context.fillStyle = tail;
  context.fillRect(0, 21, 250, 22);

  const softTail = context.createLinearGradient(0, 0, canvas.width, 0);
  softTail.addColorStop(0, "rgba(255,255,255,0)");
  softTail.addColorStop(0.5, "rgba(255,255,255,0.04)");
  softTail.addColorStop(0.88, "rgba(255,255,255,0.24)");
  softTail.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = softTail;
  context.fillRect(0, 10, 256, 44);

  const head = context.createRadialGradient(238, 32, 0, 238, 32, 22);
  head.addColorStop(0, "rgba(255,255,255,1)");
  head.addColorStop(0.2, "rgba(255,255,255,0.96)");
  head.addColorStop(0.48, "rgba(255,255,255,0.48)");
  head.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = head;
  context.fillRect(216, 10, 44, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  return texture;
};

const createParticleMaterial = (
  texture: THREE.Texture,
  blending: THREE.Blending,
  opacity: number,
) =>
  new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity,
    blending,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    toneMapped: false,
  });

interface HeadOcclusionUniforms {
  center: THREE.Vector2;
  radius: THREE.Vector2;
}

const createOccludedParticleMaterial = (
  texture: THREE.Texture,
  uniforms: HeadOcclusionUniforms,
) => {
  const material = createParticleMaterial(texture, THREE.AdditiveBlending, 0.94);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeadCenter = { value: uniforms.center };
    shader.uniforms.uHeadRadius = { value: uniforms.radius };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "varying vec2 vParticleWorldPosition;\nvoid main() {",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vParticleWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xy;
#else
  vParticleWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xy;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec2 uHeadCenter;
uniform vec2 uHeadRadius;
varying vec2 vParticleWorldPosition;
void main() {`,
      )
      .replace(
        "#include <opaque_fragment>",
        `if (uHeadRadius.x > 0.0 && uHeadRadius.y > 0.0) {
  vec2 headDistance = (vParticleWorldPosition - uHeadCenter) / uHeadRadius;
  if (dot(headDistance, headDistance) < 1.0) discard;
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "smile-storm-head-occlusion-v1";
  return material;
};

interface ParticleRenderOptions {
  headCollider?: HeadCollider | null;
  enableOcclusion?: boolean;
  enableExtraGlow?: boolean;
  activeAccessory?: AccessoryKind | null;
  wearableAccessory?: WearableAccessoryKind | null;
  wearablePresentation?: WearableAccessoryPresentation | null;
  elapsedSeconds?: number;
  quality?: "HIGH" | "MEDIUM" | "LOW";
  reducedMotion?: boolean;
  onWearableReady?: (kind: WearableAccessoryKind, timestampMs: number) => void;
  onWearableFailed?: (kind: WearableAccessoryKind) => void;
}

export class ParticleRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 2_000);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly trailTexture = createTrailTexture();
  private readonly rainMaterial = createParticleMaterial(
    this.trailTexture,
    THREE.NormalBlending,
    0.82,
  );
  private readonly fireworkMaterial = createParticleMaterial(
    this.trailTexture,
    THREE.AdditiveBlending,
    1,
  );
  private readonly headOcclusionUniforms: HeadOcclusionUniforms = {
    center: new THREE.Vector2(),
    radius: new THREE.Vector2(),
  };
  private readonly fireworkBehindMaterial = createOccludedParticleMaterial(
    this.trailTexture,
    this.headOcclusionUniforms,
  );
  private readonly rainMesh: THREE.InstancedMesh;
  private readonly fireworkMesh: THREE.InstancedMesh;
  private readonly fireworkBehindMesh: THREE.InstancedMesh;
  private readonly accessoryRig: HeadAccessoryRig;
  private readonly renderData: Float32Array;
  private readonly capacity: number;
  private readonly transform = new THREE.Object3D();
  private readonly instanceColor = new THREE.Color();
  private pixelRatio = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private desiredWearable: WearableAccessoryKind | null = null;
  private loadedWearable: WearableAccessoryKind | null = null;
  private wearableRequest = 0;

  constructor(private readonly canvas: HTMLCanvasElement, capacity = 480) {
    this.capacity = capacity;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      depth: true,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera.position.z = 1_000;
    this.camera.lookAt(0, 0, 0);

    this.rainMesh = this.createBatch(this.rainMaterial, capacity);
    this.fireworkMesh = this.createBatch(this.fireworkMaterial, capacity);
    this.fireworkBehindMesh = this.createBatch(this.fireworkBehindMaterial, capacity);
    this.fireworkBehindMesh.renderOrder = 1;
    this.fireworkMesh.renderOrder = 2;
    this.accessoryRig = createHeadAccessoryRig();
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7);
    const keyLight = new THREE.DirectionalLight(0xcde8ff, 2.1);
    keyLight.position.set(-0.45, 0.8, 1);
    this.scene.add(
      ambientLight,
      keyLight,
      this.rainMesh,
      this.fireworkBehindMesh,
      this.fireworkMesh,
      this.accessoryRig.root,
    );
    this.renderData = new Float32Array(capacity * PARTICLE_STRIDE);
    this.renderer.initTexture(this.trailTexture);
    this.renderer.compile(this.scene, this.camera);
  }

  private syncWearableAsset(
    kind: WearableAccessoryKind | null,
    onReady?: (kind: WearableAccessoryKind, timestampMs: number) => void,
    onFailed?: (kind: WearableAccessoryKind) => void,
  ) {
    if (kind === this.desiredWearable) return;
    this.desiredWearable = kind;
    this.wearableRequest += 1;
    const request = this.wearableRequest;
    if (this.loadedWearable) {
      unloadHeadAccessoryAsset(this.accessoryRig, this.loadedWearable);
      this.loadedWearable = null;
    }
    if (!kind) return;
    void loadHeadAccessoryAsset(this.accessoryRig, kind, {
      sunglasses: sunglassesAssetUrl,
      hat: hatAssetUrl,
    }).then((object) => {
      if (request !== this.wearableRequest || this.desiredWearable !== kind) {
        unloadHeadAccessoryObject(object);
        return;
      }
      this.loadedWearable = kind;
      onReady?.(kind, performance.now());
    }).catch(() => {
      if (request === this.wearableRequest && this.desiredWearable === kind) {
        onFailed?.(kind);
      }
    });
  }

  private createBatch(material: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(this.geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  private resize(cssWidth: number, cssHeight: number, qualityScale: number) {
    const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
    if (
      nextPixelRatio === this.pixelRatio &&
      cssWidth === this.cssWidth &&
      cssHeight === this.cssHeight
    ) {
      return;
    }

    this.pixelRatio = nextPixelRatio;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.renderer.setPixelRatio(nextPixelRatio);
    this.renderer.setSize(Math.max(1, cssWidth), Math.max(1, cssHeight), false);
    this.camera.left = 0;
    this.camera.right = cssWidth;
    this.camera.top = cssHeight;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    instanceIndex: number,
    x: number,
    y: number,
    angle: number,
    length: number,
    thickness: number,
    red: number,
    green: number,
    blue: number,
    intensity: number,
  ) {
    const headOffset = length * 0.43;
    const worldY = this.cssHeight - y;
    const worldAngle = -angle;
    this.transform.position.set(
      x - Math.cos(worldAngle) * headOffset,
      worldY - Math.sin(worldAngle) * headOffset,
      0,
    );
    this.transform.rotation.set(0, 0, worldAngle);
    this.transform.scale.set(length, thickness, 1);
    this.transform.updateMatrix();
    mesh.setMatrixAt(instanceIndex, this.transform.matrix);
    this.instanceColor.setRGB(red, green, blue).multiplyScalar(intensity);
    mesh.setColorAt(instanceIndex, this.instanceColor);
  }

  private updateHeadOcclusion(collider: HeadCollider | null, enabled: boolean) {
    if (!enabled || !collider || collider.points.length < 3) {
      this.headOcclusionUniforms.radius.set(0, 0);
      return;
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of collider.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    this.headOcclusionUniforms.center.set(
      (minX + maxX) / 2,
      this.cssHeight - (minY + maxY) / 2,
    );
    this.headOcclusionUniforms.radius.set(
      Math.max(1, (maxX - minX) * 0.46),
      Math.max(1, (maxY - minY) * 0.47),
    );
  }

  render(
    particles: ParticleSystem,
    cssWidth: number,
    cssHeight: number,
    qualityScale: number,
    options: ParticleRenderOptions = {},
  ) {
    this.resize(cssWidth, cssHeight, qualityScale);
    const enableOcclusion = options.enableOcclusion ?? true;
    const enableExtraGlow = options.enableExtraGlow ?? true;
    this.updateHeadOcclusion(options.headCollider ?? null, enableOcclusion);
    const wearablePresentation = options.wearablePresentation ?? null;
    const wearableAccessory = wearablePresentation?.kind
      ?? options.wearableAccessory
      ?? null;
    this.syncWearableAsset(
      wearableAccessory,
      options.onWearableReady,
      options.onWearableFailed,
    );
    updateHeadAccessoryRig(
      this.accessoryRig,
      headAccessoryTransform(options.headCollider ?? null),
      options.activeAccessory ?? null,
      cssHeight,
      options.elapsedSeconds ?? 0,
      options.quality ?? "HIGH",
      options.reducedMotion ?? false,
      wearableAccessory,
      cssWidth,
      wearablePresentation?.elapsedSeconds ?? 0,
      wearablePresentation?.opacity ?? 1,
    );
    const count = particles.writeRenderData(this.renderData);
    let rainCount = 0;
    let fireworkCount = 0;
    let fireworkBehindCount = 0;

    for (let index = 0; index < count; index += 1) {
      const offset = index * PARTICLE_STRIDE;
      const x = this.renderData[offset];
      const y = this.renderData[offset + 1];
      const size = this.renderData[offset + 2];
      const red = this.renderData[offset + 3];
      const green = this.renderData[offset + 4];
      const blue = this.renderData[offset + 5];
      const remaining = this.renderData[offset + 6];
      const kind = this.renderData[offset + 7];
      const angle = this.renderData[offset + 8];
      const speed = this.renderData[offset + 9];
      const collisionGlow = this.renderData[offset + 10];
      const depthLayer = this.renderData[offset + 11];

      if (kind < 0.5) {
        const length = clamp(size * 1.45, 30, 54);
        const thickness = clamp(size * 0.13, 2.8, 4.8);
        this.setInstance(
          this.rainMesh,
          rainCount,
          x,
          y,
          angle,
          length,
          thickness,
          red,
          green,
          blue,
          0.45 + remaining * 0.55,
        );
        rainCount += 1;
      } else {
        const isRocket = kind > 1.5;
        const renderBehind = enableOcclusion && !isRocket && depthLayer < 0;
        const fireworkMesh = renderBehind ? this.fireworkBehindMesh : this.fireworkMesh;
        let batchCount = renderBehind ? fireworkBehindCount : fireworkCount;
        const length = isRocket
          ? clamp(speed * 0.16, 64, 120)
          : clamp(speed * 0.17, 36, 76) * (0.72 + remaining * 0.28);
        const thickness = isRocket
          ? clamp(size * 0.72, 5.5, 8)
          : clamp(size * 0.58, 4.2, 6.8) * (1 + collisionGlow * 1.15);
        const glowRed = red + (1 - red) * collisionGlow * 0.88;
        const glowGreen = green + (1 - green) * collisionGlow * 0.88;
        const glowBlue = blue + (1 - blue) * collisionGlow * 0.88;
        const fireworkHaloIntensity =
          0.1 + Math.pow(remaining, 0.7) * 0.2 + collisionGlow * 0.42;
        const sparkHeadIntensity =
          0.48 + Math.pow(remaining, 0.55) * 0.86 + collisionGlow * 0.72;
        // Reserve one slot for the physical particle body; halo/impact are optional.
        if (enableExtraGlow && batchCount + 1 < this.capacity) {
          this.setInstance(
            fireworkMesh,
            batchCount,
            x,
            y,
            angle,
            length * 0.94,
            thickness * 2.45,
            glowRed,
            glowGreen,
            glowBlue,
            fireworkHaloIntensity,
          );
          batchCount += 1;
        }
        if (batchCount >= this.capacity) continue;
        this.setInstance(
          fireworkMesh,
          batchCount,
          x,
          y,
          angle,
          length,
          thickness,
          glowRed,
          glowGreen,
          glowBlue,
          (isRocket ? 0.86 : 0.2 + Math.pow(remaining, 0.65) * 1.18) +
            collisionGlow * 1.25,
        );
        batchCount += 1;
        if (enableExtraGlow && !isRocket && batchCount < this.capacity) {
          this.setInstance(
            fireworkMesh,
            batchCount,
            x,
            y,
            angle,
            clamp(length * 0.14, 7, 11),
            thickness * 1.18,
            1,
            1,
            1,
            sparkHeadIntensity,
          );
          batchCount += 1;
        }
        if (enableExtraGlow && collisionGlow > 0.05 && batchCount < this.capacity) {
          this.setInstance(
            fireworkMesh,
            batchCount,
            x,
            y,
            angle,
            length * 0.5,
            thickness * (2.1 + collisionGlow),
            1,
            1,
            1,
            collisionGlow * 1.15,
          );
          batchCount += 1;
        }
        if (renderBehind) fireworkBehindCount = batchCount;
        else fireworkCount = batchCount;
      }
    }

    this.rainMesh.count = rainCount;
    this.fireworkMesh.count = fireworkCount;
    this.fireworkBehindMesh.count = fireworkBehindCount;
    if (rainCount > 0) {
      this.rainMesh.instanceMatrix.needsUpdate = true;
      if (this.rainMesh.instanceColor) this.rainMesh.instanceColor.needsUpdate = true;
    }
    if (fireworkCount > 0) {
      this.fireworkMesh.instanceMatrix.needsUpdate = true;
      if (this.fireworkMesh.instanceColor) this.fireworkMesh.instanceColor.needsUpdate = true;
    }
    if (fireworkBehindCount > 0) {
      this.fireworkBehindMesh.instanceMatrix.needsUpdate = true;
      if (this.fireworkBehindMesh.instanceColor) {
        this.fireworkBehindMesh.instanceColor.needsUpdate = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.wearableRequest += 1;
    if (this.loadedWearable) {
      unloadHeadAccessoryAsset(this.accessoryRig, this.loadedWearable);
      this.loadedWearable = null;
    }
    this.scene.remove(
      this.rainMesh,
      this.fireworkBehindMesh,
      this.fireworkMesh,
      this.accessoryRig.root,
    );
    this.accessoryRig.dispose();
    this.geometry.dispose();
    this.rainMaterial.dispose();
    this.fireworkMaterial.dispose();
    this.fireworkBehindMaterial.dispose();
    this.trailTexture.dispose();
    this.renderer.dispose();
  }
}
