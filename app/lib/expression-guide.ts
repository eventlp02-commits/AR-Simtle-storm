import type { EffectState } from "./expression-machine";

export type ExpressionGuideStep =
  | "SMILE_PROMPT"
  | "LAUGH_PROMPT"
  | "SHAKE_PROMPT"
  | "COMPLETE";
export type ExpressionGuideIcon = "smile" | "laugh";

export interface ExpressionGuidePresentation {
  expression: ExpressionGuideIcon | null;
  prompt: "笑一个～" | "试试大笑～" | "试试摇头～" | null;
  mode: "prompt" | "effect";
}

export class ExpressionGuideController {
  private step: ExpressionGuideStep = "SMILE_PROMPT";

  getStep() {
    return this.step;
  }

  observe(effect: EffectState) {
    if (this.step === "SMILE_PROMPT" && effect === "SMILE") {
      this.step = "LAUGH_PROMPT";
    } else if (this.step === "LAUGH_PROMPT" && effect === "LAUGH_LATCHED") {
      this.step = "SHAKE_PROMPT";
    }
    return this.step;
  }

  observeShake() {
    if (this.step === "SHAKE_PROMPT") this.step = "COMPLETE";
    return this.step;
  }

  reset() {
    this.step = "SMILE_PROMPT";
    return this.step;
  }
}

export function expressionGuidePresentation(
  step: ExpressionGuideStep,
  effect: EffectState,
  fireworkSceneActive: boolean,
): ExpressionGuidePresentation | null {
  if (step === "SMILE_PROMPT") {
    return { expression: "smile", prompt: "笑一个～", mode: "prompt" };
  }
  if (step === "LAUGH_PROMPT") {
    return { expression: "laugh", prompt: "试试大笑～", mode: "prompt" };
  }
  if (step === "SHAKE_PROMPT") {
    return { expression: null, prompt: "试试摇头～", mode: "prompt" };
  }
  if (fireworkSceneActive) {
    return { expression: "laugh", prompt: null, mode: "effect" };
  }
  if (effect === "SMILE") {
    return { expression: "smile", prompt: null, mode: "effect" };
  }
  return null;
}
