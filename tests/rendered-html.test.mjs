import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Smile Storm product landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>Smile Storm — 表情驱动 AR 互动实验<\/title>/);
  assert.match(html, /开始体验/);
  assert.match(html, /minimal-home/);
  assert.match(html, /minimal-stage/);
  assert.doesNotMatch(html, /直播数据/);
  assert.doesNotMatch(html, /live-room-nav/);
  assert.doesNotMatch(html, /live-room-toolbar/);
  assert.doesNotMatch(html, /live-room-right/);
  assert.doesNotMatch(html, /直播信息|礼物贡献榜|搜索直播|开启直播/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the local vision, WebGL and accessibility implementation", async () => {
  const [page, component, weatherHero, worker, renderer, guide, packageJson, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SmileStormExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/WeatherCoreHero.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workers/vision.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/particle-renderer.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/expression-guide.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SmileStormExperience/);
  assert.match(component, /getUserMedia/);
  assert.match(component, /new Worker/);
  assert.match(component, /createImageBitmap/);
  assert.match(component, /resizeWidth:/);
  assert.match(component, /resizeHeight:/);
  assert.match(component, /resizeQuality:\s*"low"/);
  assert.match(component, /import type \{ ParticleRenderer \}/);
  assert.match(component, /await import\("\.\.\/lib\/particle-renderer"\)/);
  assert.match(component, /new ResizeObserver/);
  assert.match(component, /viewportSizeRef/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(component, /REDUCED_MOTION_FIREWORK_BUDGET\s*=\s*36/);
  assert.match(component, /createDefaultExpressionReplay/);
  assert.match(component, /replayExpressionSequence/);
  assert.match(component, /replayEnabled/);
  assert.match(component, /DEBUG REPLAY · NO CAMERA/);
  assert.match(component, /Mouth ratio/);
  assert.match(component, /Teeth/);
  assert.match(component, /WeatherCoreHero/);
  assert.match(component, /lazy\(\(\) => import\("\.\/WeatherCoreHero"\)/);
  assert.match(component, /Suspense/);
  assert.match(component, /className="prelive-preview minimal-home"/);
  assert.match(component, /className="preview-start-button minimal-start"/);
  assert.doesNotMatch(component, /className="live-room-nav|className="live-room-toolbar|className="live-room-right/);
  assert.match(component, /@phosphor-icons\/react/);
  assert.doesNotMatch(component, /from "@phosphor-icons\/react"/);
  assert.match(component, /@phosphor-icons\/react\/Play/);
  for (const icon of ["Gift"]) {
    assert.match(component, new RegExp(`\\b${icon}\\b`));
  }
  assert.doesNotMatch(component, /\bSunglasses\b/);
  assert.doesNotMatch(component, /\bTopHat\b/);
  assert.doesNotMatch(component, /鎏金墨镜|午夜礼帽/);
  assert.doesNotMatch(component, /aria-pressed=\{accessories\./);
  assert.doesNotMatch(component, /const \[accessories, setAccessories\]/);
  assert.doesNotMatch(component, /toggleAccessory/);
  assert.match(component, /AccessoryDropController/);
  assert.match(component, /ExpressionGuideController/);
  assert.match(component, /expressionGuidePresentation/);
  assert.match(component, /expression-smile\.webp\?url/);
  assert.match(component, /expression-laugh\.webp\?url/);
  assert.match(component, /className="expression-guide-slot"/);
  assert.doesNotMatch(component, /key=\{guidePresentation\.expression\}/);
  assert.match(guide, /笑一个～/);
  assert.match(guide, /试试大笑～/);
  assert.match(component, /expressionGuideRef\.current\.reset\(\)/);
  assert.doesNotMatch(component, /className="live-room-left"/);
  assert.match(component, /accessoryDropRef/);
  assert.match(component, /activeAccessory:/);
  assert.match(component, /triggerFireworks\(timestampMs\)/);
  assert.match(component, /update\([\s\S]*"RAIN"[\s\S]*deltaSeconds/);
  assert.match(component, /\.reset\(\)/);
  assert.match(component, /稀有礼物/);
  assert.doesNotMatch(component, /已装备/);
  assert.match(component, /elapsedSeconds:/);
  assert.match(component, /debugEnabled/);
  assert.match(component, /phase === "calibrating" \|\| phase === "ready"/);
  assert.match(component, /debugEnabled\s*&&\s*isExperienceVisible\s*&&[\s\S]*setShowDebug/);
  assert.match(component, /debugEnabled\s*&&[\s\S]*运行数据/);
  assert.match(component, /surprise\.mp3\?url/);
  assert.match(component, /rain-loop\.mp3\?url/);
  assert.match(component, /fireworks-loop\.mp3\?url/);
  assert.match(component, /createEffectAudioController/);
  assert.match(component, /ensureEffectAudio/);
  assert.match(component, /void ensureEffectAudio\(\)\.unlock\(\)/);
  assert.match(component, /\.startRain\(\)/);
  assert.match(component, /\.stopRain\(\)/);
  assert.match(component, /\.startFireworks\(\)/);
  assert.match(component, /\.stopFireworks\(\)/);
  assert.match(component, /\.stopAll\(\)/);
  assert.match(component, /FIREWORK_AUDIO_FADE_DELAY_MS\s*=\s*1_550/);
  assert.match(component, /FIREWORK_SCENE_DURATION_MS\s*=\s*4_200/);
  assert.match(component, /fireworkSceneActive/);
  assert.match(component, /setFireworkSceneActive\(true\)/);
  assert.match(component, /firework-dimmer/);
  assert.doesNotMatch(component, /rain-drop-comic\.png\?url/);
  assert.doesNotMatch(component, /firework-streak-comic\.png\?url/);
  assert.match(component, /测试烟花/);
  assert.match(component, /launchFireworks/);
  assert.match(component, /launchDebugFireworks/);
  assert.match(
    component,
    /particlesRef\.current\.clearFireworks\(\);\s*particlesRef\.current\.spawnFireworks/,
  );
  assert.match(component, /const releaseRuntime = \(\) =>/);
  assert.match(component, /releaseRuntime\(\);\s+setErrorMessage\(`人脸模型加载失败/);
  assert.match(worker, /@mediapipe\/tasks-vision@0\.10\.35\/wasm/);
  assert.match(worker, /FilesetResolver\.forVisionTasks\(WASM_ROOT,\s*true\)/);
  assert.match(worker, /outputFaceBlendshapes: true/);
  assert.match(worker, /mouthOpenRatioFromLandmarks/);
  assert.match(worker, /teethVisibility/);
  assert.match(worker, /selectFaceOvalLandmarks/);
  assert.match(worker, /compactFaceSignals/);
  assert.match(renderer, /new THREE\.InstancedMesh/);
  assert.match(renderer, /createHeadAccessoryRig/);
  assert.match(renderer, /headAccessoryTransform/);
  assert.match(renderer, /updateHeadAccessoryRig/);
  assert.match(renderer, /this\.accessoryRig = createHeadAccessoryRig\(\)/);
  assert.match(renderer, /activeAccessory\?: AccessoryKind \| null/);
  assert.match(renderer, /elapsedSeconds\?: number/);
  assert.match(renderer, /this\.accessoryRig\.dispose\(\)/);
  assert.equal((renderer.match(/new THREE\.WebGLRenderer/g) ?? []).length, 1);
  assert.match(renderer, /new THREE\.OrthographicCamera/);
  assert.match(renderer, /new THREE\.OrthographicCamera\(0, 1, 0, 1, 0\.1, 2_000\)/);
  assert.match(renderer, /this\.camera\.position\.z = 1_000/);
  assert.match(renderer, /new THREE\.AmbientLight/);
  assert.match(renderer, /depth: true/);
  assert.match(renderer, /this\.camera\.top = cssHeight/);
  assert.match(renderer, /this\.camera\.bottom = 0/);
  assert.match(renderer, /const worldY = this\.cssHeight - y/);
  assert.match(renderer, /const worldAngle = -angle/);
  assert.match(renderer, /THREE\.AdditiveBlending/);
  assert.match(renderer, /premultipliedAlpha: true/);
  assert.doesNotMatch(renderer, /premultipliedAlpha: false/);
  assert.doesNotMatch(renderer, /vertexColors: true/);
  assert.doesNotMatch(renderer, /particleDebug/);
  assert.match(renderer, /new THREE\.CanvasTexture/);
  assert.match(renderer, /this\.renderer\.initTexture\(this\.trailTexture\)/);
  assert.match(renderer, /this\.renderer\.compile\(this\.scene, this\.camera\)/);
  assert.doesNotMatch(renderer, /compileAsync/);
  assert.match(renderer, /collisionGlow/);
  assert.match(renderer, /fireworkHaloIntensity/);
  assert.match(renderer, /sparkHeadIntensity/);
  assert.match(renderer, /enableExtraGlow && !isRocket/);
  assert.match(renderer, /fireworkBehindMesh/);
  assert.match(renderer, /uHeadCenter/);
  assert.match(renderer, /uHeadRadius/);
  assert.match(renderer, /discard/);
  assert.match(renderer, /enableOcclusion/);
  assert.match(renderer, /enableExtraGlow/);
  assert.match(renderer, /batchCount \+ 1 < this\.capacity/);
  assert.match(renderer, /setMatrixAt/);
  assert.equal((renderer.match(/new THREE\.InstancedMesh/g) ?? []).length, 1);
  assert.match(renderer, /renderer\.dispose\(\)/);
  assert.doesNotMatch(renderer, /getContext\("webgl2"/);
  assert.doesNotMatch(renderer, /drawArrays\(gl\.POINTS/);
  assert.doesNotMatch(renderer, /sampler2D/);
  assert.doesNotMatch(renderer, /loadTextures/);
  assert.match(weatherHero, /GLTFLoader/);
  assert.match(weatherHero, /cinematic-storm-sphere\.optimized\.glb\?url/);
  assert.match(weatherHero, /ACESFilmicToneMapping/);
  assert.match(weatherHero, /renderer\.dispose\(\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.minimal-stage\s*\{/);
  assert.match(css, /\.minimal-home\s*\{/);
  assert.match(css, /\.minimal-home \.weather-core\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(css, /\.minimal-start\s*\{[^}]*left:\s*50%[^}]*bottom:/s);
  assert.match(css, /\.landing\s*\{[^}]*height:\s*100svh/s);
  for (const selector of ["live-video-frame"]) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{`));
  }
  assert.match(css, /\.live-video-frame\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /\.live-video-frame\.live-stage\s*\{[^}]*height:\s*auto/s);
  assert.match(css, /\.expression-guide-icon\s*\{/);
  assert.match(css, /\.expression-guide-slot\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  assert.match(css, /\.expression-guide-slot\s*\{[^}]*animation:\s*expression-guide-opacity/s);
  assert.match(css, /\.live-video-frame \.effect-status\s*\{[^}]*width:\s*310px/s);
  assert.match(css, /\.expression-guide-icon\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  const expressionIconRule = css.match(/\.expression-guide-icon\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(expressionIconRule, /margin:|expression-guide-arrival/);
  assert.match(css, /\.expression-guide-prompt\s*\{[^}]*color:\s*rgba\(255,255,255,\.6\)/s);
  assert.match(css, /@keyframes\s+expression-guide-float/);
  const mobileStyles = css.match(
    /@media \(max-width: 540px\)\s*\{([\s\S]*)\}\s*@media \(prefers-reduced-motion/,
  )?.[1] ?? "";
  assert.match(
    mobileStyles,
    /\.hero-copy h1\s*\{[^}]*font-size:\s*clamp\(44px,\s*12\.5vw,\s*60px\)/s,
  );
  for (const selector of ["debug-toggle", "effect-status", "gesture-guide"]) {
    const rule = css.match(new RegExp(`\\.${selector}[^\\{]*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
    assert.doesNotMatch(rule, /backdrop-filter/);
  }
  assert.match(css, /\.minimal-debug-controls\s*\{/);
  const fireworkDimmerRule = css.match(/\.firework-dimmer\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(fireworkDimmerRule, /z-index:\s*1/);
  assert.match(fireworkDimmerRule, /opacity:\s*0/);
  assert.match(fireworkDimmerRule, /transition:\s*opacity\s*600ms/);
  assert.doesNotMatch(fireworkDimmerRule, /backdrop-filter|filter:/);
  assert.match(css, /\.firework-dimmer\.active\s*\{[^}]*opacity:\s*\.58/s);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await Promise.all([
    access(new URL("../app/assets/audio/surprise.mp3", import.meta.url)),
    access(new URL("../app/assets/audio/rain-loop.mp3", import.meta.url)),
    access(new URL("../app/assets/audio/fireworks-loop.mp3", import.meta.url)),
  ]);
  const rainAsset = await readFile(
    new URL("../app/assets/audio/rain-loop.mp3", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(rainAsset).digest("hex"),
    "27ff2a289ccebac269b9c7a55f4f224bd3d8d12964c3cc1377b3393120ccccf0",
  );
  await access(projectRoot);
});

test("bundles the production vision worker as executable JavaScript", async () => {
  const chunksDirectory = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const chunkNames = await readdir(chunksDirectory);
  const chunkSources = await Promise.all(
    chunkNames
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(new URL(name, chunksDirectory), "utf8")),
  );
  const clientSource = chunkSources.join("\n");

  assert.match(clientSource, /vision\.worker-[\w-]+\.js/);
  assert.doesNotMatch(clientSource, /vision\.worker[^`"']*\.ts/);
});
