# Smile Storm Three-Stage Product Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把现有表情 AR 原型连续打磨为视觉层级稳定、五束烟花具有真实节奏、头部互动清晰且能在低配机器平稳退化的本地可验收成品。

**Architecture:** 保留 MediaPipe Worker、单一主渲染循环和 Three.js 实例化粒子主线。新增纯函数式烟花时间轴、头部碰撞体插值、运行时偏好/预算层与调试回放层；首页 3D 与 AR 渲染分别按可见性、低帧率与减少动态效果策略退化。所有可见变化都先由测试锁定，再通过本地浏览器截图和运行数据验收。

**Tech Stack:** React 19、TypeScript、Three.js r185、MediaPipe Tasks Vision、Vitest、Node test、Vinext/Vite。

---

### Task 1: 固化阶段一视觉与预算契约

**Files:**
- Modify: `tests/quality-controller.test.ts`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/weather-core.test.mjs`
- Modify: `app/lib/quality-controller.ts`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/components/WeatherCoreHero.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: 写失败测试**

将质量档预算断言为 `HIGH 120 / MEDIUM 90 / LOW 60`，断言首页标题由两个不可拆分行组成、非 `debug=1` 时不渲染运行数据开关，并断言 Weather Core 使用 `IntersectionObserver`、`visibilitychange`、30 FPS 空闲节流和 `prefers-reduced-motion`。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/quality-controller.test.ts && node --test tests/rendered-html.test.mjs tests/weather-core.test.mjs`

Expected: FAIL，现有烟花预算仍为 300/225/150，首页标题无固定行，Weather Core 持续 60 FPS。

- [x] **Step 3: 最小实现**

把预算改为：

```ts
const budgets = {
  HIGH: { rain: 180, fireworks: 120, resolutionScale: 1 },
  MEDIUM: { rain: 135, fireworks: 90, resolutionScale: 0.9 },
  LOW: { rain: 90, fireworks: 60, resolutionScale: 0.78 },
} as const;
```

首页标题改为两个 `.hero-title-line`，生产 UI 仅在 `debugEnabled` 时显示调试入口；减少直播态面板的模糊层。Weather Core 离屏或页面隐藏时暂停，静止时 30 FPS，交互后短时 60 FPS，减少动态效果时 12 FPS。

- [x] **Step 4: 运行测试并检查首页截图**

Run: `pnpm vitest --config vitest.config.ts run tests/quality-controller.test.ts && node --test tests/rendered-html.test.mjs tests/weather-core.test.mjs`

Expected: PASS；1440×810 首页无孤行与浏览器滚动条。

### Task 2: 建立烟花时间轴与火箭阶段

**Files:**
- Modify: `tests/particle-system.test.ts`
- Modify: `app/lib/particle-system.ts`
- Modify: `app/lib/particle-renderer.ts`

- [x] **Step 1: 写失败测试**

新增断言：触发瞬间先有 1 枚上升火箭；五枚火箭按约 140ms 间隔出现；每枚到达目标后才生成对应球形爆炸；任意时刻火花数不超过质量预算；清理烟花同时清空待执行事件。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/particle-system.test.ts`

Expected: FAIL，现有实现一次性生成全部火花且没有火箭种类。

- [x] **Step 3: 最小实现**

将 `ParticleKind` 扩为 `0 | 1 | 2`，其中 `2` 为火箭；加入：

```ts
interface PendingFireworkEvent {
  at: number;
  type: "rocket" | "burst";
  center: { x: number; y: number };
  count: number;
  paletteIndex: number;
  phase: number;
}
```

`spawnFireworks()` 只创建时间轴，`update()` 推进时钟并依次发射五枚火箭和爆炸。火箭从画面底部外侧出发，速度由起终点和飞行时长确定；爆炸角度等分并叠加小幅抖动，保留重力、阻力和寿命。

- [x] **Step 4: 运行粒子测试**

Run: `pnpm vitest --config vitest.config.ts run tests/particle-system.test.ts`

Expected: PASS。

### Task 3: 让 20 FPS 头部跟踪在 60 FPS 物理中平滑运动

**Files:**
- Modify: `tests/physics.test.ts`
- Modify: `app/lib/physics.ts`
- Modify: `app/components/SmileStormExperience.tsx`

- [x] **Step 1: 写失败测试**

新增 `interpolateHeadCollider(current, target, alpha)` 测试：点位、中心与速度线性插值；点数不一致时安全回退；输入为空时返回另一侧；结果保持顺时针绕序。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/physics.test.ts`

Expected: FAIL，函数不存在。

- [x] **Step 3: 最小实现**

在视觉结果到达时只更新 `targetColliderRef`；主渲染循环用帧率无关系数 `1 - exp(-18 * dt)` 更新 `renderColliderRef`，碰撞和渲染均使用插值后的碰撞体。

- [x] **Step 4: 运行物理测试**

Run: `pnpm vitest --config vitest.config.ts run tests/physics.test.ts`

Expected: PASS。

### Task 4: 增加前后景遮挡与碰撞闪光

**Files:**
- Modify: `tests/particle-system.test.ts`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/lib/particle-system.ts`
- Modify: `app/lib/particle-renderer.ts`
- Modify: `app/components/SmileStormExperience.tsx`

- [x] **Step 1: 写失败测试**

断言火花具有稳定的 `depthLayer`；渲染器存在前景与后景两个实例化批次；后景材质的片元着色器根据头部椭圆裁切；LOW 或减少动态效果模式禁用后景裁切与额外碰撞光晕。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/particle-system.test.ts && node --test tests/rendered-html.test.mjs`

Expected: FAIL，当前所有火花都位于人脸前方。

- [x] **Step 3: 最小实现**

把渲染数据步长扩为 12；将火花稳定分配到前后景。后景批次通过一个轻量 shader `discard` 裁切头部椭圆区域，不使用全屏后处理；碰撞 `impact` 在已有实例中放大、增白和缩短拖尾，LOW 档取消额外 halo 实例。

- [x] **Step 4: 运行相关测试**

Run: `pnpm vitest --config vitest.config.ts run tests/particle-system.test.ts && node --test tests/rendered-html.test.mjs`

Expected: PASS。

### Task 5: 统一音效包络并增加静音控制

**Files:**
- Modify: `tests/effect-audio.test.ts`
- Modify: `app/lib/effect-audio.ts`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: 写失败测试**

断言 `setMuted(true)` 让雨声与当前烟花淡出至零、静音期间新触发声音不播放、取消静音后雨声按当前状态恢复；烟花仍为每次触发只播一次。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/effect-audio.test.ts`

Expected: FAIL，控制器没有静音 API。

- [x] **Step 3: 最小实现**

为控制器加入 `setMuted()` 和 `isMuted()`，所有 fade 目标音量通过统一 `effectiveVolume()` 计算。直播右上角加入至少 44px 的“静音/开启声音”按钮，使用文字与 `aria-pressed`，不使用 emoji 或手绘图标。

- [x] **Step 4: 运行音效测试**

Run: `pnpm vitest --config vitest.config.ts run tests/effect-audio.test.ts`

Expected: PASS。

### Task 6: AR 懒加载、布局缓存与 WebGL 减少动态效果

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/components/WeatherCoreHero.tsx`

- [x] **Step 1: 写失败测试**

断言 `ParticleRenderer` 通过动态 `import()` 在点击开始后加载；主循环不再每帧调用 `getBoundingClientRect()`；存在 `ResizeObserver` 缓存舞台尺寸；两个 Three.js 渲染器都读取 `prefers-reduced-motion`。

- [x] **Step 2: 运行失败测试**

Run: `node --test tests/rendered-html.test.mjs tests/weather-core.test.mjs`

Expected: FAIL，当前粒子渲染器静态导入且每帧测量布局。

- [x] **Step 3: 最小实现**

把 `ParticleRenderer` 改为 `import type`，在 `startExperience()` 中 `await import('../lib/particle-renderer')`；用 `ResizeObserver` 更新 `{width,height}` ref。减少动态效果时雨滴生成率减半、烟花预算上限 36、禁用 halo/后景遮挡，首页 3D 降到 12 FPS。

- [x] **Step 4: 运行静态和单元测试**

Run: `pnpm test:unit && node --test tests/rendered-html.test.mjs tests/weather-core.test.mjs`

Expected: PASS。

### Task 7: 可重复表情回放与性能验收入口

**Files:**
- Create: `app/lib/expression-replay.ts`
- Create: `tests/expression-replay.test.ts`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `docs/PERFORMANCE.md`

- [x] **Step 1: 写失败测试**

使用中性→微笑→大笑→中性固定序列，断言回放状态依次包含 `SMILE` 和 `LAUGH_LATCHED`，且只触发一次烟花；再次执行得到相同输出。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/expression-replay.test.ts`

Expected: FAIL，回放模块不存在。

- [x] **Step 3: 最小实现**

新增纯函数：

```ts
export function replayExpressionSequence(
  machine: ExpressionMachine,
  frames: ReadonlyArray<{ atMs: number; input: BlendshapeInput }>,
) {
  return frames.map(({ atMs, input }) => machine.update(input, atMs));
}
```

`?debug=1&replay=1` 提供不调用摄像头的视觉回放入口，使用渐变占位背景并执行同一时间轴，供浏览器自动验收；文档写明该入口仅用于调试，真实验收仍需摄像头。

- [x] **Step 4: 运行回放测试**

Run: `pnpm vitest --config vitest.config.ts run tests/expression-replay.test.ts`

Expected: PASS。

### Task 8: GLB 可复现优化管线

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/inspect-weather-core.mjs`
- Modify: `README.md`

- [x] **Step 1: 写失败测试**

在 `tests/weather-core.test.mjs` 断言存在 `inspect:weather-core` 与 `optimize:weather-core` 脚本，且优化输出写到独立文件，不覆盖原素材。

- [x] **Step 2: 运行失败测试**

Run: `node --test tests/weather-core.test.mjs`

Expected: FAIL，脚本不存在。

- [x] **Step 3: 最小实现**

使用 `@gltf-transform/cli` 的 `inspect` 与 `optimize --compress meshopt` 生成 `app/assets/cinematic-storm-sphere.optimized.glb`。保留原文件作为可追溯源，只有在体积变小且浏览器视觉检查通过后才切换引用。

- [x] **Step 4: 验证素材和构建**

Run: `pnpm inspect:weather-core && pnpm optimize:weather-core && ls -lh app/assets/*.glb && pnpm build`

Expected: inspect 成功、优化文件小于源文件、构建成功。

### Task 9: 三阶段整体验收

**Files:**
- Modify: `docs/PERFORMANCE.md`
- Create: `../../audit-three-phase/02-after-home.png`
- Create: `../../audit-three-phase/03-after-replay.png`

- [x] **Step 1: 完整自动验证**

Run: `pnpm test && pnpm lint`

Expected: 所有 Vitest、Node、Vinext 与 Vite 验证通过，ESLint 0 error。

- [x] **Step 2: 浏览器视觉验收**

在 1440×810 检查首页与 `?debug=1&replay=1`；保存并重新打开两张截图。首页无孤行/滚动条，直播态主层级清晰，烟花从画面边缘外起飞、五束依次绽放且头部轮廓有前后景关系。

- [ ] **Step 3: 真人摄像头运行时验收（等待用户现场执行）**

用调试面板记录 60 秒：渲染 FPS 中位数 ≥50、推理 ≥20 FPS、触发 P95 ≤150ms；验证 LOW 档最多 60 枚物理烟花，减少动态效果最多 36 枚。

已完成无摄像头确定性回放、60 秒粒子负载模拟与预算回归；真人摄像头的推理 FPS 和表情触发延迟仍需用户在目标 PC Chrome 上现场测量，避免自动化过程捕获或保存真人画面。

- [x] **Step 4: 本地交付**

保持本地预览打开，更新 README 和性能文档，不提交、不推送、不部署，等待用户亲自验收。
