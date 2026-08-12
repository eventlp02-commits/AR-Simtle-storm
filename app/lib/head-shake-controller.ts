export type WearableAccessoryKind = "sunglasses" | "hat";

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

  constructor(options: HeadShakeOptions = {}) {
    this.threshold = options.thresholdRadians ?? 0.25;
    this.windowMs = options.gestureWindowMs ?? 1_200;
    this.cooldownMs = options.cooldownMs ?? 600;
    this.smoothing = options.smoothing ?? 0.55;
  }

  observe(yawRadians: number, timestampMs: number) {
    if (!Number.isFinite(yawRadians)) return false;
    this.filteredYaw = this.filteredYaw === null
      ? yawRadians
      : this.filteredYaw + (yawRadians - this.filteredYaw) * this.smoothing;

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
      this.firstDirection = direction;
      this.firstExtremeAtMs = timestampMs;
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
  }

  reset() {
    this.resetTracking();
    this.cooldownUntilMs = 0;
  }
}

export class WearableAccessoryController {
  private active: WearableAccessoryKind | null = null;

  getActive() {
    return this.active;
  }

  next() {
    this.active = this.active === "sunglasses" ? "hat" : "sunglasses";
    return this.active;
  }

  reset() {
    this.active = null;
  }
}
