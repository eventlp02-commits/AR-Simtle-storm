import { ParticleSystem } from "./particle-system";

export interface ParticleBenchmarkOptions {
  frames: number;
  fireworkBudget: number;
  rainBudget: number;
}

export interface ParticleBenchmarkResult {
  elapsedMs: number;
  maxFireworks: number;
  maxRain: number;
  simulatedFrames: number;
}

export function runDeterministicParticleBenchmark({
  frames,
  fireworkBudget,
  rainBudget,
}: ParticleBenchmarkOptions): ParticleBenchmarkResult {
  const particles = new ParticleSystem(480, () => 0.5);
  let maxFireworks = 0;
  let maxRain = 0;
  const startedAt = performance.now();

  for (let frame = 0; frame < frames; frame += 1) {
    const cycleFrame = frame % 900;
    if (cycleFrame < 480) {
      particles.spawnRain(3, 1_280, 720, rainBudget);
    } else if (cycleFrame === 480) {
      particles.clearRain();
      particles.clearFireworks();
      particles.spawnFireworks(1_280, 720, fireworkBudget);
    }
    particles.update(1 / 60, null);
    const counts = particles.getCounts();
    maxFireworks = Math.max(maxFireworks, counts.fireworks);
    maxRain = Math.max(maxRain, counts.rain);
  }

  return {
    elapsedMs: performance.now() - startedAt,
    maxFireworks,
    maxRain,
    simulatedFrames: frames,
  };
}
