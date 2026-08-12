# Procedural 3D Gift Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将手动佩戴的平面化头部装饰重构为具有真实厚度、合理人脸比例、头部前后遮挡和 1 秒低概率随机掉落规则的 Three.js 3D 礼物。

**Architecture:** 新增纯逻辑 `AccessoryDropController` 管理雨中与烟花触发概率、1 秒生命周期和冷却；附件渲染器改为单个活动礼物并加入不可见的椭球头部深度遮挡体。主体验只把当前特效状态和时间送给控制器，右侧礼物区变为只读掉落说明，不再直接修改渲染状态。

**Tech Stack:** React 19、TypeScript、Three.js r185、Vitest、Node test、Vinext/Vite。

---

### Task 1: 随机掉落状态机

**Files:**
- Create: `app/lib/accessory-drop-controller.ts`
- Create: `tests/accessory-drop-controller.test.ts`

- [x] **Step 1: Write the failing tests**

测试初始无礼物、雨中单步概率为 `1 - exp(-0.06 * deltaSeconds)`、烟花单次概率为 18%、命中后只激活一件礼物、`endsAtMs - startedAtMs === 1000`、未到期保持、到期清除以及 3 秒冷却。

- [x] **Step 2: Run test to verify RED**

Run: `pnpm exec vitest run tests/accessory-drop-controller.test.ts`

Expected: FAIL because `AccessoryDropController` does not exist.

- [x] **Step 3: Implement minimal controller**

实现 `update(effect, nowMs, deltaSeconds)`、`triggerFireworks(nowMs)`、`force(kind, nowMs)`、`reset()`；随机函数通过构造参数注入，便于确定性测试。

- [x] **Step 4: Run test to verify GREEN**

Run: `pnpm exec vitest run tests/accessory-drop-controller.test.ts`

Expected: PASS.

### Task 2: 三维比例与头部深度遮挡

**Files:**
- Modify: `app/lib/head-accessories.ts`
- Modify: `tests/head-accessories.test.ts`

- [x] **Step 1: Write the failing tests**

断言 rig 包含 `head-depth-occluder`，遮挡材质 `colorWrite=false`、`depthWrite=true`；墨镜镜片/镜框有真实 Z 厚度、镜腿位于遮挡体后方；礼帽由帽冠和前后帽檐组成；行星环前后半环位于遮挡体两侧。断言 `updateHeadAccessoryRig` 接收单个 `activeAccessory`，为空时完全隐藏。

- [x] **Step 2: Run test to verify RED**

Run: `pnpm exec vitest run tests/head-accessories.test.ts`

Expected: FAIL because the current rig uses a three-boolean selection and has no depth occluder.

- [x] **Step 3: Rebuild the Three.js assets**

墨镜按脸宽约 72%、眼线宽约 64%、镜片高宽比约 0.46 建模，并以 `ExtrudeGeometry`/`BoxGeometry` 提供厚度；礼帽按脸宽约 82%、帽冠高约脸高 30% 建模，后帽檐放在头部后方、前帽檐放在前方；星轨按脸宽约 118% 建模并拆分前后半环。加入低面数椭球遮挡体，只写深度不写颜色。

- [x] **Step 4: Run test to verify GREEN**

Run: `pnpm exec vitest run tests/head-accessories.test.ts`

Expected: PASS and triangle count remains under 1800.

### Task 3: 接入单一渲染循环与随机触发

**Files:**
- Modify: `app/lib/particle-renderer.ts`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [x] **Step 1: Write the failing tests**

断言 WebGLRenderer 开启深度缓冲但仍只有一个实例；组件不再保存 `AccessorySelection` 或渲染三个 `aria-pressed` 礼物按钮；雨中逐帧调用控制器、烟花发射时调用 `triggerFireworks`、停止体验时 `reset`；渲染参数只传 `activeAccessory`。

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because the current component exposes manual equipment controls.

- [x] **Step 3: Implement integration**

每帧用当前 `EffectState` 更新掉落控制器；礼物状态变化时只更新一个 ref 和轻量 `aria-live` 文案。烟花触发执行 18% 抽签；雨中按连续时间概率抽签。正式页面无强制按钮，`?debug=1` 保留“测试稀有礼物”验收入口但不出现在普通体验。

- [x] **Step 4: Run related tests**

Run: `pnpm exec vitest run tests/accessory-drop-controller.test.ts tests/head-accessories.test.ts && node --test tests/rendered-html.test.mjs`

Expected: PASS.

### Task 4: 只读礼物 UI、视觉回归与交付

**Files:**
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/globals.css`
- Modify: `README.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `design-qa.md`

- [x] **Step 1: Replace manual controls**

右侧礼物卡改为“雨中稀有掉落 6%/秒”“烟花稀有掉落 18%/次”“每次展示 1 秒”的只读说明；活动礼物出现时显示短促礼物到场提示，不改变主舞台布局。

- [x] **Step 2: Run complete verification**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit`

Expected: All tests, production builds, lint and typecheck pass.

- [x] **Step 3: Browser QA**

在 `?debug=1&replay=1` 强制逐一展示墨镜、礼帽和星轨；确认每件仅持续 1 秒、头部遮挡正确、120 粒子同屏仍 ≥50 FPS、控制台无错误。普通首页确认无默认礼物、无礼物点选控件。

- [x] **Step 4: Update deliverables**

保存桌面和运行态截图、更新验收记录与源码 ZIP；保持本地预览运行，不提交、不推送、不部署。
