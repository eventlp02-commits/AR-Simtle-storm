export type WearableAccessoryKind = "sunglasses" | "hat";

export interface WearableAccessoryPresentation {
  kind: WearableAccessoryKind;
  elapsedSeconds: number;
  opacity: number;
}

interface HeadShakeOptions {
  thresholdRadians?: number;
  gestureWindowMs?: number;
  cooldownMs?: number;
  smoothing?: number;
}

export class HeadShakeController {
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly smoothing: number;
  private filteredYaw: number | null = null;
  private firstDirection: -1 | 0 | 1 = 0;
  private firstExtremeAtMs = 0;
  private cooldownUntilMs = 0;
  private armed = true;
  private sawNeutral = false;

  constructor(options: HeadShakeOptions = {}) {
    this.threshold = options.thresholdRadians ?? 0.12;
    this.windowMs = options.gestureWindowMs ?? 1_200;
    this.cooldownMs = options.cooldownMs ?? 600;
    this.smoothing = options.smoothing ?? 0.72;
  }

  observe(yawRadians: number, timestampMs: number) {
    if (!Number.isFinite(yawRadians)) return false;
    this.filteredYaw = this.filteredYaw === null
      ? yawRadians
      : this.filteredYaw + (yawRadians - this.filteredYaw) * this.smoothing;

    if (Math.abs(this.filteredYaw) <= this.threshold * 0.5) this.sawNeutral = true;

    if (!this.armed) {
      if (Math.abs(this.filteredYaw) <= this.threshold * 0.42) this.armed = true;
      return false;
    }

    if (timestampMs < this.cooldownUntilMs) return false;
    if (
      this.firstDirection !== 0 &&
      timestampMs - this.firstExtremeAtMs > this.windowMs
    ) {
      this.firstDirection = 0;
    }

    const direction = this.filteredYaw >= this.threshold
      ? 1
      : this.filteredYaw <= -this.threshold
        ? -1
        : 0;
    if (direction === 0) return false;
    if (this.firstDirection === 0) {
      if (!this.sawNeutral) return false;
      this.firstDirection = direction;
      this.firstExtremeAtMs = timestampMs;
      this.sawNeutral = false;
      return false;
    }
    if (direction === this.firstDirection) return false;

    this.firstDirection = 0;
    this.cooldownUntilMs = timestampMs + this.cooldownMs;
    this.armed = false;
    return true;
  }

  resetTracking() {
    this.filteredYaw = null;
    this.firstDirection = 0;
    this.firstExtremeAtMs = 0;
    this.armed = true;
    this.sawNeutral = false;
  }

  reset() {
    this.resetTracking();
    this.cooldownUntilMs = 0;
  }
}

export class WearableAccessoryController {
  private static readonly displayDurationMs = 2_000;
  private static readonly fadeDurationMs = 600;
  private active: WearableAccessoryKind | null = null;
  private startedAtMs = 0;
  private expiresAtMs = 0;
  private ready = false;
  private nextKind: WearableAccessoryKind = "sunglasses";

  getActive(nowMs: number) {
    if (this.active && this.ready && nowMs >= this.expiresAtMs) this.active = null;
    return this.active;
  }

  next(nowMs: number) {
    this.active = this.nextKind;
    this.nextKind = this.nextKind === "sunglasses" ? "hat" : "sunglasses";
    this.startedAtMs = nowMs;
    this.expiresAtMs = 0;
    this.ready = false;
    return this.active;
  }

  markReady(kind: WearableAccessoryKind, nowMs: number) {
    if (this.active !== kind) return false;
    this.startedAtMs = nowMs;
    this.expiresAtMs = nowMs + WearableAccessoryController.displayDurationMs;
    this.ready = true;
    return true;
  }

  markFailed(kind: WearableAccessoryKind) {
    if (this.active !== kind || this.ready) return false;
    this.active = null;
    this.startedAtMs = 0;
    this.expiresAtMs = 0;
    return true;
  }

  getPresentation(nowMs: number): WearableAccessoryPresentation | null {
    const kind = this.getActive(nowMs);
    if (!kind) return null;
    if (!this.ready) return { kind, elapsedSeconds: 0, opacity: 0 };
    const elapsedMs = Math.max(0, nowMs - this.startedAtMs);
    const fadeStartMs = WearableAccessoryController.displayDurationMs
      - WearableAccessoryController.fadeDurationMs;
    const remainingFade = Math.min(
      1,
      Math.max(
        0,
        (WearableAccessoryController.displayDurationMs - elapsedMs)
          / WearableAccessoryController.fadeDurationMs,
      ),
    );
    const opacity = elapsedMs <= fadeStartMs
      ? 1
      : remainingFade * remainingFade * (3 - 2 * remainingFade);
    return { kind, elapsedSeconds: elapsedMs / 1_000, opacity };
  }

  reset() {
    this.active = null;
    this.startedAtMs = 0;
    this.expiresAtMs = 0;
    this.ready = false;
    this.nextKind = "sunglasses";
  }
}
