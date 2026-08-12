# Design QA

- source visual truth path: `/var/folders/xw/6nryll4d6rs0c5pczw0tx0g9qhtq3t/T/codex-clipboard-bcbc309a-f091-413d-a2d7-4a551d5e7167.png`
- implementation screenshot path: `/Users/liangping/Documents/Codex/2026-08-10/pm-ar-1-live-demo-pc/work/site/artifacts/minimal-home.png`
- viewport: 1280 × 720 CSS px, devicePixelRatio 2
- source pixels: 2274 × 1298; implementation screenshot pixels: 1280 × 720
- normalization: compared full-viewport composition after proportional scaling; both targets are approximately 16:9
- state: idle homepage after the Three.js GLB finished loading

## Full-view comparison evidence

The idle implementation removes the reference's title, labels, legends, navigation, side rail and toolbar. The visible idle page contains only the centered weather core and one CTA. After the CTA is activated, the complete live-room navigation, AR stage, information rail and toolbar return.

## Required fidelity surfaces

- Fonts and typography: only the CTA label remains; its size, weight and contrast are legible and consistent with the existing blue primary action.
- Spacing and layout rhythm: the WebGL stage occupies 1280 × 720; the GLB is centered using its scaled world-space bounding-box center; the 154 × 52 CTA is horizontally centered below the sphere.
- Colors and visual tokens: the pale storm palette and blue CTA are retained from the source product.
- Image quality and asset fidelity: the original optimized cinematic GLB is retained; no placeholder or code-drawn substitute is introduced.
- Copy and content: the idle page exposes only “开始体验”, as requested.

Focused-region comparison was unnecessary because all non-asset content is a single 154 × 52 button and its dimensions were measured directly.

## Interaction and runtime evidence

- Primary CTA click tested in deterministic replay mode.
- After click, the complete live-room navigation, AR stage, information rail, toolbar, expression state and debug controls rendered.
- DOM inspection found exactly one idle button and one WebGL canvas.
- No browser console error was observed during idle load or replay transition.

## Findings

No actionable P0, P1 or P2 differences remain. The reference's larger editorial copy was intentionally removed by explicit user direction.

## Comparison history

- Initial implementation: live-room chrome competed with the idle model, then an incorrect fix removed it from the active experience too. The GLB also applied unscaled center compensation after setting scale, leaving the visible asset vertically offset.
- Fix: isolate the minimal shell to `idle`, restore all live-room regions after activation, and compensate the GLB position with its scaled bounding-box center.
- Post-fix evidence: `artifacts/minimal-home.png`; idle has exactly one button and no live chrome, while deterministic replay confirms navigation, toolbar and information rail are present.

final result: passed
