"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Broadcast } from "@phosphor-icons/react/Broadcast";
import { CalendarDots } from "@phosphor-icons/react/CalendarDots";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Compass } from "@phosphor-icons/react/Compass";
import { CornersOut } from "@phosphor-icons/react/CornersOut";
import { Crown } from "@phosphor-icons/react/Crown";
import { Gift } from "@phosphor-icons/react/Gift";
import { Heart } from "@phosphor-icons/react/Heart";
import { House } from "@phosphor-icons/react/House";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { Planet } from "@phosphor-icons/react/Planet";
import { Play } from "@phosphor-icons/react/Play";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { Star } from "@phosphor-icons/react/Star";
import { StopCircle } from "@phosphor-icons/react/StopCircle";
import { Users } from "@phosphor-icons/react/Users";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import surpriseAudioUrl from "../assets/audio/surprise.mp3?url";
import rainAudioUrl from "../assets/audio/rain-loop.mp3?url";
import fireworksAudioUrl from "../assets/audio/fireworks-loop.mp3?url";
import smileExpressionUrl from "../assets/expression/expression-smile.webp?url";
import laughExpressionUrl from "../assets/expression/expression-laugh.webp?url";
import visionWorkerUrl from "../workers/vision.worker.ts?worker&url";
import {
  calibrateBaselines,
  ExpressionMachine,
  type BlendshapeInput,
  type EffectState,
} from "../lib/expression-machine";
import {
  CameraPermissionTimeoutError,
  cameraEnvironmentIssue,
  requestCameraStream,
} from "../lib/camera-access";
import {
  createEffectAudioController,
  type EffectAudioController,
} from "../lib/effect-audio";
import {
  AccessoryDropController,
  type ActiveAccessoryDrop,
  type AccessoryKind,
} from "../lib/accessory-drop-controller";
import type { ParticleRenderer } from "../lib/particle-renderer";
import { ParticleSystem } from "../lib/particle-system";
import {
  buildHeadCollider,
  interpolateHeadCollider,
  type HeadCollider,
} from "../lib/physics";
import { AdaptiveQuality, type QualityLevel } from "../lib/quality-controller";
import { percentile } from "../lib/runtime-metrics";
import {
  blendshapesToInput,
  inferenceFrameSize,
  landmarksToFaceOval,
  type NormalizedLandmark,
} from "../lib/vision-utils";
import { normalizeWorkerUrl } from "../lib/worker-url";
import {
  createDefaultExpressionReplay,
  replayExpressionSequence,
} from "../lib/expression-replay";
import {
  ExpressionGuideController,
  expressionGuidePresentation,
  type ExpressionGuideStep,
} from "../lib/expression-guide";

const WeatherCoreHero = lazy(() => import("./WeatherCoreHero").then((module) => ({
  default: module.WeatherCoreHero,
})));

class WeatherCoreErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The 3D preview is optional. Camera controls must remain interactive.
    void error;
    void info;
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="weather-core weather-core-error" role="img" aria-label="风暴水晶球静态预览">
          <div className="weather-core-fallback" aria-hidden="true">
            <span className="weather-core-fallback-ring" />
            <span className="weather-core-fallback-glass" />
            <span className="weather-core-fallback-storm" />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Phase = "idle" | "requesting" | "loading" | "calibrating" | "ready" | "error";

// The source is 2.14s long. Starting the 600ms fade here lets it end once,
// naturally, without a hard audio cut or any loop.
const FIREWORK_AUDIO_FADE_DELAY_MS = 1_550;
const FIREWORK_SCENE_DURATION_MS = 4_200;
const REDUCED_MOTION_FIREWORK_BUDGET = 36;

interface VisionResultMessage {
  type: "RESULT";
  timestampMs: number;
  inferenceMs: number;
  landmarks: NormalizedLandmark[];
  blendshapes: Record<string, number>;
  mouthOpenRatio: number;
  teethVisibility: number;
}

interface RuntimeMetrics {
  renderFps: number;
  inferenceFps: number;
  inferenceMs: number;
  latencyMs: number;
  quality: QualityLevel;
  rain: number;
  fireworks: number;
  delegate: "GPU" | "CPU" | "—";
  smile: number;
  jaw: number;
  mouthOpen: number;
  teeth: number;
}

const defaultMetrics: RuntimeMetrics = {
  renderFps: 0,
  inferenceFps: 0,
  inferenceMs: 0,
  latencyMs: 0,
  quality: "HIGH",
  rain: 0,
  fireworks: 0,
  delegate: "—",
  smile: 0,
  jaw: 0,
  mouthOpen: 0,
  teeth: 0,
};

const statusCopy: Record<EffectState, { label: string; detail: string }> = {
  NEUTRAL: { label: "等待表情", detail: "微笑唤醒雨幕，大笑点燃烟花" },
  SMILE: { label: "微笑 · 下雨", detail: "保持微笑，让雨继续落下" },
  LAUGH_LATCHED: { label: "大笑 · 烟花", detail: "摆动头部，把粒子撞开" },
  NO_FACE: { label: "未检测到人脸", detail: "请回到画面中央" },
};

const accessoryDropCopy: Record<AccessoryKind, string> = {
  orbit: "星轨光环",
};

const friendlyCameraError = (error: unknown) => {
  if (error instanceof CameraPermissionTimeoutError) {
    return "未收到摄像头权限结果。请检查地址栏是否隐藏了权限提示；允许摄像头后刷新，或复制链接到系统 Chrome 打开。";
  }
  if (!(error instanceof DOMException)) return "摄像头启动失败，请刷新后重试。";
  if (error.name === "NotAllowedError") return "摄像头权限被拒绝。请在地址栏开启权限后重试。";
  if (error.name === "NotFoundError") return "没有找到可用摄像头，请连接设备后重试。";
  if (error.name === "NotReadableError") return "摄像头可能正被其他应用占用，请关闭后重试。";
  return `摄像头无法启动：${error.message}`;
};

export function SmileStormExperience() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [effectState, setEffectState] = useState<EffectState>("NEUTRAL");
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [fireworkSceneActive, setFireworkSceneActive] = useState(false);
  const [expressionGuideStep, setExpressionGuideStep] =
    useState<ExpressionGuideStep>("SMILE_PROMPT");
  const [muted, setMuted] = useState(false);
  const [activeDrop, setActiveDrop] = useState<ActiveAccessoryDrop | null>(null);
  const [liked, setLiked] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replayActive, setReplayActive] = useState(false);
  const [debugEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1",
  );
  const [showDebug, setShowDebug] = useState(debugEnabled);
  const [replayEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const parameters = new URLSearchParams(window.location.search);
    return parameters.get("debug") === "1" && parameters.get("replay") === "1";
  });

  const phaseRef = useRef<Phase>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const rendererRef = useRef<ParticleRenderer | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const reducedMotionRef = useRef(false);
  const audioRef = useRef<EffectAudioController | null>(null);
  const fireworksAudioFadeTimerRef = useRef<number | null>(null);
  const fireworkSceneTimerRef = useRef<number | null>(null);
  const replayTimersRef = useRef<number[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const qualityRef = useRef(new AdaptiveQuality());
  const expressionRef = useRef(
    new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 }),
  );
  const expressionStateRef = useRef<EffectState>("NEUTRAL");
  const expressionGuideRef = useRef(new ExpressionGuideController());
  const colliderRef = useRef<HeadCollider | null>(null);
  const targetColliderRef = useRef<HeadCollider | null>(null);
  const calibrationSamplesRef = useRef<BlendshapeInput[]>([]);
  const calibrationStartRef = useRef(0);
  const animationFrameRef = useRef(0);
  const lastFrameRef = useRef(0);
  const inferenceBusyRef = useRef(false);
  const lastInferenceRequestRef = useRef(0);
  const inferenceTimestampsRef = useRef<number[]>([]);
  const latestInferenceMsRef = useRef(0);
  const frameSamplesRef = useRef<number[]>([]);
  const lastMetricsUpdateRef = useRef(0);
  const rainAccumulatorRef = useRef(0);
  const noFaceSinceRef = useRef<number | null>(null);
  const pendingEffectAtRef = useRef<number | null>(null);
  const latencySamplesRef = useRef<number[]>([]);
  const delegateRef = useRef<"GPU" | "CPU" | "—">("—");
  const latestSignalsRef = useRef({ smile: 0, jaw: 0, mouthOpen: 0, teeth: 0 });
  const runningRef = useRef(false);
  const accessoryDropRef = useRef(new AccessoryDropController());
  const activeAccessoryRef = useRef<AccessoryKind | null>(null);

  const setPhaseState = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const ensureEffectAudio = () => {
    audioRef.current ??= createEffectAudioController({
      surprise: surpriseAudioUrl,
      rain: rainAudioUrl,
      fireworks: fireworksAudioUrl,
    });
    return audioRef.current;
  };

  const setRuntimeEffectState = (next: EffectState) => {
    if (expressionStateRef.current !== next) {
      if (expressionStateRef.current === "SMILE") audioRef.current?.stopRain();
      if (next === "SMILE") ensureEffectAudio().startRain();
      expressionStateRef.current = next;
      setEffectState(next);
      setExpressionGuideStep(expressionGuideRef.current.observe(next));
    }
  };

  const observeViewport = (viewport: HTMLDivElement) => {
    resizeObserverRef.current?.disconnect();
    const updateSize = (width: number, height: number) => {
      viewportSizeRef.current = {
        width: Math.max(1, width),
        height: Math.max(1, height),
      };
    };
    const initialBounds = viewport.getBoundingClientRect();
    updateSize(initialBounds.width, initialBounds.height);
    resizeObserverRef.current = new ResizeObserver(([entry]) => {
      if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserverRef.current.observe(viewport);
  };

  const releaseRuntime = () => {
    runningRef.current = false;
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    workerRef.current?.terminate();
    workerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    rendererRef.current?.destroy();
    rendererRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    viewportSizeRef.current = { width: 0, height: 0 };
    if (fireworksAudioFadeTimerRef.current !== null) {
      window.clearTimeout(fireworksAudioFadeTimerRef.current);
      fireworksAudioFadeTimerRef.current = null;
    }
    if (fireworkSceneTimerRef.current !== null) {
      window.clearTimeout(fireworkSceneTimerRef.current);
      fireworkSceneTimerRef.current = null;
    }
    for (const timer of replayTimersRef.current) window.clearTimeout(timer);
    replayTimersRef.current = [];
    setReplayActive(false);
    setFireworkSceneActive(false);
    audioRef.current?.stopAll();
    particlesRef.current.clearAll();
    inferenceBusyRef.current = false;
    inferenceTimestampsRef.current = [];
    frameSamplesRef.current = [];
    calibrationSamplesRef.current = [];
    colliderRef.current = null;
    targetColliderRef.current = null;
    lastFrameRef.current = 0;
    lastInferenceRequestRef.current = 0;
    lastMetricsUpdateRef.current = 0;
    rainAccumulatorRef.current = 0;
    noFaceSinceRef.current = null;
    pendingEffectAtRef.current = null;
    latencySamplesRef.current = [];
    delegateRef.current = "—";
    latestSignalsRef.current = { smile: 0, jaw: 0, mouthOpen: 0, teeth: 0 };
    accessoryDropRef.current.reset();
    expressionGuideRef.current.reset();
    setExpressionGuideStep("SMILE_PROMPT");
    activeAccessoryRef.current = null;
    setActiveDrop(null);
    qualityRef.current = new AdaptiveQuality();
    expressionRef.current = new ExpressionMachine({
      smile: 0.05,
      jaw: 0.04,
      cheek: 0.05,
      mouthOpen: 0.02,
    });
  };

  const stopExperience = () => {
    releaseRuntime();
    setRuntimeEffectState("NEUTRAL");
    setCalibrationProgress(0);
    setMetrics(defaultMetrics);
    setPhaseState("idle");
  };

  const toggleMuted = () => {
    setMuted((current) => {
      const next = !current;
      ensureEffectAudio().setMuted(next);
      return next;
    });
  };

  const toggleLike = () => {
    setLiked((current) => !current);
  };

  const toggleFullscreen = () => {
    const room = document.querySelector<HTMLElement>(".live-room");
    if (!document.fullscreenElement) void room?.requestFullscreen();
    else void document.exitFullscreen();
  };

  useEffect(() => {
    return releaseRuntime;
  }, []);

  const syncAccessoryDrop = (drop: ActiveAccessoryDrop | null) => {
    const nextKind = drop?.kind ?? null;
    if (activeAccessoryRef.current === nextKind) return;
    activeAccessoryRef.current = nextKind;
    setActiveDrop(drop);
  };

  const launchFireworks = (timestampMs = performance.now()) => {
    const viewportSize = viewportSizeRef.current;
    if (!viewportSize.width || !viewportSize.height) return;
    const budget = qualityRef.current.getBudget();
    const fireworkBudget = reducedMotionRef.current
      ? Math.min(budget.fireworks, REDUCED_MOTION_FIREWORK_BUDGET)
      : budget.fireworks;
    const audio = ensureEffectAudio();
    audio.stopRain();
    audio.startFireworks();
    setFireworkSceneActive(true);
    if (fireworksAudioFadeTimerRef.current !== null) {
      window.clearTimeout(fireworksAudioFadeTimerRef.current);
    }
    fireworksAudioFadeTimerRef.current = window.setTimeout(() => {
      audioRef.current?.stopFireworks();
      fireworksAudioFadeTimerRef.current = null;
    }, FIREWORK_AUDIO_FADE_DELAY_MS);
    if (fireworkSceneTimerRef.current !== null) {
      window.clearTimeout(fireworkSceneTimerRef.current);
    }
    fireworkSceneTimerRef.current = window.setTimeout(() => {
      setFireworkSceneActive(false);
      fireworkSceneTimerRef.current = null;
    }, FIREWORK_SCENE_DURATION_MS);
    particlesRef.current.clearRain();
    particlesRef.current.clearFireworks();
    particlesRef.current.spawnFireworks(
      viewportSize.width,
      viewportSize.height,
      fireworkBudget,
      colliderRef.current,
    );
    syncAccessoryDrop(accessoryDropRef.current.triggerFireworks(timestampMs));
    pendingEffectAtRef.current = timestampMs;
  };

  const launchDebugAccessory = () => {
    syncAccessoryDrop(accessoryDropRef.current.force("orbit", performance.now()));
  };

  const launchDebugFireworks = () => {
    setRuntimeEffectState("LAUGH_LATCHED");
    launchFireworks();
    replayTimersRef.current.push(
      window.setTimeout(() => {
        if (expressionStateRef.current === "LAUGH_LATCHED") {
          setRuntimeEffectState("NEUTRAL");
        }
      }, FIREWORK_SCENE_DURATION_MS),
    );
  };

  const handleVisionResult = (message: VisionResultMessage) => {
    inferenceBusyRef.current = false;
    latestInferenceMsRef.current = message.inferenceMs;
    const now = performance.now();
    inferenceTimestampsRef.current.push(now);
    inferenceTimestampsRef.current = inferenceTimestampsRef.current.filter(
      (timestamp) => now - timestamp <= 1_000,
    );

    if (!message.landmarks.length) {
      noFaceSinceRef.current ??= now;
      if (now - noFaceSinceRef.current >= 300 && phaseRef.current === "ready") {
        expressionRef.current.markNoFace();
        setRuntimeEffectState("NO_FACE");
        colliderRef.current = null;
        targetColliderRef.current = null;
      }
      return;
    }
    noFaceSinceRef.current = null;

    const video = videoRef.current;
    const viewportSize = viewportSizeRef.current;
    if (video && viewportSize.width && viewportSize.height) {
      const oval = landmarksToFaceOval(message.landmarks, {
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        videoWidth: video.videoWidth || 1_280,
        videoHeight: video.videoHeight || 720,
        mirrored: true,
      });
      targetColliderRef.current = buildHeadCollider(
        oval,
        targetColliderRef.current,
        message.timestampMs,
      );
    }

    const input = {
      ...blendshapesToInput(message.blendshapes),
      mouthOpenRatio: message.mouthOpenRatio,
      teethVisibility: message.teethVisibility,
    };
    latestSignalsRef.current = {
      smile: (input.mouthSmileLeft + input.mouthSmileRight) / 2,
      jaw: input.jawOpen,
      mouthOpen: input.mouthOpenRatio,
      teeth: input.teethVisibility,
    };
    if (phaseRef.current === "calibrating") {
      const smile = (input.mouthSmileLeft + input.mouthSmileRight) / 2;
      const isNeutralCandidate =
        smile < 0.3 && input.jawOpen < 0.22 && input.mouthOpenRatio < 0.1;
      if (isNeutralCandidate) {
        calibrationSamplesRef.current.push(input);
        const progress = Math.min(1, calibrationSamplesRef.current.length / 30);
        setCalibrationProgress(progress);
      }
      const timedOut = now - calibrationStartRef.current > 5_000;
      if (calibrationSamplesRef.current.length >= 30 || timedOut) {
        if (calibrationSamplesRef.current.length >= 10) {
          expressionRef.current.setBaselines(
            calibrateBaselines(calibrationSamplesRef.current),
          );
        }
        setPhaseState("ready");
        setRuntimeEffectState("NEUTRAL");
      }
      return;
    }

    if (phaseRef.current !== "ready") return;
    const result = expressionRef.current.update(input, message.timestampMs);
    setRuntimeEffectState(result.state);
    if (result.launchFireworks) {
      launchFireworks(message.timestampMs);
    }
  };

  const runFrame = (now: number) => {
    if (!runningRef.current) return;
    const viewport = viewportRef.current;
    const video = videoRef.current;
    const renderer = rendererRef.current;
    if (!viewport || !video || !renderer) return;

    if (
      reducedMotionRef.current &&
      lastFrameRef.current &&
      now - lastFrameRef.current < 1_000 / 30
    ) {
      animationFrameRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const viewportSize = viewportSizeRef.current;
    if (!viewportSize.width || !viewportSize.height) {
      animationFrameRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const deltaSeconds = lastFrameRef.current
      ? Math.min((now - lastFrameRef.current) / 1_000, 0.1)
      : 1 / 60;
    lastFrameRef.current = now;
    colliderRef.current = interpolateHeadCollider(
      colliderRef.current,
      targetColliderRef.current,
      1 - Math.exp(-18 * deltaSeconds),
    );
    frameSamplesRef.current.push(1 / Math.max(deltaSeconds, 1 / 240));
    if (frameSamplesRef.current.length > 120) frameSamplesRef.current.shift();

    const budget = qualityRef.current.getBudget();
    const qualityLevel = qualityRef.current.getLevel();
    if (expressionStateRef.current === "SMILE") {
      rainAccumulatorRef.current += deltaSeconds * (reducedMotionRef.current ? 36 : 72);
      const spawnCount = Math.floor(rainAccumulatorRef.current);
      if (spawnCount > 0) {
        particlesRef.current.spawnRain(
          spawnCount,
          viewportSize.width,
          viewportSize.height,
          budget.rain,
        );
        rainAccumulatorRef.current -= spawnCount;
      }
    }

    syncAccessoryDrop(
      accessoryDropRef.current.update(
        expressionStateRef.current === "SMILE" ? "RAIN" : "NONE",
        now,
        deltaSeconds,
      ),
    );

    particlesRef.current.update(deltaSeconds, colliderRef.current);
    renderer.render(
      particlesRef.current,
      viewportSize.width,
      viewportSize.height,
      reducedMotionRef.current
        ? Math.min(budget.resolutionScale, 0.78)
        : budget.resolutionScale,
      {
        headCollider: colliderRef.current,
        enableOcclusion: qualityLevel !== "LOW" && !reducedMotionRef.current,
        enableExtraGlow: qualityLevel !== "LOW" && !reducedMotionRef.current,
        activeAccessory: activeAccessoryRef.current,
        elapsedSeconds: now / 1_000,
        quality: qualityLevel,
        reducedMotion: reducedMotionRef.current,
      },
    );

    if (pendingEffectAtRef.current !== null) {
      latencySamplesRef.current.push(now - pendingEffectAtRef.current);
      if (latencySamplesRef.current.length > 120) latencySamplesRef.current.shift();
      pendingEffectAtRef.current = null;
    }

    if (
      !inferenceBusyRef.current &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      now - lastInferenceRequestRef.current >= 45
    ) {
      inferenceBusyRef.current = true;
      lastInferenceRequestRef.current = now;
      const inferenceSize = inferenceFrameSize(
        video.videoWidth || 1_280,
        video.videoHeight || 720,
      );
      createImageBitmap(video, {
        resizeWidth: inferenceSize.width,
        resizeHeight: inferenceSize.height,
        resizeQuality: "low",
      })
        .then((bitmap) => {
          if (!workerRef.current || !runningRef.current) {
            bitmap.close();
            inferenceBusyRef.current = false;
            return;
          }
          workerRef.current.postMessage(
            { type: "DETECT", bitmap, timestampMs: now },
            [bitmap],
          );
        })
        .catch(() => {
          inferenceBusyRef.current = false;
        });
    }

    if (now - lastMetricsUpdateRef.current >= 500) {
      lastMetricsUpdateRef.current = now;
      const sorted = [...frameSamplesRef.current].sort((a, b) => a - b);
      const renderFps = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      const quality = qualityRef.current.update(renderFps, now);
      const counts = particlesRef.current.getCounts();
      const signals = latestSignalsRef.current;
      setMetrics({
        renderFps,
        inferenceFps: inferenceTimestampsRef.current.length,
        inferenceMs: latestInferenceMsRef.current,
        latencyMs: percentile(latencySamplesRef.current, 0.95),
        quality,
        rain: counts.rain,
        fireworks: counts.fireworks,
        delegate: delegateRef.current,
        smile: signals.smile,
        jaw: signals.jaw,
        mouthOpen: signals.mouthOpen,
        teeth: signals.teeth,
      });
    }

    animationFrameRef.current = requestAnimationFrame(runFrame);
  };

  const startReplayExperience = async () => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setReplayActive(true);
    setPhaseState("loading");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) throw new Error("回放画面初始化失败");
    const { ParticleRenderer } = await import("../lib/particle-renderer");
    rendererRef.current = new ParticleRenderer(canvas);
    observeViewport(viewport);
    const { width, height } = viewportSizeRef.current;
    const center = { x: width * 0.5, y: height * 0.48 };
    const radiusX = Math.min(132, width * 0.12);
    const radiusY = Math.min(172, height * 0.22);
    const oval = Array.from({ length: 36 }, (_, index) => {
      const angle = (index / 36) * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
      };
    });
    const replayCollider = buildHeadCollider(oval, null, performance.now());
    colliderRef.current = replayCollider;
    targetColliderRef.current = replayCollider;
    runningRef.current = true;
    setPhaseState("ready");
    animationFrameRef.current = requestAnimationFrame(runFrame);

    const replayMachine = new ExpressionMachine({
      smile: 0.05,
      jaw: 0.04,
      cheek: 0.05,
      mouthOpen: 0.02,
    });
    const replay = replayExpressionSequence(
      replayMachine,
      createDefaultExpressionReplay(),
    );
    let previousState: EffectState | null = null;
    for (const frame of replay) {
      if (frame.result.state === previousState && !frame.result.launchFireworks) continue;
      previousState = frame.result.state;
      replayTimersRef.current.push(
        window.setTimeout(() => {
          setRuntimeEffectState(frame.result.state);
          latestSignalsRef.current = {
            smile: frame.result.smileScore,
            jaw: frame.result.jawOpen,
            mouthOpen: frame.result.mouthOpenRatio,
            teeth: frame.result.teethVisibility,
          };
          if (frame.result.launchFireworks) launchFireworks(performance.now());
        }, frame.atMs),
      );
    }
  };

  const startExperience = async () => {
    releaseRuntime();
    void ensureEffectAudio().unlock();
    setErrorMessage("");
    if (replayEnabled) {
      try {
        await startReplayExperience();
      } catch (error) {
        releaseRuntime();
        setErrorMessage(error instanceof Error ? error.message : "回放启动失败");
        setPhaseState("error");
      }
      return;
    }
    let embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch {
      embedded = true;
    }
    const environmentIssue = cameraEnvironmentIssue({
      secureContext: window.isSecureContext,
      hostname: window.location.hostname,
      embedded,
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      userAgent: navigator.userAgent,
    });
    if (environmentIssue) {
      setErrorMessage(environmentIssue);
      setPhaseState("error");
      return;
    }

    setPhaseState("requesting");
    try {
      reducedMotionRef.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const stream = await requestCameraStream(
        navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices),
        {
          audio: false,
          video: {
            width: { ideal: 1_280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: "user",
          },
        },
        8_000,
      );
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const viewport = viewportRef.current;
      if (!video || !canvas || !viewport) throw new Error("体验画面初始化失败");
      video.srcObject = stream;
      await video.play();
      const { ParticleRenderer } = await import("../lib/particle-renderer");
      const renderer = new ParticleRenderer(canvas);
      rendererRef.current = renderer;
      observeViewport(viewport);

      setPhaseState("loading");
      const workerUrl = normalizeWorkerUrl(
        new URL(visionWorkerUrl, window.location.href),
      );
      const worker = new Worker(workerUrl, { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event) => {
        const message = event.data as
          | VisionResultMessage
          | { type: "READY"; delegate: "GPU" | "CPU" }
          | { type: "ERROR" | "DETECT_ERROR"; message: string };
        if (message.type === "READY") {
          delegateRef.current = message.delegate;
          calibrationSamplesRef.current = [];
          calibrationStartRef.current = performance.now();
          lastFrameRef.current = 0;
          runningRef.current = true;
          setPhaseState("calibrating");
          animationFrameRef.current = requestAnimationFrame(runFrame);
        } else if (message.type === "RESULT") {
          handleVisionResult(message);
        } else if (message.type === "DETECT_ERROR") {
          inferenceBusyRef.current = false;
        } else {
          releaseRuntime();
          setErrorMessage(`人脸模型加载失败：${message.message}`);
          setPhaseState("error");
        }
      };
      worker.onerror = () => {
        releaseRuntime();
        setErrorMessage("人脸识别模块启动失败，请刷新页面后重试。");
        setPhaseState("error");
      };
      worker.postMessage({ type: "INIT" });
    } catch (error) {
      releaseRuntime();
      setErrorMessage(friendlyCameraError(error));
      setPhaseState("error");
    }
  };

  const isExperienceVisible = phase !== "idle";
  const copy = statusCopy[effectState];
  const guidePresentation = expressionGuidePresentation(
    expressionGuideStep,
    effectState,
    fireworkSceneActive,
  );

  return (
    <main className={`experience-shell phase-${phase}${phase === "idle" ? " minimal-experience" : " live-room-shell"}`}>
      <section className={phase === "idle" ? "minimal-stage" : "live-room"} aria-label="表情 AR 体验">
        {isExperienceVisible && (
          <header className="live-room-nav">
            <div className="live-brand" aria-label="Smile Storm Live">
              <Broadcast size={22} weight="fill" aria-hidden="true" />
              <strong>Smile<span>Live</span></strong>
            </div>
            <nav className="live-nav-links" aria-label="直播导航">
              <button type="button"><House size={17} />首页</button>
              <button type="button" className="active"><VideoCamera size={17} />直播</button>
              <button type="button"><Compass size={17} />发现</button>
              <button type="button"><CalendarDots size={17} />活动</button>
              <button type="button"><Users size={17} />关注</button>
            </nav>
            <form className="live-search" onSubmit={(event) => event.preventDefault()} role="search">
              <MagnifyingGlass size={17} aria-hidden="true" />
              <input
                aria-label="搜索直播、房间或内容"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索直播、房间或内容"
              />
            </form>
            <div className="live-nav-actions">
              <button type="button"><Crown size={17} weight="fill" />会员</button>
              <button type="button" onClick={() => setFavorite((current) => !current)} aria-pressed={favorite}>
                <Heart size={17} weight={favorite ? "fill" : "regular"} />收藏
              </button>
              <button type="button" className="go-live-button" onClick={stopExperience}>
                <StopCircle size={18} weight="fill" />结束
              </button>
            </div>
          </header>
        )}

        <div className={phase === "idle" ? "minimal-stage-content" : "live-room-grid"}>
          <section className={phase === "idle" ? "minimal-home-stage" : "live-room-center"} aria-label="直播舞台">
            <div
              className={`live-video-frame live-stage${replayActive ? " replay-mode" : ""}`}
              ref={viewportRef}
              aria-label={isExperienceVisible ? "实时表情 AR 体验" : "直播预览"}
            >
              {!isExperienceVisible && (
                <div className="prelive-preview minimal-home">
                  <WeatherCoreErrorBoundary>
                    <Suspense
                      fallback={
                        <div className="weather-core weather-core-loading" role="status">
                          <div className="weather-core-fallback" aria-hidden="true">
                            <span className="weather-core-fallback-ring" />
                            <span className="weather-core-fallback-glass" />
                            <span className="weather-core-fallback-storm" />
                          </div>
                          <span>正在凝聚风暴</span>
                        </div>
                      }
                    >
                      <WeatherCoreHero />
                    </Suspense>
                  </WeatherCoreErrorBoundary>
                  <button className="preview-start-button minimal-start" onClick={startExperience}>
                    <Play size={18} weight="fill" />开始体验
                  </button>
                </div>
              )}

              {isExperienceVisible && (
                <>
                  <video ref={videoRef} className="camera-feed" playsInline muted aria-label="实时摄像头画面" />
                  <div
                    className={fireworkSceneActive ? "firework-dimmer active" : "firework-dimmer"}
                    aria-hidden="true"
                  />
                  <canvas ref={canvasRef} className="effect-canvas" aria-hidden="true" />
                  <div className="stage-vignette" aria-hidden="true" />
                </>
              )}

              {replayActive && <span className="replay-badge">DEBUG REPLAY · NO CAMERA</span>}

              {(phase === "requesting" || phase === "loading" || phase === "calibrating") && (
                <div className="loading-panel" role="status" aria-live="polite">
                  <div className="loading-orbit"><span /></div>
                  <p className="eyebrow">
                    {phase === "requesting" ? "CAMERA PERMISSION" : phase === "loading" ? "LOCAL MODEL" : "NEUTRAL CALIBRATION"}
                  </p>
                  <h2>
                    {phase === "requesting" ? "正在连接摄像头" : phase === "loading" ? "正在加载人脸模型" : "请保持自然表情"}
                  </h2>
                  <p>{phase === "calibrating" ? "正建立中性表情基线，请正对镜头。" : "首次加载可能需要几秒，识别将在本机运行。"}</p>
                  {phase === "calibrating" && (
                    <div className="progress-track" aria-label={`校准进度 ${Math.round(calibrationProgress * 100)}%`}>
                      <span style={{ width: `${calibrationProgress * 100}%` }} />
                    </div>
                  )}
                </div>
              )}

              {phase === "ready" && (
                <div className={`effect-status state-${effectState.toLowerCase()}`} aria-live="polite">
                  {guidePresentation ? (
                    <span className="expression-guide-slot">
                      <img
                        className="expression-guide-icon"
                        src={guidePresentation.expression === "smile" ? smileExpressionUrl : laughExpressionUrl}
                        alt={guidePresentation.expression === "smile" ? "微笑表情" : "大笑表情"}
                        width={96}
                        height={96}
                      />
                    </span>
                  ) : (
                    <span className="status-signal" />
                  )}
                  <div><b>{copy.label}</b><p>{copy.detail}</p></div>
                </div>
              )}

              {phase === "ready" && guidePresentation?.prompt && (
                <strong className="expression-guide-prompt" role="status" aria-live="polite">
                  {guidePresentation.prompt}
                </strong>
              )}

              {activeDrop && phase === "ready" && (
                <div className="gift-drop-toast" role="status" aria-live="polite">
                  <Gift size={17} weight="fill" />
                  <span>稀有礼物 · {accessoryDropCopy[activeDrop.kind]}</span>
                  <small>1 秒限定</small>
                </div>
              )}

              {showDebug && phase === "ready" && (
                <aside className="debug-panel" aria-label="实时性能数据">
                  <p>RUNTIME TELEMETRY</p>
                  <dl>
                    <div><dt>Render</dt><dd>{metrics.renderFps.toFixed(0)} FPS</dd></div>
                    <div><dt>Vision</dt><dd>{metrics.inferenceFps} FPS</dd></div>
                    <div><dt>Inference</dt><dd>{metrics.inferenceMs.toFixed(1)} ms</dd></div>
                    <div><dt>Effect P95</dt><dd>{metrics.latencyMs.toFixed(1)} ms</dd></div>
                    <div><dt>Particles</dt><dd>{metrics.rain + metrics.fireworks}</dd></div>
                    <div><dt>Quality</dt><dd>{metrics.quality}</dd></div>
                    <div><dt>Delegate</dt><dd>{metrics.delegate}</dd></div>
                    <div><dt>Smile</dt><dd>{metrics.smile.toFixed(2)}</dd></div>
                    <div><dt>Jaw</dt><dd>{metrics.jaw.toFixed(2)}</dd></div>
                    <div><dt>Mouth ratio</dt><dd>{metrics.mouthOpen.toFixed(2)}</dd></div>
                    <div><dt>Teeth</dt><dd>{metrics.teeth.toFixed(2)}</dd></div>
                  </dl>
                </aside>
              )}

              {phase === "ready" && (
                <div className="gesture-guide" aria-hidden="true">
                  <span>微笑触发下雨</span><span>大笑触发烟花</span><span>摆头碰撞</span>
                </div>
              )}

              {phase === "error" && (
                <div className="error-panel" role="alert">
                  <span className="error-code">AR / ERROR</span>
                  <h2>暂时无法开始体验</h2>
                  <p>{errorMessage}</p>
                  <div className="error-actions">
                    <button className="primary-button small" onClick={startExperience}>重新尝试</button>
                    <button className="text-button" onClick={stopExperience}>返回预览</button>
                  </div>
                </div>
              )}
            </div>

            {isExperienceVisible && (
              <footer className="live-room-toolbar" aria-label="直播操作栏">
                <div className="toolbar-group toolbar-primary">
                  <button className="round-action primary" onClick={stopExperience} aria-label="结束直播">
                    <StopCircle size={22} weight="fill" />
                  </button>
                  <button className="round-action" onClick={toggleMuted} aria-pressed={muted} aria-label={muted ? "开启声音" : "关闭声音"}>
                    {muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
                  </button>
                  <button className="toolbar-button" type="button"><ChatCircleDots size={18} />弹幕开</button>
                </div>
                <div className="toolbar-group toolbar-social">
                  <button className={liked ? "toolbar-button selected" : "toolbar-button"} onClick={toggleLike} aria-pressed={liked}><Heart size={19} weight={liked ? "fill" : "regular"} />点赞</button>
                  <button className="toolbar-button" type="button"><Gift size={19} />送礼</button>
                  <button className={favorite ? "toolbar-button selected" : "toolbar-button"} onClick={() => setFavorite((current) => !current)} aria-pressed={favorite}><Star size={19} weight={favorite ? "fill" : "regular"} />收藏</button>
                  <button className="toolbar-button" type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href)}><ShareNetwork size={19} />分享</button>
                </div>
                <div className="toolbar-group toolbar-view">
                  <span className="quality-pill"><MonitorPlay size={18} />{metrics.quality === "HIGH" ? "超清" : metrics.quality}</span>
                  {debugEnabled && (phase === "calibrating" || phase === "ready") && <button className="debug-toggle" onClick={launchDebugFireworks}>测试烟花</button>}
                  {debugEnabled && phase === "ready" && <button className="debug-toggle" onClick={launchDebugAccessory}>测试3D礼物</button>}
                  {debugEnabled && isExperienceVisible && (
                    <button className="debug-toggle" onClick={() => setShowDebug((visible) => !visible)} aria-pressed={showDebug}>{showDebug ? "隐藏数据" : "运行数据"}</button>
                  )}
                  <button className="round-action" onClick={toggleFullscreen} aria-label="切换全屏"><CornersOut size={20} /></button>
                </div>
              </footer>
            )}
          </section>

          {isExperienceVisible && (
            <aside className="live-room-right" aria-label="直播信息与礼物">
              <section className="live-card live-info-card">
                <header><h3>直播信息</h3><Broadcast size={18} /></header>
                <dl>
                  <div><dt>直播状态</dt><dd className="is-live">直播中</dd></div>
                  <div><dt>画质</dt><dd>720P</dd></div>
                  <div><dt>码率</dt><dd>自适应</dd></div>
                  <div><dt>渲染</dt><dd>{metrics.renderFps ? `${metrics.renderFps.toFixed(0)} fps` : "60 fps"}</dd></div>
                  <div><dt>隐私</dt><dd>本机处理</dd></div>
                </dl>
                <p>摄像头画面仅在本机处理，不会上传或保存。</p>
              </section>
              <section className="live-card live-gifts-card">
                <header><h3>AR 礼物</h3><Gift size={18} /></header>
                <p>不需点选，只会在天气特效中低概率短暂掉落。</p>
                <div className="gift-grid"><article><span><Planet size={28} weight="duotone" /></span><b>星轨光环</b><small>天气随机</small></article></div>
                <div className="gift-drop-policy" aria-label="稀有礼物掉落规则">
                  <span><b>6%/秒</b> 雨中稀有掉落</span><span><b>18%/次</b> 烟花稀有掉落</span><span><b>1 秒</b> 仅展示 1 秒</span>
                </div>
              </section>
              <section className="live-card contributor-card">
                <header><h3>礼物贡献榜</h3><Crown size={18} weight="fill" /></header>
                <ol>
                  <li><span>1</span><div><b>Stella</b><small>星轨守护者</small></div><strong>12.8k</strong></li>
                  <li><span>2</span><div><b>NOVA</b><small>未来旅人</small></div><strong>9.6k</strong></li>
                  <li><span>3</span><div><b>Cloud</b><small>风暴听众</small></div><strong>6.2k</strong></li>
                </ol>
              </section>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
