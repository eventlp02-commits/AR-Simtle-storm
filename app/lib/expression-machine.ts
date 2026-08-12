export type EffectState = "NEUTRAL" | "SMILE" | "LAUGH_LATCHED" | "NO_FACE";

export interface BlendshapeInput {
  mouthSmileLeft: number;
  mouthSmileRight: number;
  jawOpen: number;
  cheekSquintLeft: number;
  cheekSquintRight: number;
  mouthOpenRatio: number;
  teethVisibility: number;
}

export interface ExpressionBaselines {
  smile: number;
  jaw: number;
  cheek: number;
  mouthOpen: number;
}

export interface ExpressionResult {
  state: EffectState;
  launchFireworks: boolean;
  startRain: boolean;
  stopRain: boolean;
  smileScore: number;
  jawOpen: number;
  cheekScore: number;
  mouthOpenRatio: number;
  teethVisibility: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
};

export function calibrateBaselines(samples: BlendshapeInput[]): ExpressionBaselines {
  if (samples.length === 0) {
    return { smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 };
  }

  return {
    smile: median(
      samples.map((sample) => (sample.mouthSmileLeft + sample.mouthSmileRight) / 2),
    ),
    jaw: median(samples.map((sample) => sample.jawOpen)),
    cheek: median(
      samples.map((sample) => (sample.cheekSquintLeft + sample.cheekSquintRight) / 2),
    ),
    mouthOpen: median(samples.map((sample) => sample.mouthOpenRatio)),
  };
}

export class ExpressionMachine {
  private readonly alpha: number;
  private baselines: ExpressionBaselines;
  private smoothed: BlendshapeInput | null = null;
  private currentState: EffectState = "NEUTRAL";
  private candidate: "SMILE" | "LAUGH" | null = null;
  private candidateSinceMs = 0;
  private neutralSinceMs: number | null = null;
  private lastFireworksAtMs = Number.NEGATIVE_INFINITY;

  constructor(baselines: ExpressionBaselines, alpha = 0.35) {
    this.baselines = baselines;
    this.alpha = alpha;
  }

  setBaselines(baselines: ExpressionBaselines) {
    this.baselines = baselines;
    this.smoothed = null;
  }

  markNoFace(): ExpressionResult {
    const previous = this.currentState;
    this.currentState = "NO_FACE";
    this.candidate = null;
    this.neutralSinceMs = null;
    return this.result(false, false, previous === "SMILE", 0, 0, 0, 0, 0);
  }

  update(input: BlendshapeInput, nowMs: number): ExpressionResult {
    const previousState = this.currentState;
    if (this.currentState === "NO_FACE") {
      this.currentState = "NEUTRAL";
    }

    this.smoothed = this.smooth(input);
    const smileScore =
      (this.smoothed.mouthSmileLeft + this.smoothed.mouthSmileRight) / 2;
    const jawOpen = this.smoothed.jawOpen;
    const cheekScore =
      (this.smoothed.cheekSquintLeft + this.smoothed.cheekSquintRight) / 2;
    const mouthOpenRatio = this.smoothed.mouthOpenRatio;
    const teethVisibility = this.smoothed.teethVisibility;

    const smileEnter = Math.max(this.baselines.smile + 0.18, 0.45);
    const smileExit = Math.max(this.baselines.smile + 0.1, 0.32);
    const laughSmile = Math.max(this.baselines.smile + 0.22, 0.5);
    const moderateLaughSmile = Math.max(this.baselines.smile + 0.16, 0.36);
    const laughJaw = Math.max(this.baselines.jaw + 0.12, 0.24);
    const reinforcedJaw = Math.max(this.baselines.jaw + 0.08, 0.12);
    const laughCheek = Math.max(this.baselines.cheek + 0.12, 0.26);
    const laughMouthOpen = Math.max(this.baselines.mouthOpen + 0.1, 0.16);
    const classicLaugh =
      smileScore >= laughSmile && (jawOpen >= laughJaw || cheekScore >= laughCheek);
    const mouthReinforcedLaugh =
      smileScore >= moderateLaughSmile &&
      mouthOpenRatio >= laughMouthOpen &&
      (jawOpen >= reinforcedJaw ||
        cheekScore >= laughCheek ||
        teethVisibility >= 0.12);
    const isLaugh = classicLaugh || mouthReinforcedLaugh;
    const isSmile = smileScore >= smileEnter;
    const isNeutral = smileScore < smileExit;
    let launchFireworks = false;

    if (this.currentState === "LAUGH_LATCHED") {
      if (isNeutral) {
        this.neutralSinceMs ??= nowMs;
        if (nowMs - this.neutralSinceMs >= 300) {
          this.currentState = "NEUTRAL";
          this.candidate = null;
        }
      } else {
        this.neutralSinceMs = null;
      }
    } else if (isLaugh) {
      if (this.candidate !== "LAUGH") {
        this.candidate = "LAUGH";
        this.candidateSinceMs = nowMs;
      }
      if (nowMs - this.candidateSinceMs >= 150) {
        this.currentState = "LAUGH_LATCHED";
        if (nowMs - this.lastFireworksAtMs >= 1_500) {
          launchFireworks = true;
          this.lastFireworksAtMs = nowMs;
        }
        this.candidate = null;
        this.neutralSinceMs = null;
      }
    } else if (isSmile) {
      if (this.currentState !== "SMILE") {
        if (this.candidate !== "SMILE") {
          this.candidate = "SMILE";
          this.candidateSinceMs = nowMs;
        }
        if (nowMs - this.candidateSinceMs >= 200) {
          this.currentState = "SMILE";
          this.candidate = null;
        }
      }
      this.neutralSinceMs = null;
    } else if (isNeutral) {
      this.candidate = null;
      if (this.currentState === "SMILE") {
        this.neutralSinceMs ??= nowMs;
        if (nowMs - this.neutralSinceMs >= 300) {
          this.currentState = "NEUTRAL";
          this.neutralSinceMs = null;
        }
      } else {
        this.currentState = "NEUTRAL";
      }
    } else {
      this.candidate = null;
      this.neutralSinceMs = null;
    }

    return this.result(
      launchFireworks,
      previousState !== "SMILE" && this.currentState === "SMILE",
      previousState === "SMILE" && this.currentState !== "SMILE",
      smileScore,
      jawOpen,
      cheekScore,
      mouthOpenRatio,
      teethVisibility,
    );
  }

  private smooth(input: BlendshapeInput): BlendshapeInput {
    if (!this.smoothed) return { ...input };
    const blend = (previous: number, next: number) =>
      previous + (next - previous) * this.alpha;
    return {
      mouthSmileLeft: blend(this.smoothed.mouthSmileLeft, input.mouthSmileLeft),
      mouthSmileRight: blend(this.smoothed.mouthSmileRight, input.mouthSmileRight),
      jawOpen: blend(this.smoothed.jawOpen, input.jawOpen),
      cheekSquintLeft: blend(this.smoothed.cheekSquintLeft, input.cheekSquintLeft),
      cheekSquintRight: blend(this.smoothed.cheekSquintRight, input.cheekSquintRight),
      mouthOpenRatio: blend(this.smoothed.mouthOpenRatio, input.mouthOpenRatio),
      teethVisibility: blend(this.smoothed.teethVisibility, input.teethVisibility),
    };
  }

  private result(
    launchFireworks: boolean,
    startRain: boolean,
    stopRain: boolean,
    smileScore: number,
    jawOpen: number,
    cheekScore: number,
    mouthOpenRatio: number,
    teethVisibility: number,
  ): ExpressionResult {
    return {
      state: this.currentState,
      launchFireworks,
      startRain,
      stopRain,
      smileScore,
      jawOpen,
      cheekScore,
      mouthOpenRatio,
      teethVisibility,
    };
  }
}
