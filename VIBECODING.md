# Vibecoding 复盘（≤200 字）

最大性能陷阱是让人脸推理和逐粒子物理都占用主线程。纠偏后把 MediaPipe 移入 Worker，用固定对象池、单次 WebGL draw call 和 12 边解析碰撞替代逐粒子刚体，并加入自适应降级。核心 Prompt：「禁止逐粒子刚体和逐帧 React state；先锁定帧预算，再用 Worker、对象池和批量渲染重构。」
