import type { BlendshapeInput } from "./expression-machine";

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface CompactHeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface TransformationMatrix {
  rows: number;
  columns: number;
  data: number[];
}

export function poseFromTransformationMatrix(
  matrix: TransformationMatrix | undefined,
): CompactHeadPose | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length < 16) {
    return null;
  }
  // MediaPipe's matrix data is column-major. Extract a stable Y-X-Z Euler
  // decomposition; translation and scale are intentionally discarded.
  const m = matrix.data;
  const yaw = Math.asin(Math.max(-1, Math.min(1, m[8])));
  const cosineYaw = Math.cos(yaw);
  const pitch = Math.abs(cosineYaw) > 1e-5
    ? Math.atan2(-m[9], m[10])
    : Math.atan2(m[6], m[5]);
  const roll = Math.abs(cosineYaw) > 1e-5
    ? Math.atan2(-m[4], m[0])
    : 0;
  return { yaw, pitch, roll };
}

export interface CoverTransform {
  viewportWidth: number;
  viewportHeight: number;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
}

export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

export const INFERENCE_MAX_EDGE = 640;

export function inferenceFrameSize(width: number, height: number) {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, INFERENCE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function selectFaceOvalLandmarks(landmarks: NormalizedLandmark[]) {
  return FACE_OVAL_INDICES.map((index) => landmarks[index]).filter(
    (landmark): landmark is NormalizedLandmark => Boolean(landmark),
  );
}

export function compactFaceSignals(values: Record<string, number>) {
  return {
    mouthSmileLeft: values.mouthSmileLeft ?? 0,
    mouthSmileRight: values.mouthSmileRight ?? 0,
    jawOpen: values.jawOpen ?? 0,
    cheekSquintLeft: values.cheekSquintLeft ?? 0,
    cheekSquintRight: values.cheekSquintRight ?? 0,
  };
}

export function blendshapesToInput(values: Record<string, number>): BlendshapeInput {
  return {
    mouthSmileLeft: values.mouthSmileLeft ?? 0,
    mouthSmileRight: values.mouthSmileRight ?? 0,
    jawOpen: values.jawOpen ?? 0,
    cheekSquintLeft: values.cheekSquintLeft ?? 0,
    cheekSquintRight: values.cheekSquintRight ?? 0,
    mouthOpenRatio: 0,
    teethVisibility: 0,
  };
}

export function selectPrimaryFaceIndex(faces: NormalizedLandmark[][]) {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  faces.forEach((landmarks, index) => {
    if (landmarks.length === 0) return;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const landmark of landmarks) {
      minX = Math.min(minX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxX = Math.max(maxX, landmark.x);
      maxY = Math.max(maxY, landmark.y);
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerDistance = Math.min(
      1,
      Math.hypot(centerX - 0.5, centerY - 0.5) / Math.SQRT1_2,
    );
    const score = area * (1 - centerDistance * 0.25);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function landmarksToFaceOval(
  landmarks: NormalizedLandmark[],
  transform: CoverTransform,
) {
  const scale = Math.max(
    transform.viewportWidth / Math.max(transform.videoWidth, 1),
    transform.viewportHeight / Math.max(transform.videoHeight, 1),
  );
  const renderedWidth = transform.videoWidth * scale;
  const renderedHeight = transform.videoHeight * scale;
  const offsetX = (transform.viewportWidth - renderedWidth) / 2;
  const offsetY = (transform.viewportHeight - renderedHeight) / 2;

  const ovalLandmarks = landmarks.length === FACE_OVAL_INDICES.length
    ? landmarks
    : selectFaceOvalLandmarks(landmarks);
  return ovalLandmarks
    .map((landmark) => {
      const normalizedX = transform.mirrored ? 1 - landmark.x : landmark.x;
      return {
        x: normalizedX * transform.videoWidth * scale + offsetX,
        y: landmark.y * transform.videoHeight * scale + offsetY,
      };
    });
}
