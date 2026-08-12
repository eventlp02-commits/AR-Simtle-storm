"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import stormSphereUrl from "../assets/cinematic-storm-sphere.optimized.glb?url";

const IDLE_FRAME_INTERVAL_MS = 1_000 / 30;
const REDUCED_MOTION_FRAME_INTERVAL_MS = 1_000 / 12;
const INTERACTION_BOOST_MS = 1_200;

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
};

export function WeatherCoreHero() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050811, 0.075);
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
    camera.position.set(0, 0.15, 4.15);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      const errorFrame = requestAnimationFrame(() => setStatus("error"));
      return () => cancelAnimationFrame(errorFrame);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    mount.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.position.y = -0.06;
    scene.add(root);

    const glassShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 48, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xc7f3ff,
        transmission: 0.72,
        thickness: 0.16,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        ior: 1.45,
        depthWrite: false,
      }),
    );
    glassShell.renderOrder = 3;
    root.add(glassShell);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x78dff7,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rings = [
      new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.007, 8, 128), haloMaterial.clone()),
      new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.004, 8, 128), haloMaterial.clone()),
    ];
    rings[0].rotation.set(1.1, 0.25, 0.2);
    rings[1].rotation.set(0.52, 1.03, -0.42);
    root.add(...rings);

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(210 * 3);
    for (let index = 0; index < starPositions.length; index += 3) {
      const radius = 2 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[index] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index + 1] = radius * Math.cos(phi);
      starPositions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xb8efff,
      size: 0.012,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    root.add(new THREE.Points(starsGeometry, starsMaterial));

    scene.add(new THREE.HemisphereLight(0x9ecfff, 0x070817, 1.35));
    const key = new THREE.DirectionalLight(0xbdeeff, 4.4);
    key.position.set(-2.2, 3, 3.4);
    scene.add(key);
    const rim = new THREE.PointLight(0xff779e, 7, 8, 2);
    rim.position.set(2.4, -0.7, 1.4);
    scene.add(rim);
    const stormLight = new THREE.PointLight(0x6f9dff, 6, 5, 2);
    stormLight.position.set(0, 0.4, 1.4);
    scene.add(stormLight);

    let model: THREE.Object3D | null = null;
    let cancelled = false;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      stormSphereUrl,
      (gltf) => {
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.scale.setScalar(2.05 / Math.max(size.x, size.y, size.z));
        model.rotation.set(0.04, -0.3, -0.03);
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = false;
          child.receiveShadow = false;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.envMapIntensity = 1.4;
              material.roughness = Math.max(0.16, material.roughness * 0.72);
            }
          }
        });
        root.add(model);
        setStatus("ready");
      },
      undefined,
      () => !cancelled && setStatus("error"),
    );

    let frame = 0;
    let isIntersecting = true;
    let isPageVisible = document.visibilityState === "visible";
    let lastRenderedAt = 0;
    let interactionBoostUntil = 0;
    let elapsed = 0;
    const reducedMotionQuery = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    const pointer = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2,
        ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2,
      );
      interactionBoostUntil = performance.now() + INTERACTION_BOOST_MS;
    };
    const onVisibilityChange = () => {
      isPageVisible = document.visibilityState === "visible";
      lastRenderedAt = 0;
    };
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          ([entry]) => {
            isIntersecting = entry?.isIntersecting ?? false;
            lastRenderedAt = 0;
          },
          { threshold: 0.05 },
        );
    intersectionObserver?.observe(mount);
    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      camera.aspect = Math.max(1, width) / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    };
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (!isIntersecting || !isPageVisible) return;
      const frameInterval = reducedMotionQuery.matches
        ? REDUCED_MOTION_FRAME_INTERVAL_MS
        : now < interactionBoostUntil
          ? 1_000 / 60
          : IDLE_FRAME_INTERVAL_MS;
      if (lastRenderedAt && now - lastRenderedAt < frameInterval) return;
      const deltaSeconds = lastRenderedAt
        ? Math.min((now - lastRenderedAt) / 1_000, 0.1)
        : frameInterval / 1_000;
      lastRenderedAt = now;
      elapsed += deltaSeconds;
      root.rotation.y += (pointer.x * 0.11 - root.rotation.y) * 0.025;
      root.rotation.x += (-pointer.y * 0.06 - root.rotation.x) * 0.025;
      if (model) model.rotation.y = -0.3 + elapsed * 0.075;
      rings[0].rotation.z = elapsed * 0.11;
      rings[1].rotation.z = -elapsed * 0.075;
      stormLight.intensity = 4.2 + Math.sin(elapsed * 2.3) * 1.2;
      renderer.render(scene, camera);
    };
    resize();
    mount.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    frame = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      mount.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      intersectionObserver?.disconnect();
      disposeObject(root);
      starsGeometry.dispose();
      starsMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={`weather-core weather-core-${status}`} aria-label="写实风暴水晶球三维预览">
      <div className="weather-core-fallback" aria-hidden="true">
        <span className="weather-core-fallback-ring" />
        <span className="weather-core-fallback-glass" />
        <span className="weather-core-fallback-storm" />
      </div>
      <div ref={mountRef} className="weather-core-canvas" />
      <div className="weather-core-vignette" aria-hidden="true" />
      <div className="weather-core-label">
        <span>LIVE WEATHER CORE</span>
        <b>{status === "loading" ? "正在凝聚风暴" : status === "error" ? "风暴模型加载失败" : "表情驱动气象体"}</b>
      </div>
      <div className="weather-core-legend" aria-hidden="true">
        <span><i className="legend-rain" /> 微笑 · 降雨</span>
        <span><i className="legend-fire" /> 大笑 · 烟花</span>
      </div>
    </div>
  );
}
