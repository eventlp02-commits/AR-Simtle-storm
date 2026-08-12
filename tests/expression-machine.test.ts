import { describe, expect, it } from "vitest";
import {
  ExpressionMachine,
  calibrateBaselines,
  type BlendshapeInput,
} from "../app/lib/expression-machine";

const neutral: BlendshapeInput = {
  mouthSmileLeft: 0.05,
  mouthSmileRight: 0.05,
  jawOpen: 0.04,
  cheekSquintLeft: 0.05,
  cheekSquintRight: 0.05,
  mouthOpenRatio: 0.02,
  teethVisibility: 0,
};

function feed(
  machine: ExpressionMachine,
  input: BlendshapeInput,
  fromMs: number,
  durationMs: number,
  stepMs = 50,
) {
  let result = machine.update(input, fromMs);
  let launchFireworks = result.launchFireworks;
  for (let elapsed = stepMs; elapsed <= durationMs; elapsed += stepMs) {
    result = machine.update(input, fromMs + elapsed);
    launchFireworks ||= result.launchFireworks;
  }
  return { ...result, launchFireworks };
}

describe("calibrateBaselines", () => {
  it("uses medians so a single smile sample cannot skew neutral calibration", () => {
    const samples = Array.from({ length: 30 }, () => neutral);
    samples[12] = {
      ...neutral,
      mouthSmileLeft: 0.95,
      mouthSmileRight: 0.95,
      jawOpen: 0.9,
    };

    expect(calibrateBaselines(samples)).toEqual({
      smile: 0.05,
      jaw: 0.04,
      cheek: 0.05,
      mouthOpen: 0.02,
    });
  });
});

describe("ExpressionMachine", () => {
  it("enters smile only after the 200ms dwell time", () => {
    const machine = new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });
    const smile = { ...neutral, mouthSmileLeft: 0.9, mouthSmileRight: 0.9 };

    expect(feed(machine, smile, 0, 150).state).toBe("NEUTRAL");
    expect(feed(machine, smile, 200, 250).state).toBe("SMILE");
  });

  it("gives laugh priority, launches once, and stays latched until neutral", () => {
    const machine = new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });
    const laugh = {
      ...neutral,
      mouthSmileLeft: 0.95,
      mouthSmileRight: 0.95,
      jawOpen: 0.8,
    };

    const trigger = feed(machine, laugh, 0, 200);
    expect(trigger.state).toBe("LAUGH_LATCHED");
    expect(trigger.launchFireworks).toBe(true);

    const held = feed(machine, laugh, 250, 1_000);
    expect(held.state).toBe("LAUGH_LATCHED");
    expect(held.launchFireworks).toBe(false);

    const stillSmiling = feed(
      machine,
      { ...neutral, mouthSmileLeft: 0.85, mouthSmileRight: 0.85 },
      1_300,
      500,
    );
    expect(stillSmiling.state).toBe("LAUGH_LATCHED");

    const reset = feed(machine, neutral, 1_850, 400);
    expect(reset.state).toBe("NEUTRAL");
  });

  it("requires the 1.5 second cooldown before another laugh can fire", () => {
    const machine = new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });
    const laugh = {
      ...neutral,
      mouthSmileLeft: 0.95,
      mouthSmileRight: 0.95,
      jawOpen: 0.8,
    };

    expect(feed(machine, laugh, 0, 200).launchFireworks).toBe(true);
    expect(feed(machine, neutral, 250, 400).state).toBe("NEUTRAL");
    expect(feed(machine, laugh, 700, 300).launchFireworks).toBe(false);
    feed(machine, neutral, 1_050, 400);
    expect(feed(machine, laugh, 1_550, 300).launchFireworks).toBe(true);
  });

  it("uses geometric mouth opening and visible teeth to reinforce a moderate laugh", () => {
    const machine = new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });
    const moderateLaugh = {
      ...neutral,
      mouthSmileLeft: 0.42,
      mouthSmileRight: 0.42,
      jawOpen: 0.1,
      cheekSquintLeft: 0.12,
      cheekSquintRight: 0.12,
      mouthOpenRatio: 0.24,
      teethVisibility: 0.3,
    };

    const result = feed(machine, moderateLaugh, 0, 300);

    expect(result.state).toBe("LAUGH_LATCHED");
    expect(result.launchFireworks).toBe(true);
  });

  it("does not treat an open-mouth yawn as laughter", () => {
    const machine = new ExpressionMachine({ smile: 0.05, jaw: 0.04, cheek: 0.05, mouthOpen: 0.02 });
    const yawn = {
      ...neutral,
      jawOpen: 0.85,
      mouthOpenRatio: 0.3,
      teethVisibility: 0.02,
    };

    const result = feed(machine, yawn, 0, 500);

    expect(result.state).not.toBe("LAUGH_LATCHED");
    expect(result.launchFireworks).toBe(false);
  });
});
