import { describe, expect, it } from "vitest";
import {
  blendshapesToInput,
  compactFaceSignals,
  inferenceFrameSize,
  landmarksToFaceOval,
  selectFaceOvalLandmarks,
  selectPrimaryFaceIndex,
} from "../app/lib/vision-utils";

describe("blendshapesToInput", () => {
  it("maps named MediaPipe categories and defaults missing values to zero", () => {
    const input = blendshapesToInput({
      mouthSmileLeft: 0.8,
      mouthSmileRight: 0.7,
      jawOpen: 0.6,
    });

    expect(input).toEqual({
      mouthSmileLeft: 0.8,
      mouthSmileRight: 0.7,
      jawOpen: 0.6,
      cheekSquintLeft: 0,
      cheekSquintRight: 0,
      mouthOpenRatio: 0,
      teethVisibility: 0,
    });
  });
});

describe("landmarksToFaceOval", () => {
  it("mirrors and cover-fits normalized landmarks into viewport pixels", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.25, y: 0.5, z: 0 }));
    const oval = landmarksToFaceOval(landmarks, {
      viewportWidth: 1_000,
      viewportHeight: 500,
      videoWidth: 1_000,
      videoHeight: 500,
      mirrored: true,
    });

    expect(oval).toHaveLength(36);
    expect(oval[0]).toEqual({ x: 750, y: 250 });
  });

  it("accounts for horizontal crop when object-fit cover uses a tall viewport", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const oval = landmarksToFaceOval(landmarks, {
      viewportWidth: 500,
      viewportHeight: 1_000,
      videoWidth: 1_000,
      videoHeight: 500,
      mirrored: true,
    });

    expect(oval[0]).toEqual({ x: 250, y: 500 });
  });
});

describe("selectPrimaryFaceIndex", () => {
  it("prefers a substantially larger face", () => {
    const smallCentered = [
      { x: 0.4, y: 0.4, z: 0 },
      { x: 0.6, y: 0.6, z: 0 },
    ];
    const largeOffCenter = [
      { x: 0.05, y: 0.1, z: 0 },
      { x: 0.55, y: 0.8, z: 0 },
    ];

    expect(selectPrimaryFaceIndex([smallCentered, largeOffCenter])).toBe(1);
  });

  it("uses proximity to the frame center to break similar-size ties", () => {
    const left = [
      { x: 0.02, y: 0.3, z: 0 },
      { x: 0.32, y: 0.7, z: 0 },
    ];
    const centered = [
      { x: 0.35, y: 0.3, z: 0 },
      { x: 0.65, y: 0.7, z: 0 },
    ];

    expect(selectPrimaryFaceIndex([left, centered])).toBe(1);
  });
});

describe("vision transport budget", () => {
  it("limits a 720p inference frame to one quarter of the source pixels", () => {
    expect(inferenceFrameSize(1_280, 720)).toEqual({ width: 640, height: 360 });
    expect(inferenceFrameSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("transfers only the face oval and expression signals used by the UI", () => {
    const landmarks = Array.from({ length: 478 }, (_, index) => ({
      x: index / 478,
      y: index / 956,
      z: 0,
    }));
    const oval = selectFaceOvalLandmarks(landmarks);
    const signals = compactFaceSignals({
      mouthSmileLeft: 0.7,
      mouthSmileRight: 0.8,
      jawOpen: 0.6,
      cheekSquintLeft: 0.4,
      cheekSquintRight: 0.5,
      unusedSignal: 1,
    });

    expect(oval).toHaveLength(36);
    expect(Object.keys(signals)).toEqual([
      "mouthSmileLeft",
      "mouthSmileRight",
      "jawOpen",
      "cheekSquintLeft",
      "cheekSquintRight",
    ]);
  });
});
