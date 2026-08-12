/// <reference lib="webworker" />

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  mouthOpenRatioFromLandmarks,
  teethVisibilityFromRgba,
} from "../lib/mouth-signals";
import {
  compactFaceSignals,
  selectFaceOvalLandmarks,
  selectPrimaryFaceIndex,
} from "../lib/vision-utils";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const workerScope = self as DedicatedWorkerGlobalScope;
let landmarker: FaceLandmarker | null = null;
let delegate: "GPU" | "CPU" = "GPU";
const mouthCanvas = new OffscreenCanvas(24, 12);
const mouthContext = mouthCanvas.getContext("2d", { willReadFrequently: true });

function sampleTeethVisibility(
  bitmap: ImageBitmap,
  landmarks: { x: number; y: number; z: number }[],
) {
  const left = landmarks[78] ?? landmarks[61];
  const right = landmarks[308] ?? landmarks[291];
  const upper = landmarks[13];
  const lower = landmarks[14];
  if (!mouthContext || !left || !right || !upper || !lower) return 0;

  const sourceLeft = Math.max(0, Math.min(left.x, right.x) * bitmap.width);
  const sourceRight = Math.min(bitmap.width, Math.max(left.x, right.x) * bitmap.width);
  const sourceTop = Math.max(0, Math.min(upper.y, lower.y) * bitmap.height);
  const sourceBottom = Math.min(bitmap.height, Math.max(upper.y, lower.y) * bitmap.height);
  const sourceWidth = sourceRight - sourceLeft;
  const sourceHeight = sourceBottom - sourceTop;
  if (sourceWidth < 2 || sourceHeight < 2) return 0;

  mouthContext.clearRect(0, 0, mouthCanvas.width, mouthCanvas.height);
  mouthContext.drawImage(
    bitmap,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    mouthCanvas.width,
    mouthCanvas.height,
  );
  return teethVisibilityFromRgba(
    mouthContext.getImageData(0, 0, mouthCanvas.width, mouthCanvas.height).data,
  );
}

async function createLandmarker(preferredDelegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT, true);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: preferredDelegate,
    },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function initialize() {
  try {
    landmarker = await createLandmarker("GPU");
  } catch {
    delegate = "CPU";
    landmarker = await createLandmarker("CPU");
  }
  workerScope.postMessage({ type: "READY", delegate });
}

workerScope.onmessage = async (event) => {
  const message = event.data as
    | { type: "INIT" }
    | { type: "DETECT"; bitmap: ImageBitmap; timestampMs: number };

  if (message.type === "INIT") {
    try {
      await initialize();
    } catch (error) {
      workerScope.postMessage({
        type: "ERROR",
        message: error instanceof Error ? error.message : "人脸模型加载失败",
      });
    }
    return;
  }

  if (message.type === "DETECT") {
    const startedAt = performance.now();
    try {
      if (!landmarker) throw new Error("人脸模型尚未就绪");
      const result = landmarker.detectForVideo(message.bitmap, message.timestampMs);
      const primaryIndex = selectPrimaryFaceIndex(result.faceLandmarks);
      const categories = result.faceBlendshapes[primaryIndex]?.categories ?? [];
      const blendshapes = compactFaceSignals(Object.fromEntries(
        categories.map((category) => [category.categoryName, category.score]),
      ));
      const landmarks = (result.faceLandmarks[primaryIndex] ?? []).map((landmark) => ({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
      }));
      const mouthOpenRatio = mouthOpenRatioFromLandmarks(landmarks, {
        width: message.bitmap.width,
        height: message.bitmap.height,
      });
      const teethVisibility =
        mouthOpenRatio >= 0.08
          ? sampleTeethVisibility(message.bitmap, landmarks)
          : 0;
      workerScope.postMessage({
        type: "RESULT",
        timestampMs: message.timestampMs,
        inferenceMs: performance.now() - startedAt,
        landmarks: selectFaceOvalLandmarks(landmarks),
        blendshapes,
        mouthOpenRatio,
        teethVisibility,
      });
    } catch (error) {
      workerScope.postMessage({
        type: "DETECT_ERROR",
        message: error instanceof Error ? error.message : "人脸检测失败",
      });
    } finally {
      message.bitmap.close();
    }
  }
};
