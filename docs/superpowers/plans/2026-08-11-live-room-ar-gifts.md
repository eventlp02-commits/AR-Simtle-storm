# Live Room AR Gifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Smile Storm 重构为参考图风格的真实桌面直播页面，并在现有 Three.js 粒子渲染器中加入可切换的低面数墨镜、礼帽和行星环头部资产。

**Architecture:** 保留单个动态加载的 Three.js `WebGLRenderer`，在 `ParticleRenderer` 场景中增加一个由头部碰撞体驱动的附件层；不创建第二个 WebGL 上下文。页面改为固定的直播间框架，中央舞台继续承载摄像头、表情识别、雨滴与烟花，右侧礼物面板控制附件状态；无摄像头回放用于自动视觉与性能验收。

**Tech Stack:** React 19、TypeScript、Three.js r185、MediaPipe Tasks Vision、Phosphor Icons、Vitest、Node test、Vinext/Vite。

---

### Task 1: 固化直播页面与交互契约

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: 写失败测试**

断言 SSR 页面包含“直播数据”“直播信息”“AR 礼物”“开启直播”，组件包含 `Gift`、`Sunglasses`、`Planet`、`TopHat` 图标与三个 `aria-pressed` 装扮按钮，CSS 包含中央舞台、左右侧栏和底部工具条布局。

- [x] **Step 2: 运行失败测试**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL，现有首页仍为暗色产品落地页，没有直播间结构和 AR 礼物控制。

- [x] **Step 3: 安装图标库**

Run: `pnpm add @phosphor-icons/react`

Expected: `package.json` 与 `pnpm-lock.yaml` 记录可复现依赖；不使用 emoji、手绘 SVG 或 CSS 图标。

### Task 2: 建立头部附件锚定与低模预算

**Files:**
- Create: `app/lib/head-accessories.ts`
- Create: `tests/head-accessories.test.ts`

- [x] **Step 1: 写失败测试**

测试 `headAccessoryTransform(collider)` 返回稳定的中心、宽高和滚转角；空碰撞体返回 `null`。创建附件 rig 后，墨镜、礼帽、行星环三个组存在，总三角面数量不超过 1800，并且所有圆形段数不超过 32。

- [x] **Step 2: 运行失败测试**

Run: `pnpm vitest --config vitest.config.ts run tests/head-accessories.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 最小实现**

使用 `CircleGeometry`、`TorusGeometry`、`BoxGeometry`、`CylinderGeometry`、`SphereGeometry` 组合资产；共享材质并设置 `depthTest: false`。行星环拆为前后两个半环，通过透明度和渲染顺序形成绕头效果。

- [x] **Step 4: 运行测试**

Run: `pnpm vitest --config vitest.config.ts run tests/head-accessories.test.ts`

Expected: PASS。

### Task 3: 将附件层合并进现有粒子渲染器

**Files:**
- Modify: `app/lib/particle-renderer.ts`
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [x] **Step 1: 写失败测试**

断言 `ParticleRenderer` 创建一次 `createHeadAccessoryRig()`，`render()` 接收 `accessories` 与 `elapsedSeconds`，销毁时释放附件几何体/材质；组件向现有 `renderer.render()` 传递装扮状态，源码中仍只有一个 `new THREE.WebGLRenderer`。

- [x] **Step 2: 运行失败测试**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL，当前渲染器没有头部附件层。

- [x] **Step 3: 最小实现**

每帧从插值后的 16 点碰撞体计算附件位置；墨镜放在人脸上半部，礼帽位于头顶，行星环围绕脸部慢速旋转。LOW 档隐藏礼帽细节并降低行星数量，减少动态效果时停止公转但保留静态附件。

- [x] **Step 4: 运行相关测试**

Run: `pnpm vitest --config vitest.config.ts run tests/head-accessories.test.ts && node --test tests/rendered-html.test.mjs`

Expected: PASS。

### Task 4: 参考图重构真实直播页面

**Files:**
- Modify: `app/components/SmileStormExperience.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

- [x] **Step 1: 写失败测试**

断言直播框架在 idle 与 ready 阶段保持同一页面结构；中央 `.live-video-frame` 持有 `viewportRef`；开始/结束、声音、点赞、礼物装扮按钮都有可访问名称和状态；移动端侧栏降为横向信息卡且无横向溢出。

- [x] **Step 2: 运行失败测试**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL，当前 idle/live 使用两套完全不同的页面。

- [x] **Step 3: 最小实现**

实现顶部导航、左侧标题/数据/公告、中央视频舞台、右侧直播信息/AR 礼物、底部操作栏。参考图使用暖白背景、蓝色主色、28px 圆角、浅阴影和半透明面板；摄像头开启前中央使用现有风暴球预览，开启后原位切换为视频和特效。

- [x] **Step 4: 运行测试**

Run: `node --test tests/rendered-html.test.mjs`

Expected: PASS。

### Task 5: 本地回放、性能与设计 QA

**Files:**
- Create: `design-qa.md`
- Modify: `README.md`
- Modify: `docs/PERFORMANCE.md`

- [x] **Step 1: 完整自动验证**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit`

Expected: 全部测试和两套生产构建通过。

- [x] **Step 2: 浏览器行为验收**

在 `http://localhost:3000/?debug=1&replay=1` 验证开启直播、三个装扮切换、声音、测试烟花与结束体验；控制台无错误。

- [x] **Step 3: 同视口设计对比**

在 1680×941 打开参考图和实现截图，检查顶部导航高度、三栏比例、中央舞台、圆角、阴影、底部工具条和文字密度。修复所有 P0/P1/P2，直至 `design-qa.md` 写明 `final result: passed`。

- [x] **Step 4: 性能验收**

回放期间记录 Render FPS、Effect P95 与粒子数；确认附件层没有创建额外 WebGLRenderer，HIGH 档目标 ≥50 FPS，LOW 档附件降级生效。

- [x] **Step 5: 本地交付**

保持本地预览开启，更新文档并输出新截图与源码包；不提交、不推送、不部署。
