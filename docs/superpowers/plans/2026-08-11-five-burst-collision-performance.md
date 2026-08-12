# Five-Burst Collision and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox markers so progress remains auditable.

**Goal:** Expand each laugh event from two to five visually distinct fireworks, make head collisions unmistakable, and remove explosion-time frame spikes without increasing the 120-particle visual budget or draw-call count.

**Architecture:** Keep one `ParticleSystem`, one packed render buffer, and the existing pair of Three.js `InstancedMesh` batches. Distribute the fixed budget across five perimeter launch centers, encode a decaying collision-impact signal in the packed buffer, and render impact flashes as additional instances in the existing firework batch. Clear prior fireworks before a new event and precompile shaders/upload the procedural trail texture before interaction.

**Tech Stack:** TypeScript, React, Three.js, Vitest, Node test runner, Playwright/in-app browser.

---

### Task 1: Lock the five-burst behavior with tests

**Files:**
- Modify: `tests/particle-system.test.ts`
- Modify: `app/lib/particle-system.ts`

- [x] Add a failing test proving a 120-particle launch has five unique centers and exactly 24 particles per center.
- [x] Update center-safety, angular-stratification, and palette assertions for five bursts.
- [x] Implement five perimeter-biased centers with collider-aware filtering and a farthest-center fallback.
- [x] Replace ceiling-based allocation with quotient/remainder allocation so all five bursts receive particles whenever the budget is at least five.
- [x] Run the focused particle-system test and confirm green.

### Task 2: Strengthen and expose collision feedback

**Files:**
- Modify: `tests/physics.test.ts`
- Modify: `tests/particle-system.test.ts`
- Modify: `app/lib/physics.ts`
- Modify: `app/lib/particle-system.ts`
- Modify: `app/lib/particle-renderer.ts`

- [x] Add failing tests for a stronger head-velocity impulse, bounded post-collision speed, and a packed collision-impact value.
- [x] Increase collision restitution/head impulse while clamping velocity to a safe maximum.
- [x] Add a decaying `impact` field to particles and append it to the packed render stride.
- [x] Use `impact` to brighten and thicken the collided streak and emit a short-lived flash through the existing firework `InstancedMesh` only.
- [x] Run the focused physics and particle-system tests and confirm green.

### Task 3: Remove avoidable explosion-frame work

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/lib/particle-system.ts`
- Modify: `app/lib/particle-renderer.ts`

- [x] Add failing static assertions requiring old fireworks to be cleared before launch and requiring texture/shader prewarming.
- [x] Add `clearFireworks()` and invoke it immediately before each new five-burst launch, keeping repeated debug triggers at 120 active fireworks.
- [x] Initialize the procedural texture and asynchronously compile the Three.js scene during startup, with a synchronous compile fallback.
- [x] Verify the renderer still uses a fixed number of `InstancedMesh` batches and does not add per-particle objects or draw calls.
- [x] Run the focused static and unit tests and confirm green.

### Task 4: Build and verify the local experience

**Files:**
- Verify: all changed source and test files
- Update user-facing copy only if the five-firework behavior is described explicitly.

- [x] Run type checking, linting, production build, and the complete test suite.
- [x] Start the production build locally at `http://localhost:3000/?debug=1`.
- [x] Grant camera permission, complete calibration, and trigger the debug firework action.
- [x] Confirm five spatially distinct bursts, a 120-particle steady cap, visible head-hit flashes/deflection, and no repeated-trigger particle accumulation.
- [x] Record FPS, inference rate, effect P95, and active particle count from a browser snapshot.
- [x] Copy the verified user-facing build into `outputs` without deploying or pushing to GitHub.
