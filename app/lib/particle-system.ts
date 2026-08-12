import { resolveParticleCollision, type HeadCollider } from "./physics";

type ParticleKind = 0 | 1 | 2;

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  radius: number;
  size: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  impact: number;
  burstIndex: number;
  depthLayer: -1 | 1;
}

interface PendingFireworkEvent {
  at: number;
  type: "rocket" | "burst";
  center: { x: number; y: number };
  count: number;
  paletteIndex: number;
  phase: number;
  burstIndex: number;
  flightDuration: number;
  viewportHeight: number;
}

const FIREWORK_PALETTES = [
  [
    [1, 0.88, 0.38],
    [1, 0.48, 0.08],
  ],
  [
    [0.3, 0.9, 1],
    [0.68, 0.98, 1],
  ],
  [
    [1, 0.34, 0.58],
    [1, 0.76, 0.25],
  ],
] as const;
const FIREWORK_VISUAL_LIMIT = 120;
const FIREWORK_BURST_COUNT = 5;
const FIREWORK_LAUNCH_INTERVAL_SECONDS = 0.14;
const FIREWORK_FLIGHT_SECONDS = 0.42;
export const FIREWORK_DURATION_EXTENSION_SECONDS = 1;

const fireworkCenters = (
  width: number,
  height: number,
  collider: HeadCollider | null,
) => {
  const safeZoneCandidates = [
    { x: width * 0.14, y: height * 0.22 },
    { x: width * 0.5, y: height * 0.12 },
    { x: width * 0.86, y: height * 0.22 },
    { x: width * 0.14, y: height * 0.58 },
    { x: width * 0.86, y: height * 0.58 },
    { x: width * 0.28, y: height * 0.76 },
    { x: width * 0.72, y: height * 0.76 },
    { x: width * 0.5, y: height * 0.84 },
  ];
  if (!collider || collider.points.length < 3) {
    return safeZoneCandidates.slice(0, FIREWORK_BURST_COUNT);
  }

  const xs = collider.points.map((point) => point.x);
  const ys = collider.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max(72, Math.min(width, height) * 0.1);
  const outsideHead = safeZoneCandidates.filter(
    (point) =>
      point.x < minX - padding ||
      point.x > maxX + padding ||
      point.y < minY - padding ||
      point.y > maxY + padding,
  );
  if (outsideHead.length >= FIREWORK_BURST_COUNT) {
    return outsideHead.slice(0, FIREWORK_BURST_COUNT);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const remainingByDistance = [...safeZoneCandidates].sort(
      (a, b) =>
        Math.hypot(b.x - centerX, b.y - centerY) -
        Math.hypot(a.x - centerX, a.y - centerY),
    );
  const selected = [...outsideHead];
  for (const candidate of remainingByDistance) {
    if (!selected.includes(candidate)) selected.push(candidate);
    if (selected.length === FIREWORK_BURST_COUNT) break;
  }
  return selected;
};

export class ParticleSystem {
  private readonly particles: Particle[];
  private readonly random: () => number;
  private pendingFireworkEvents: PendingFireworkEvent[] = [];
  private fireworkTimelineSeconds = 0;

  constructor(capacity = 480, random = Math.random) {
    this.random = random;
    this.particles = Array.from({ length: capacity }, () => ({
      active: false,
      kind: 0 as ParticleKind,
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      vx: 0,
      vy: 0,
      radius: 2,
      size: 8,
      life: 0,
      maxLife: 1,
      r: 1,
      g: 1,
      b: 1,
      impact: 0,
      burstIndex: -1,
      depthLayer: 1,
    }));
  }

  spawnRain(count: number, width: number, height: number, budget: number) {
    let activeRain = this.getCounts().rain;
    for (let index = 0; index < count && activeRain < budget; index += 1) {
      const particle = this.allocate();
      if (!particle) break;
      const x = this.random() * width;
      const y = -20 - this.random() * height * 0.35;
      Object.assign(particle, {
        active: true,
        kind: 0,
        x,
        y,
        previousX: x,
        previousY: y,
        vx: -35 + this.random() * 55,
        vy: 430 + this.random() * 220,
        radius: 1.5,
        size: 22 + this.random() * 14,
        life: 0,
        maxLife: 1.6 + this.random() * 0.8,
        r: 0.36,
        g: 0.73,
        b: 1,
        impact: 0,
        burstIndex: -1,
        depthLayer: 1,
      });
      activeRain += 1;
    }
  }

  spawnFireworks(
    width: number,
    height: number,
    budget: number,
    collider: HeadCollider | null = null,
  ) {
    const centers = fireworkCenters(width, height, collider);
    const visualBudget = Math.min(budget, FIREWORK_VISUAL_LIMIT);
    if (visualBudget <= 0) return;
    const firstPaletteIndex = Math.floor(this.random() * FIREWORK_PALETTES.length);
    const paletteStep = 1 + Math.floor(this.random() * (FIREWORK_PALETTES.length - 1));
    const paletteIndices = centers.map(
      (_, index) =>
        (firstPaletteIndex + index * paletteStep) % FIREWORK_PALETTES.length,
    );
    const particlesPerBurst = Math.floor(visualBudget / centers.length);
    const remainder = visualBudget % centers.length;
    this.pendingFireworkEvents = [];
    this.fireworkTimelineSeconds = 0;
    for (let burstIndex = 0; burstIndex < centers.length; burstIndex += 1) {
      const burstCount = particlesPerBurst + (burstIndex < remainder ? 1 : 0);
      if (burstCount <= 0) break;
      const center = centers[burstIndex];
      const phase = this.random() * Math.PI * 2;
      const launchAt = burstIndex * FIREWORK_LAUNCH_INTERVAL_SECONDS;
      const flightDuration = FIREWORK_FLIGHT_SECONDS + (burstIndex % 2) * 0.04;
      const shared = {
        center,
        count: burstCount,
        paletteIndex: paletteIndices[burstIndex],
        phase,
        burstIndex,
        flightDuration,
        viewportHeight: height,
      };
      this.pendingFireworkEvents.push(
        { ...shared, at: launchAt, type: "rocket" },
        { ...shared, at: launchAt + flightDuration, type: "burst" },
      );
    }
    this.pendingFireworkEvents.sort((a, b) => a.at - b.at);
    this.dispatchFireworkEvents();
  }

  update(deltaSeconds: number, collider: HeadCollider | null) {
    let remainingSeconds = Math.max(0, Math.min(deltaSeconds, 5));
    if (remainingSeconds === 0) this.dispatchFireworkEvents();
    while (remainingSeconds > 0) {
      const dt = Math.min(remainingSeconds, 0.02);
      this.fireworkTimelineSeconds += dt;
      this.dispatchFireworkEvents();
      this.updateParticles(dt, collider);
      remainingSeconds -= dt;
    }
  }

  private updateParticles(dt: number, collider: HeadCollider | null) {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      const isFirstStep = particle.life === 0;
      particle.life += dt;
      particle.impact = Math.max(0, particle.impact - dt * 2.8);
      if (particle.life >= particle.maxLife) {
        particle.active = false;
        continue;
      }

      particle.previousX = particle.x;
      particle.previousY = particle.y;
      if (particle.kind === 0) {
        particle.vy += 55 * dt;
      } else if (particle.kind === 1) {
        if (!isFirstStep) {
          particle.vy += 185 * dt;
          const drag = Math.pow(0.993, dt * 60);
          particle.vx *= drag;
          particle.vy *= drag;
        }
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      if (particle.kind === 1 && collider) {
        if (resolveParticleCollision(particle, collider)) particle.impact = 1;
      }
    }
  }

  private dispatchFireworkEvents() {
    while (
      this.pendingFireworkEvents.length > 0 &&
      this.pendingFireworkEvents[0].at <= this.fireworkTimelineSeconds + 1e-6
    ) {
      const event = this.pendingFireworkEvents.shift();
      if (!event) break;
      if (event.type === "rocket") this.spawnRocket(event);
      else this.spawnBurst(event);
    }
  }

  private spawnRocket(event: PendingFireworkEvent) {
    const particle = this.allocate();
    if (!particle) return;
    const startX = event.center.x + (event.burstIndex - 2) * 54;
    const startY = event.viewportHeight + 34;
    const color = FIREWORK_PALETTES[event.paletteIndex][0];
    Object.assign(particle, {
      active: true,
      kind: 2,
      x: startX,
      y: startY,
      previousX: startX,
      previousY: startY,
      vx: (event.center.x - startX) / event.flightDuration,
      vy: (event.center.y - startY) / event.flightDuration,
      radius: 3,
      size: 9,
      life: 0,
      maxLife: event.flightDuration + 0.03,
      r: color[0],
      g: color[1],
      b: color[2],
      impact: 0,
      burstIndex: event.burstIndex,
      depthLayer: 1,
    });
  }

  private spawnBurst(event: PendingFireworkEvent) {
    for (const particle of this.particles) {
      if (particle.active && particle.kind === 2 && particle.burstIndex === event.burstIndex) {
        particle.active = false;
      }
    }
    const palette = FIREWORK_PALETTES[event.paletteIndex];
    for (let localIndex = 0; localIndex < event.count; localIndex += 1) {
      const particle = this.allocate();
      if (!particle) return;
      const shell = localIndex % 3;
      const angularJitter = (this.random() - 0.5) * 0.03;
      const angle =
        event.phase + (localIndex / event.count) * Math.PI * 2 + angularJitter;
      const speed = 270 + shell * 62 + (this.random() - 0.5) * 18;
      const color = palette[shell === 2 ? 1 : 0];
      Object.assign(particle, {
        active: true,
        kind: 1,
        x: event.center.x,
        y: event.center.y,
        previousX: event.center.x,
        previousY: event.center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.6 + this.random() * 1.6,
        size: 7 + this.random() * 4,
        life: 0,
        maxLife:
          1.65 +
          shell * 0.12 +
          this.random() * 0.24 +
          FIREWORK_DURATION_EXTENSION_SECONDS,
        r: color[0],
        g: color[1],
        b: color[2],
        impact: 0,
        burstIndex: event.burstIndex,
        depthLayer: localIndex % 3 === 0 ? -1 : 1,
      });
    }
  }

  clearRain() {
    for (const particle of this.particles) {
      if (particle.active && particle.kind === 0) particle.active = false;
    }
  }

  clearFireworks() {
    for (const particle of this.particles) {
      if (particle.active && particle.kind !== 0) particle.active = false;
    }
    this.pendingFireworkEvents = [];
    this.fireworkTimelineSeconds = 0;
  }

  clearAll() {
    for (const particle of this.particles) particle.active = false;
    this.pendingFireworkEvents = [];
    this.fireworkTimelineSeconds = 0;
  }

  getCounts() {
    let rain = 0;
    let fireworks = 0;
    for (const particle of this.particles) {
      if (!particle.active) continue;
      if (particle.kind === 0) rain += 1;
      else fireworks += 1;
    }
    return { rain, fireworks, total: rain + fireworks };
  }

  writeRenderData(target: Float32Array) {
    let count = 0;
    for (const particle of this.particles) {
      if (!particle.active || (count + 1) * 12 > target.length) continue;
      const offset = count * 12;
      const remaining = Math.max(0, 1 - particle.life / particle.maxLife);
      target[offset] = particle.x;
      target[offset + 1] = particle.y;
      target[offset + 2] = particle.size;
      target[offset + 3] = particle.r;
      target[offset + 4] = particle.g;
      target[offset + 5] = particle.b;
      target[offset + 6] = particle.kind === 0 ? Math.min(0.75, remaining) : remaining;
      target[offset + 7] = particle.kind;
      const velocityAngle = Math.atan2(particle.vy, particle.vx);
      target[offset + 8] = velocityAngle;
      target[offset + 9] = Math.hypot(particle.vx, particle.vy);
      target[offset + 10] = particle.impact;
      target[offset + 11] = particle.depthLayer;
      count += 1;
    }
    return count;
  }

  private allocate() {
    return this.particles.find((particle) => !particle.active) ?? null;
  }
}
