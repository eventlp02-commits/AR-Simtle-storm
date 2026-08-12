# Expression Guide And Wide Camera Design QA

## 对比证据

- Source visual truth：`/var/folders/xw/6nryll4d6rs0c5pczw0tx0g9qhtq3t/T/codex-clipboard-f0494f25-f83f-4ecb-b4a6-4853e89296e0.png`，2932 × 1670 px；它定义了需删除的左栏、保留的右栏和顶部状态图标目标位置。
- Implementation screenshot：`/Users/liangping/Documents/Codex/2026-08-10/pm-ar-1-live-demo-pc/outputs/expression-wide-home.png`，1265 × 975 px；引导态截图为 `expression-guide-smile.png` 与 `expression-guide-laugh.png`。
- CSS viewport：1265 × 975，devicePixelRatio 1；源图和实现不是像素级复刻关系，因此按同一桌面信息架构、相对区域占比和交互状态比较，不做无依据的逐像素误差计算。
- State：未开播首页，以及 `?debug=1&replay=1` 的微笑提示、大笑提示、烟花完成态。
- Full-view comparison：源图红框三块左栏已完整移除；舞台扩展至左侧全部可用宽度，右侧直播信息、AR 礼物和贡献榜保持完整。
- Focused comparison：顶部状态胶囊图标槽、中央引导文案和 16:9 舞台单独测量；表情图标替换原状态圆点，没有与胶囊文字重叠。

## 必查界面维度

- Typography：保留既有直播页中文无衬线 UI 与展示衬线层级；中央提示使用白色 60% 透明度、54px 上限和轻浮动，信息清晰但不遮挡面部。
- Spacing / layout：桌面改为 `minmax(0, 1fr) 284px` 两列；实测舞台 957 × 538.3125，宽高比精确为 1.7778；左栏 DOM 数量为 0，右栏宽度与卡片节奏未破坏。
- Colors / tokens：沿用现有浅灰蓝直播后台与深色镜头舞台；黄橙表情为唯一高饱和提示点，符合视觉焦点层级。
- Image quality：ImageGen 资产为透明 384 × 384 WebP，微笑 12.14KB、大笑 11.77KB；边缘无绿色键控残留，形状、材质和色彩方向一致。
- Copy / content：精确显示“笑一个～”与“试试大笑～”；回放实测状态按微笑 → 大笑 → 完成推进，完成后文案消失，重新开启直播会重置。

## Comparison History

1. P1 — 舞台虽然声明 `aspect-ratio: 16 / 9`，但 `.live-stage { height: 100% }` 被父网格拉伸。浏览器实测 957 × 739，比例仅 1.295。修复为父网格 `auto 86px` 且舞台 `height: auto`，补充静态回归断言；复测 957 × 538.3125，比例 1.7778。
2. P2 — 删除左栏后旧 SSR 测试仍要求“直播数据”，与新产品要求冲突。更新为断言首页不再渲染该区域，同时保留右栏隐私说明；全量构建与 SSR 测试通过。
3. P2 — 微笑与大笑状态文字长度不同，使自适应胶囊宽度变化，图标切换实测横向位移 8.47px；同时呼吸缩放会让外接框抖动。修复为 310px 固定胶囊、48×48 固定图标槽和仅透明度呼吸；复测两个状态的 `x/y/width/height` 差值全部为 0。
4. P3 — 墨镜覆盖面部宽度仅 70%，在 1 秒稀有掉落中存在感不足。提升至 90%，把镜片改为圆润曲线并增加弧形鼻桥与双鼻托；继续共用单一 Three.js renderer，三角面预算保持不超过 1800。

## 交互与运行门禁

- 初始 100ms：微笑图标 + “笑一个～”。
- 750ms：大笑图标 + “试试大笑～”。
- 1450ms：大笑图标持续、文案消失、烟花暗场生效。
- 重新结束并开启：回到微笑首步。
- 浏览器 console：0 errors，0 warnings。
- 自动化：15 个 Vitest 文件、77 个测试；SSR、Worker、静态产物和 GitHub Pages 构建验证均通过。

## Remaining P3

- `<img>` 的 Next lint 性能建议保留为非阻塞 warning；两张图仅约 12KB，且需支持同一 Vinext/Vite 静态资产链，当前选择比引入额外图片运行时更稳妥。

final result: passed
