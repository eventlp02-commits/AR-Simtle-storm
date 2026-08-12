import {
  type BlendshapeInput,
  type ExpressionMachine,
  type ExpressionResult,
} from "./expression-machine";

export interface ExpressionReplayFrame {
  atMs: number;
  input: BlendshapeInput;
}

export interface ExpressionReplayResult {
  atMs: number;
  result: ExpressionResult;
}

const neutral: BlendshapeInput = {
  mouthSmileLeft: 0.05,
  mouthSmileRight: 0.05,
  jawOpen: 0.04,
  cheekSquintLeft: 0.05,
  cheekSquintRight: 0.05,
  mouthOpenRatio: 0.02,
  teethVisibility: 0,
};

export function createDefaultExpressionReplay(): ExpressionReplayFrame[] {
  const frames: ExpressionReplayFrame[] = [];
  const append = (fromMs: number, toMs: number, input: BlendshapeInput) => {
    for (let atMs = fromMs; atMs <= toMs; atMs += 50) {
      frames.push({ atMs, input: { ...input } });
    }
  };

  append(0, 250, neutral);
  append(300, 1_050, {
    ...neutral,
    mouthSmileLeft: 0.9,
    mouthSmileRight: 0.9,
    cheekSquintLeft: 0.15,
    cheekSquintRight: 0.15,
  });
  append(1_100, 1_950, {
    ...neutral,
    mouthSmileLeft: 0.95,
    mouthSmileRight: 0.95,
    jawOpen: 0.76,
    cheekSquintLeft: 0.52,
    cheekSquintRight: 0.52,
    mouthOpenRatio: 0.28,
    teethVisibility: 0.42,
  });
  append(2_000, 2_650, neutral);
  return frames;
}

export function replayExpressionSequence(
  machine: ExpressionMachine,
  frames: ReadonlyArray<ExpressionReplayFrame>,
): ExpressionReplayResult[] {
  return frames.map(({ atMs, input }) => ({
    atMs,
    result: machine.update(input, atMs),
  }));
}
