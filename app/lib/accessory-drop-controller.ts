export type AccessoryKind = "sunglasses" | "hat" | "orbit";
export type AccessoryDropSource = "RAIN" | "FIREWORKS";
export type AccessoryDropEffect = AccessoryDropSource | "NONE";

export interface ActiveAccessoryDrop {
  kind: AccessoryKind;
  source: AccessoryDropSource;
  startedAtMs: number;
  endsAtMs: number;
}

export const ACCESSORY_DROP_DURATION_MS = 1_000;
export const ACCESSORY_DROP_COOLDOWN_MS = 3_000;
export const ACCESSORY_DROP_RAIN_RATE = 0.06;
export const ACCESSORY_DROP_FIREWORK_CHANCE = 0.18;

const ACCESSORY_KINDS: readonly AccessoryKind[] = [
  "sunglasses",
  "hat",
  "orbit",
];

export class AccessoryDropController {
  private active: ActiveAccessoryDrop | null = null;
  private cooldownUntilMs = 0;

  constructor(private readonly random: () => number = Math.random) {}

  private expire(nowMs: number) {
    if (this.active && nowMs >= this.active.endsAtMs) this.active = null;
  }

  private pickKind() {
    const index = Math.min(
      ACCESSORY_KINDS.length - 1,
      Math.floor(Math.max(0, this.random()) * ACCESSORY_KINDS.length),
    );
    return ACCESSORY_KINDS[index];
  }

  private start(
    kind: AccessoryKind,
    source: AccessoryDropSource,
    nowMs: number,
  ) {
    this.active = {
      kind,
      source,
      startedAtMs: nowMs,
      endsAtMs: nowMs + ACCESSORY_DROP_DURATION_MS,
    };
    this.cooldownUntilMs = this.active.endsAtMs + ACCESSORY_DROP_COOLDOWN_MS;
    return this.active;
  }

  getActive(nowMs: number) {
    this.expire(nowMs);
    return this.active;
  }

  update(effect: AccessoryDropEffect, nowMs: number, deltaSeconds: number) {
    this.expire(nowMs);
    if (this.active || nowMs < this.cooldownUntilMs || effect !== "RAIN") {
      return this.active;
    }
    const seconds = Math.max(0, deltaSeconds);
    const chance = 1 - Math.exp(-ACCESSORY_DROP_RAIN_RATE * seconds);
    if (this.random() >= chance) return null;
    return this.start(this.pickKind(), "RAIN", nowMs);
  }

  triggerFireworks(nowMs: number) {
    this.expire(nowMs);
    if (this.active || nowMs < this.cooldownUntilMs) return null;
    if (this.random() >= ACCESSORY_DROP_FIREWORK_CHANCE) return null;
    return this.start(this.pickKind(), "FIREWORKS", nowMs);
  }

  force(kind: AccessoryKind, nowMs: number) {
    return this.start(kind, "FIREWORKS", nowMs);
  }

  reset() {
    this.active = null;
    this.cooldownUntilMs = 0;
  }
}
