# Expression Guide And Wide Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加顺序式微笑/大笑引导与持续特效图标，并删除左栏，把摄像头舞台扩展为近 16:9。

**Architecture:** 用纯 TypeScript `ExpressionGuideController` 隔离一次直播会话内的引导状态，React 只渲染控制器导出的展示模型。两张 ImageGen 透明 WebP 作为真实 UI 资产，布局只调整现有直播网格，不改粒子、识别或音频架构。

**Tech Stack:** React 19、TypeScript、CSS、ImageGen、Vitest、Vinext/Vite。

---

### Task 1: 表情引导状态机

**Files:**
- Create: `app/lib/expression-guide.ts`
- Create: `tests/expression-guide.test.ts`

- [ ] 写失败测试：初始 `SMILE_PROMPT`；大笑不能跳过微笑；微笑推进到 `LAUGH_PROMPT`；大笑推进到 `COMPLETE`；reset 回到初始状态；完成后展示模型按实时特效返回微笑/大笑图标。
- [ ] 运行 `pnpm exec vitest run tests/expression-guide.test.ts`，确认因模块缺失失败。
- [ ] 实现最小控制器和纯函数展示模型。
- [ ] 重跑测试并确认通过。

### Task 2: 两张轻量透明表情资产

**Files:**
- Create: `app/assets/expression-smile-key.png`
- Create: `app/assets/expression-laugh-key.png`
- Create: `app/assets/expression-smile.webp`
- Create: `app/assets/expression-laugh.webp`

- [ ] 分别调用 ImageGen，以用户图 1/2 为表情参考、现有 UI 为风格约束，生成纯绿色键控背景的微笑和大笑图标。
- [ ] 用 `remove_chroma_key.py` 去背景，验证 alpha 角点和主体覆盖。
- [ ] 自动裁切留白，缩放到 384px 方形内并导出 WebP；单张目标小于 80KB。
- [ ] 用 `view_image` 检查透明边缘、表情差异与风格一致性。

### Task 3: 组件集成

**Files:**
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [ ] 先扩展静态测试，要求两张资产导入、两段准确文案、控制器 reset/advance、无 `live-room-left`。
- [ ] 运行测试确认 RED。
- [ ] 每次 start/reset 初始化控制器；有效表情变化时推进；ready 阶段渲染顶部图标和中央引导文案。
- [ ] 移除左侧 aside，保留右栏和完整工具栏。
- [ ] 重跑测试确认 GREEN。

### Task 4: 16:9 布局与轻量动效

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

- [ ] 先写 CSS 断言：主网格两列、舞台 `aspect-ratio: 16 / 9`、图标与文案样式、60% 白色、减少动态效果禁用动画。
- [ ] 运行静态测试确认 RED。
- [ ] 实现桌面两列布局、宽屏舞台、图标弹入/呼吸、文案浮动/淡出，以及 1080/760 响应式降级。
- [ ] 重跑测试确认 GREEN。

### Task 5: 构建与视觉验收

**Files:**
- Modify: `design-qa.md`
- Modify: `docs/PERFORMANCE.md`

- [ ] 运行完整 `pnpm test && pnpm lint && pnpm exec tsc --noEmit`。
- [ ] 重新构建并重启本地 LaunchAgent 服务。
- [ ] 用 `?debug=1&replay=1` 验证微笑→大笑→完成的文案序列和持续图标状态，检查 console 无错误。
- [ ] 用与图 3 相近桌面视口截图，确认左栏消失、摄像头近 16:9、右栏完整。
- [ ] 更新 `design-qa.md` 为通过并保存用户交付截图。
