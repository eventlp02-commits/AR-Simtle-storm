import { describe, expect, it } from "vitest";
import {
  ExpressionGuideController,
  expressionGuidePresentation,
} from "../app/lib/expression-guide";

describe("ExpressionGuideController", () => {
  it("starts by asking for a smile", () => {
    const guide = new ExpressionGuideController();
    expect(guide.getStep()).toBe("SMILE_PROMPT");
  });

  it("does not let a laugh skip the smile step", () => {
    const guide = new ExpressionGuideController();
    guide.observe("LAUGH_LATCHED");
    expect(guide.getStep()).toBe("SMILE_PROMPT");
  });

  it("advances through smile then laugh and never regresses", () => {
    const guide = new ExpressionGuideController();
    guide.observe("SMILE");
    expect(guide.getStep()).toBe("LAUGH_PROMPT");
    guide.observe("LAUGH_LATCHED");
    expect(guide.getStep()).toBe("COMPLETE");
    guide.observe("SMILE");
    expect(guide.getStep()).toBe("COMPLETE");
  });

  it("resets for each newly started live session", () => {
    const guide = new ExpressionGuideController();
    guide.observe("SMILE");
    guide.observe("LAUGH_LATCHED");
    guide.reset();
    expect(guide.getStep()).toBe("SMILE_PROMPT");
  });
});

describe("expressionGuidePresentation", () => {
  it("shows sequential prompt copy before onboarding completes", () => {
    expect(expressionGuidePresentation("SMILE_PROMPT", "NEUTRAL", false)).toEqual({
      expression: "smile",
      prompt: "笑一个～",
      mode: "prompt",
    });
    expect(expressionGuidePresentation("LAUGH_PROMPT", "NEUTRAL", false)).toEqual({
      expression: "laugh",
      prompt: "试试大笑～",
      mode: "prompt",
    });
  });

  it("keeps only the matching icon visible during completed AR effects", () => {
    expect(expressionGuidePresentation("COMPLETE", "SMILE", false)).toEqual({
      expression: "smile",
      prompt: null,
      mode: "effect",
    });
    expect(expressionGuidePresentation("COMPLETE", "NEUTRAL", true)).toEqual({
      expression: "laugh",
      prompt: null,
      mode: "effect",
    });
    expect(expressionGuidePresentation("COMPLETE", "NEUTRAL", false)).toBeNull();
  });
});
