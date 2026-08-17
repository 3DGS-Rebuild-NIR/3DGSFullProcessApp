# IR 强化 3DGS 全链路重建系统 — 前端

## 项目概述

基于 IR（红外）强化的 3D Gaussian Splatting 全链路重建系统的前端界面，包含：

| 子系统 | 功能 |
|---|---|
| **拍摄系统** | 电机控制（步进/直流）、摄像头预览（RGB/IR）、轨迹录制回放、轨道可视化 |
| **预处理系统** | 视频切帧（支持上下融合/独立视频两种输入）、COLMAP 特征提取/匹配/稀疏重建 |
| **主重建系统** | brush.exe 3DGS 训练配置与启停、训练日志实时解析、PLY 模型预览（Babylon.js）、视角浏览 |
| **评估验证系统** | 3DGSVerify 离线量化评估前端化：GT vs 渲染图逐张对比，PSNR/SSIM/MS-SSIM/RMSE/MAE，页面报告 + summary.json/per_image.csv/summary.txt |


## 开发指引

1. **新增功能** — 按功能组放到对应 `scripts/` 子目录，在 `index.html` 按依赖顺序插入 `<script>`
2. **新增 CEF 接口** — 先在 `code.md` 确认后端实现，再在对应的封装文件（`cef/preproc.js` / `cef/recon.js` / `motor/api.js`等）中添加方法
3. **禁止使用模拟数据回退** — 所有 CEF 调用无后端时直接报错
4. **文件大小** — 单个 JS 文件建议 100–250 行，超过则拆分
5. **命名** — 全局对象 PascalCase（`PreprocCEF`），内部变量/函数下划线前缀（`_captureState`）
6. **事件监听** — 优先使用 `document.addEventListener` 事件委托，避免直接绑定在 DOM 元素上
7. **异步** — CEF 调用统一返回 Promise，使用 `async/await` 或 `.then()`

## 相关文档

- [code.md](code.md) — 代码规范以及CEF API 协议规范（**必读**，后端接口以此为准）- 
- [design.md](design.md) — 前端设计与实现规范，修改html时必看
- [colmap.md](colmap.md) — COLMAP Viewer 使用说明