# Three.js Fireworks Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox status for verification.

**Goal:** Replace the noisy sprite-based firework with a coherent, physically legible Three.js instanced firework while retaining AR head collision, safe launch zones, and the current performance budget.

**Architecture:** Keep `ParticleSystem` as the allocation and physics layer, but generate each explosion as a small set of evenly stratified radial shells with one coordinated palette per burst. Replace the raw WebGL2 point-sprite renderer with a Three.js orthographic scene containing two native `InstancedMesh` streak batches (rain and fireworks), using a procedural code-generated trail texture and additive blending. No network asset or new runtime dependency is required.

**Tech Stack:** TypeScript, Three.js 0.185, React 19, Vitest, Node test runner, Vite/vinext.

---

## Task 1: Lock the physical burst model with failing tests

**Files:**
- Modify: `tests/particle-system.test.ts`
- Modify: `app/lib/particle-system.ts`

- [x] Add a test proving one burst distributes velocity angles around the full circle with near-equal angular spacing rather than independent random directions.
- [x] Add a test proving particles from one burst use a constrained two-color palette and that different launch centers may use different palettes.
- [x] Update packed-buffer expectations to a 10-float stride whose last value is particle speed.
- [x] Run `pnpm exec vitest --config vitest.config.ts run tests/particle-system.test.ts` and confirm the new tests fail for the current implementation.
- [x] Implement concentric radial shells: deterministic angular strata plus very small jitter, 3 narrow speed bands, burst-level palette selection, realistic gravity, drag and lifetime.
- [x] Keep a 120-particle readability cap and the existing safe launch-center selection.
- [x] Re-run the focused test and confirm it passes.

## Task 2: Replace raw point sprites with Three.js instancing

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/lib/particle-renderer.ts`
- Modify: `app/components/SmileStormExperience.tsx`

- [x] Change source assertions to require `THREE.InstancedMesh`, `THREE.OrthographicCamera`, and `THREE.AdditiveBlending`, and reject raw `webgl2`, `gl.POINTS`, texture uniforms, and comic firework imports.
- [x] Run the focused source test and confirm it fails against the old renderer.
- [x] Build a transparent Three.js renderer with one rain instance batch and one firework instance batch, two draw calls maximum, no per-frame geometry allocation, and device-pixel-ratio/resolution scaling.
- [x] Generate a horizontal soft trail texture in code; orient and stretch every instance along its current velocity. Fade by instance color/intensity and retain the white-hot tip.
- [x] Remove async image texture loading and comic particle imports from the experience component.
- [x] Dispose renderer, geometry, materials, and procedural texture during teardown.
- [x] Re-run focused source and unit tests.

## Task 3: Verify interaction, performance safeguards, and production build

**Files:**
- Modify if required: `README.md`
- Modify if required: `docs/PERFORMANCE.md`
- Inspect: `app/lib/physics.ts`

- [x] Run `pnpm test:unit`, `pnpm exec tsc --noEmit`, and `pnpm lint`.
- [x] Build and run the full artifact suite with `pnpm test` after stopping the active local server.
- [x] Start the production server locally and exercise `/?debug=1` in PC Chrome: launch fireworks repeatedly, verify two clean radial bursts outside the head, gravity-driven falloff, and no head-origin explosion.
- [x] Capture a final screenshot in `/Users/liangping/Documents/Codex/2026-08-10/pm-ar-1-live-demo-pc/outputs/`.
- [x] Confirm no deployment or GitHub push occurred and report the local test URL.
