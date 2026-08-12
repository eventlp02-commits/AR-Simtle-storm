import { describe, expect, it } from "vitest";
import { ExpressionMachine } from "../app/lib/expression-machine";
import {
  createDefaultExpressionReplay,
  replayExpressionSequence,
} from "../app/lib/expression-replay";

const createMachine = () =>
  new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });

describe("expression replay", () => {
  it("replays neutral, rain, one firework and reset deterministically", () => {
    const frames = createDefaultExpressionReplay();
    const first = replayExpressionSequence(createMachine(), frames);
    const second = replayExpressionSequence(createMachine(), frames);

    expect(first).toEqual(second);
    expect(first.some((frame) => frame.result.state === "SMILE")).toBe(true);
    expect(first.some((frame) => frame.result.state === "LAUGH_LATCHED")).toBe(true);
    expect(first.filter((frame) => frame.result.launchFireworks)).toHaveLength(1);
    expect(first.at(-1)?.result.state).toBe("NEUTRAL");
  });

  it("keeps replay timestamps monotonic", () => {
    const timestamps = createDefaultExpressionReplay().map((frame) => frame.atMs);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});
