# Head Shake Accessories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate startup audio leakage and add persistent, head-occluded sunglasses/hat switching driven by a complete head shake.

**Architecture:** Keep vision inference in the existing worker and add only compact yaw/pitch/roll output. Add independent pure controllers for shake recognition and wearable switching, then load optimized GLBs once into the existing Three.js accessory rig alongside the temporary orbit gift.

**Tech Stack:** TypeScript, Vitest, React 19, MediaPipe Face Landmarker, Three.js, glTF Transform, Vite/vinext.

---

### Task 1: Startup audio regression

**Files:**
- Modify: `tests/effect-audio.test.ts`
- Modify: `app/lib/effect-audio.ts`

- [ ] Write a failing test asserting `unlock()` causes zero real `play()` calls and does not consume the first surprise.
- [ ] Run `pnpm exec vitest --config vitest.config.ts run tests/effect-audio.test.ts` and confirm the old implementation fails on the play-call count.
- [ ] Change `unlock()` to preload/reset tracks without playing them.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Pure shake and wearable state machines

**Files:**
- Create: `tests/head-shake-controller.test.ts`
- Create: `app/lib/head-shake-controller.ts`
- Modify: `tests/expression-guide.test.ts`
- Modify: `app/lib/expression-guide.ts`

- [ ] Add failing tests for complete opposite-direction motion, timeout, cooldown, translation rejection, switching order, reset, and the third guide step.
- [ ] Run both focused test files and confirm failures are caused by missing behavior.
- [ ] Implement the smallest EMA/threshold state machine and persistent wearable controller.
- [ ] Extend the guide with `SHAKE_PROMPT` and `observeShake()`.
- [ ] Re-run focused tests and confirm all pass.

### Task 3: Compact pose from MediaPipe

**Files:**
- Modify: `tests/vision-utils.test.ts`
- Modify: `app/lib/vision-utils.ts`
- Modify: `app/workers/vision.worker.ts`
- Modify: `app/components/SmileStormExperience.tsx`

- [ ] Add failing matrix-to-Euler tests with identity and known yaw matrices.
- [ ] Implement matrix extraction and enable facial transformation matrices in the worker.
- [ ] Return only yaw/pitch/roll with each result and feed yaw into the shake controller.
- [ ] Add deterministic replay shake samples for local visual verification.

### Task 4: Optimize and render the GLB wearables

**Files:**
- Create: `app/assets/accessories/sunglasses.optimized.glb`
- Create: `app/assets/accessories/hat.optimized.glb`
- Modify: `tests/head-accessories.test.ts`
- Modify: `app/lib/head-accessories.ts`
- Modify: `app/lib/particle-renderer.ts`
- Modify: `app/components/SmileStormExperience.tsx`

- [ ] Add failing rig tests for independent orbit/wearable visibility, transforms, material color, and asset-loading state.
- [ ] Optimize the source GLBs with Meshopt, simplify toward 6k/8k triangles, and cap textures at 512px WebP.
- [ ] Load both files once with `GLTFLoader`, normalize their local bounds, and enforce the shallow-black sunglasses material.
- [ ] Extend the existing rig with yaw/pitch/roll and face-relative anchors while preserving the depth occluder.
- [ ] Keep temporary orbit state separate from persistent wearable state in the render options.

### Task 5: Integrate lifecycle, UI, and verification

**Files:**
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/globals.css`
- Modify: `README.md`
- Modify: `docs/PERFORMANCE.md`

- [ ] Reset shake, wearable, guide, and audio state on every new session.
- [ ] Display “试试摇头～” without forcing a smile/laugh image and update bottom gesture copy.
- [ ] Verify no-audio startup, three shake switches, occlusion, tracking, and reset in the local browser.
- [ ] Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, and `git diff --check`.
- [ ] Commit only intended files, deploy `main` and `gh-pages`, then verify the public URL.
