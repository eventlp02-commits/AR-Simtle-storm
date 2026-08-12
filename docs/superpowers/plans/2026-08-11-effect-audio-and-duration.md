# Effect Audio and Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three supplied MP3 effects with first-firework one-shot semantics, rain/firework looping and fade-outs, while extending the visible firework lifetime by exactly one second.

**Architecture:** Keep audio state outside React rendering in a focused `EffectAudioController` backed by three `HTMLAudioElement` tracks and an injected animation-frame clock for deterministic tests. React owns expression-to-audio wiring and the firework fade timer; the particle system owns visual lifetime. Audio files are bundled through Vite `?url` imports so local, production, and relative-path static builds all resolve them correctly.

**Tech Stack:** TypeScript, React, HTMLAudioElement, requestAnimationFrame, Vitest, Vite/vinext.

---

### Task 1: Add and verify the supplied audio assets

**Files:**
- Create: `app/assets/audio/surprise.mp3`
- Create: `app/assets/audio/rain-loop.mp3`
- Create: `app/assets/audio/fireworks-loop.mp3`
- Modify: `app/types/assets.d.ts`
- Modify: `tests/rendered-html.test.mjs`

- [x] Copy `/Users/liangping/Downloads/开头惊讶.mp3`, `/Users/liangping/Downloads/下雨.mp3`, and `/Users/liangping/Downloads/烟花.mp3` to the three exact asset paths above without transcoding.
- [x] Add a failing static test requiring all three `?url` imports and their generated build assets.
- [x] Add the `*.mp3?url` TypeScript declaration.
- [x] Run the static test and confirm the asset requirement becomes green after implementation.

### Task 2: Implement deterministic loop and fade behavior

**Files:**
- Create: `app/lib/effect-audio.ts`
- Create: `tests/effect-audio.test.ts`

- [x] Add a failing test proving the surprise track plays on the first `startFireworks()` call only, while the fireworks track restarts and loops on every call.
- [x] Add a failing test proving rain sets `loop = true`, plays, fades to zero over 600ms, pauses, and rewinds.
- [x] Add a failing test proving fireworks use the same 600ms fade-out and that restarting during a fade cancels the stale fade.
- [x] Implement `EffectAudioController` with injected animation-frame scheduling, safe rejected-play handling, one-shot memory, per-track fade cancellation, and an `unlock()` method called from the initial user gesture.
- [x] Run `pnpm exec vitest --config vitest.config.ts run tests/effect-audio.test.ts` and confirm green.

### Task 3: Wire expression states to audio

**Files:**
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [x] Add failing static assertions for `startRain`, `stopRain`, `startFireworks`, first-click `unlock`, and release-time fade cleanup.
- [x] Lazily create the controller from the three bundled URLs so server rendering never constructs `Audio`.
- [x] Start rain audio only when entering `SMILE`; fade it out when leaving `SMILE`, losing the face, launching fireworks, ending the experience, or encountering an error.
- [x] Start/restart the fireworks loop inside `launchFireworks()` and schedule its fade to finish with the visual particles.
- [x] Call `unlock()` synchronously from `startExperience()` before the first `await` so Chrome permits later expression-driven playback.
- [x] Run the component/static checks and confirm green.

### Task 4: Extend visual fireworks by exactly one second

**Files:**
- Modify: `app/lib/particle-system.ts`
- Modify: `tests/particle-system.test.ts`

- [x] Add a failing test proving deterministic firework particles remain active at 2.6 seconds and expire after 2.9 seconds.
- [x] Add a named `FIREWORK_DURATION_EXTENSION_SECONDS = 1` constant to every firework particle's `maxLife` calculation.
- [x] Keep the existing `remaining`-based opacity decay so the longer visual naturally fades instead of disappearing abruptly.
- [x] Run the focused particle-system tests and confirm green.

### Task 5: Full local verification and delivery

**Files:**
- Update: `outputs/Smile-Storm-AR-source-v5-audio.zip`
- Create: `outputs/音效与烟花时长验收记录.md`

- [x] Run TypeScript, ESLint, all unit/static tests, production build, static build, and `git diff --check`.
- [x] Start `http://localhost:3000/?debug=1`, grant camera access, and verify the production page and three audio routes return HTTP 200.
- [x] Confirm through deterministic browser-audio tests that the first firework plays surprise plus looping fireworks, the second plays only fireworks, and rain/fireworks fade smoothly when stopped.
- [x] Confirm the firework particles remain visible about one second longer with no regression to the 120-particle cap.
- [x] Package the local source and record anonymous performance/audio verification results without saving camera frames, deploying, committing, or pushing.
