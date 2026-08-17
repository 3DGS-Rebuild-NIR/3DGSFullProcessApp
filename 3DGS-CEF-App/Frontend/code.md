# Code Structure & Conventions

## 目录结构

```
Frontend/
├── index.html                      # 主页面
├── scripts/
│   ├── shared/                     # 全局工具（无 CEF 依赖）
│   │   ├── dom.js                  # $id, $val, $txt, $, $$, toast, _clamp, _setTxt 等
│   │   ├── log.js                  # log() — 预处理日志输出
│   │   └── status.js              # setStatus(), setProgressLabel()
│   ├── cef/                        # CEF 通信层
│   │   ├── shared.js              # sendRequest() — 统一 CEF 调用封装
│   │   ├── base.js                # CEF 基础功能: cmdRun, getExeDir, msgBox
│   │   ├── dialog.js              # DialogCEF — 系统原生对话框 (openFile / saveFile / pickDir)
│   │   ├── file.js                # FileCEF — 文件/文件夹操作 (read / write / delete / mkdir / exists / stat / list)
│   │   ├── preproc.js             # PreprocCEF — 3DGS 预处理 API (前缀 preproc)
│   │   └── recon.js               # ReconCEF — 3DGS 训练 API (前缀 recon)
│   ├── motor/                      # 电机控制
│   │   ├── api.js                 # MotorCEF — moter 子方法 + CEF 回调注册
│   │   ├── connect.js             # 连接弹窗、扫描串口、连接/断开
│   │   └── control.js             # toggleMove, syncMotor, stopBoth, stopAxis
│   ├── capture/                    # 拍摄系统
│   │   ├── state.js               # _captureState, 轨迹持久化
│   │   ├── devices.js             # 设备 toggle, UI 状态
│   │   ├── camera.js              # 摄像头预览启停、截图
│   │   ├── motion.js              # 运动 UI、轨道 SVG、滑块、键盘、动画循环
│   │   ├── recording.js           # 录制启停
│   │   ├── trajectory.js          # 轨迹 CRUD
│   │   ├── playback.js            # 回放播放
│   │   └── init.js                # initCapture()
│   ├── preproc/                    # 预处理系统
│   │   ├── core.js                # 状态变量、步骤管理、文件选择、视频信息
│   │   ├── pipeline.js            # 分割/抽帧、COLMAP、全流程
│   │   └── ui.js                  # COLMAP Viewer、图片画廊、结果面板
│   ├── brush/                      # brush.exe 相关
│   │   ├── args.js                # buildBrushArgs() — 构造训练参数
│   │   └── parse.js               # parseReconOutput() — 解析 brush 日志输出
│   ├── recon/                      # 主重建系统
│   │   ├── core.js                # Recon 状态、init、GPU、滑块、训练控制、进度
│   │   ├── log.js                 # RecLog, update3DGSOutput CEF 回调
│   │   ├── config.js              # 配置存储/加载
│   │   ├── viewpoints.js          # 视角列表扫描与渲染
│   │   └── ply-viewer.js          # PLY 预览（Babylon.js）、拖入、截图、自启动
│   ├── evaluate/                   # 评估验证系统（3DGSVerify 离线评估功能前端化）
│   │   ├── metrics.js             # EvalMetrics — PSNR/SSIM/MS-SSIM/RMSE/MAE 纯 JS 引擎（与 evaluate.py 公式一致）
│   │   ├── io.js                  # EvalIO — 图片加载(/raw/协议)、目录配对、演示数据生成
│   │   ├── report.js              # EvalReport — 评估报告渲染（汇总表/排名/逐图明细/导出）
│   │   └── core.js                # Evaluate — 状态机、评估流程、进度 UI、结果写出
│   ├── components/
│   │   ├── dialog.js              # 通用对话框（前端 UI 对话框，非系统对话框）
│   │   └── settings.js            # 设置窗口（基础/调试/关于）
│   └── main.js                    # Tab 导航 + 系统监控 + 初始化
├── evaluate/                       # 3DGSVerify 参考实现（离线评估工具，未部署）
│   └── python/
│       ├── evaluate.py            # 原始 Python 评估工具（PSNR/SSIM/MS-SSIM/RMSE/MAE/LPIPS）
│       ├── requirements.txt
│       └── test_evaluate.py
├── styles/                         # 样式文件
│   ├── app.css                    # 全局样式、布局、状态栏
│   ├── pages/
│   │   ├── preproc.css
│   │   ├── capture.css
│   │   └── recon.css
│   └── components/                # 组件样式（dialog.css, toast.css, settings.css）
├── viewer/                         # COLMAP 3D Viewer（ES Module，经 app:// 协议加载）
│   ├── mount.js                    # 入口：导出 mountColmapViewer 等
│   └── component.js                # Three.js 点云渲染实现
└── code.md                         # 本文件
```

## 加载顺序 (index.html)

```html
<!-- 1. 全局工具 — 无 CEF 依赖 -->
shared/dom.js
shared/log.js
shared/status.js

<!-- 2. CEF 通信层 -->
cef/shared.js     (sendRequest)
cef/base.js       (CEF.cmdRun / getExeDir / msgBox)
cef/dialog.js     (DialogCEF.openFile / saveFile / pickDir)
cef/file.js       (FileCEF.read / write / delete / mkdir / exists / stat / list)
cef/preproc.js    (PreprocCEF)
cef/recon.js      (ReconCEF)

<!-- 3. 电机控制 -->
motor/api.js      (MotorCEF + 回调)
motor/connect.js
motor/control.js

<!-- 4. 拍摄系统 — 依赖 tools + motor -->
capture/state.js → devices.js → camera.js → motion.js → recording.js → trajectory.js → playback.js → init.js

<!-- 5. 预处理系统 — 依赖 cef + shared -->
preproc/core.js → pipeline.js → ui.js

<!-- 6. brush 工具 — 依赖 recon/core -->
brush/args.js
brush/parse.js

<!-- 7. 主重建系统 — 依赖 cef + brush + shared -->
recon/core.js → log.js → config.js → viewpoints.js → ply-viewer.js

<!-- 8. 评估验证系统 — 依赖 shared + cef -->
evaluate/metrics.js → io.js → report.js → core.js

<!-- 9. 其他 -->
components/dialog.js
main.js             (最后加载，负责 Tab 切换 + 系统监控)
```

**注意：** 加载顺序严格按上述依赖排列。全局函数（`$id`, `$txt`, `toast`, `log`, `setStatus` 等）必须最先加载。

## CEF 调用规范

前端由宿主经自定义协议 **`app://localhost`** 托管

所有 CEF 调用通过 `sendRequest(req)` 发出，请求格式为 `"prefix method param1 param2 ..."`。

### 完整接口表

| 功能分组 | 前缀 | 方法示例 | 定义位置 |
|---|---|---|---|
| 基础功能 | `cmdRun` | `cmdRun <base64>` | `cef/base.js` — `CEF.cmdRun()` |
| 基础功能 | `getExeDir` | `getExeDir` | `cef/base.js` — `CEF.getExeDir()` |
| 基础功能 | `msgBox` | `msgBox <b64> <b64> <num>` | `cef/base.js` — `CEF.msgBox()` |
| 基础功能 | `devTools` | `devTools` | `settings.js` — `settingsOpenDevTools()` |
| 基础功能 | `chromeSettings` | `chromeSettings` | `settings.js` — `settingsOpenChromeSettings()` |
| 系统对话框 | `dialog` | `dialog openFile <title_b64> <filters_b64>` | `cef/dialog.js` — `DialogCEF` |
|  | `dialog` | `dialog saveFile <default_b64> <title_b64> <filters_b64>` |  |
|  | `dialog` | `dialog pickDir <title_b64>` |  |
| 文件管理 | `file` | `file read <path_b64>` | `cef/file.js` — `FileCEF` |
|  | `file` | `file write <path_b64> <content_b64>` |  |
|  | `file` | `file delete <path_b64>` |  |
|  | `file` | `file mkdir <path_b64>` |  |
|  | `file` | `file exists <path_b64>` |  |
|  | `file` | `file stat <path_b64>` |  |
|  | `file` | `file list <dir_path_b64>` |  |
| 3DGS 预处理 | `preproc` | `preproc getVideoInfo <videoPath_b64>` | `cef/preproc.js` — `PreprocCEF` |
|  | `preproc` | `preproc splitVideo <videoPath_b64> <outputDir_b64> <height>` |  |
|  | `preproc` | `preproc extractFrames <videoPath_b64> <outputDir_b64> <fps>` |  |
|  | `preproc` | `preproc colmapFeatureExtractor <imageDir_b64> <databasePath_b64>` |  |
|  | `preproc` | `preproc colmapExhaustiveMatcher <databasePath_b64>` |  |
|  | `preproc` | `preproc colmapMapper <imageDir_b64> <databasePath_b64> <outputPath_b64>` |  |
| 3DGS 训练 | `recon` | `recon <args_b64>` | `cef/recon.js` — `ReconCEF` |
|  | `recon` | `recon kill`（待实现，暂用 cmdRun taskkill） |  |
| 电机控制 | `moter` | `moter connect <port_b64> [baud]` | `motor/api.js` — `MotorCEF` |
|  | `moter` | `moter disconnect` |  |
|  | `moter` | `moter scanPorts` |  |
|  | `moter` | `moter setStepperRPM <rpm>` |  |
|  | `moter` | `moter setStepperDirection <0\|1>` |  |
|  | `moter` | `moter startStepper` |  |
|  | `moter` | `moter stopStepper` |  |
|  | `moter` | `moter setDCSpeed <pwm>` |  |
|  | `moter` | `moter setDCDirection <0\|1>` |  |
|  | `moter` | `moter startDC` |  |
|  | `moter` | `moter stopDC` |  |
|  | `moter` | `moter startAutoTest <rpm>` |  |
|  | `moter` | `moter stopAutoTest` |  |
|  | `moter` | `moter startBoth` |  |
|  | `moter` | `moter stopBoth` |  |
|  | `moter` | `moter isConnected` |  |
|  | `moter` | `moter isStepperRunning` |  |
|  | `moter` | `moter isDCRunning` |  |
|  | `moter` | `moter isAutoTestRunning` |  |
|  | `moter` | `moter getLastTravelTime` |  |
|  | `moter` | `moter sendCommand <cmd_b64>` |  |
|  | `moter` | `moter getStatus` |  |
| 系统监控 | `getSystemPerformance` | `getSystemPerformance` | `main.js` — 直接 `sendRequest` |

### 字符串参数编码

- **字符串参数** → `btoa()` 编码后传递
- **数值参数** → 直接传数字，不编码

### 错误处理

- `sendRequest` 没有 CEF 环境时 **直接 reject**，无 `simulated` 回退
- 业务层自行 `.catch()` 处理错误
- 默认 5 秒超时 reject。系统对话框及耗时操作可传递超时 `0` 禁用超时

### CEF 回调（后端→前端）

| 全局函数 | 来源 | 用途 |
|---|---|---|
| `window.update3DGSOutput(encodedMsg)` | `recon/log.js` | brush.exe 训练日志输出（实时） |
| `window.updatePreprocOutput(encodedMsg)` | `preproc/core.js` 或 `pipeline.js` | 预处理各步骤实时输出 |
| `window.updateMotorStatus(encodedStatus)` | `motor/api.js` | 电机状态更新通知 |
| `window.updateMotorLimit(type, encodedInfo)` | `motor/api.js` | 电机限位触发通知 |

> **注意**：`updatePreprocOutput` 由 `PreprocessorHandler.cpp` 中的 `UpdateUIOutput` 回调触发，前端需在 `cef/preproc.js` 或 `preproc/core.js` 中注册 `window.updatePreprocOutput` 函数。

## 全局命名空间

### 工具函数（`shared/dom.js`）

```
$id(s)      → document.getElementById(s)
$val(id)    → input 值（带缺省）
$num(id,d)  → parseFloat 值
$txt(id,v)  → 设置 textContent
$show(id,on)→ display 切换
$(s)        → querySelector
$$(s)       → querySelectorAll 数组
_clamp(v,a,b)
_pad2(n)
_fmtHMS(ms)
_parseDur(s)
_setTxt(id, v)  → 带 try-catch 的 textContent 设置
toast(msg, color)
```

### 日志（`shared/log.js`）

日志只能通过`[System]`中括号中的字符判断类型

### 状态（`shared/status.js`）

```
setStatus(text, state)    → state: 'processing' | 'error' | 留空
setProgressLabel(text)    → 处理进度文本，如「正在执行特征提取 ...」
```

### CEF 封装模块

- **`CEF`** — 基础命令：`cmdRun(cmd)`, `getExeDir()`, `msgBox(msg, title, type)`

- **DevTools 调试** — 打开/关闭 Chromium 开发者工具：
  ```js
  sendRequest('devTools')          // → Promise<'Success'>
  ```
  无参调用，成功返回 `'Success'`。可在设置窗口「调试设置」中使用（`settingsOpenDevTools()`）。

- **Chrome 设置** — 打开 Chrome 内置设置页（`chrome://settings`）：
  ```js
  sendRequest('chromeSettings')    // → Promise<'Success'>
  ```
  无参调用，成功返回 `'Success'`。可在设置窗口「调试设置」中使用（`settingsOpenChromeSettings()`）。

- **`DialogCEF`** — 系统原生对话框：
  ```js
  DialogCEF.openFile({ title?, filters? })          // → Promise<string|null>
  DialogCEF.saveFile({ defaultName?, title?, filters? }) // → Promise<string|null>
  DialogCEF.pickDir({ title? })                     // → Promise<string|null>
  ```

- **`FileCEF`** — 文件/文件夹操作（所有路径及内容自动 Base64 编解码）：
  ```js
  FileCEF.read(path)             // → Promise<string> (文件内容，可能需自行 atob)
  FileCEF.write(path, content)   // → Promise<'success'>
  FileCEF.delete(path)           // → Promise<'success'>
  FileCEF.mkdir(path)            // → Promise<'success'>
  FileCEF.exists(path)           // → Promise<boolean>
  FileCEF.stat(path)             // → Promise<{exists, is_file, is_directory, size, last_modified}>
  FileCEF.list(dirPath)          // → Promise<Array<{name, is_file, size}>>
  ```

- **`PreprocCEF`** — 3DGS 预处理全接口（参数路径和返回内容均按协议 Base64 编码）：
  ```js
  // 获取视频信息（返回 {duration, width, height, fps}）
  PreprocCEF.getVideoInfo(videoPath)              // → Promise<Object>
  
  // 分割视频（上下融合等，height 为单目目标高度）
  PreprocCEF.splitVideo(videoPath, outputDir, height)  // → Promise<'success'>
  
  // 抽帧（按指定 fps 从视频提取图像序列）
  PreprocCEF.extractFrames(videoPath, outputDir, fps)  // → Promise<'success'>
  
  // COLMAP 特征提取
  PreprocCEF.colmapFeatureExtractor(imageDir, databasePath) // → Promise<'success'>
  
  // COLMAP 特征匹配（穷举匹配）
  PreprocCEF.colmapExhaustiveMatcher(databasePath)   // → Promise<'success'>
  
   // COLMAP 稀疏重建（Mapper）
  PreprocCEF.colmapMapper(imageDir, databasePath, outputPath) // → Promise<'success'>
  
  // 打开资源管理器定位到目录（Explorer 打开，暂用 cmdRun 实现）
  PreprocCEF.openFolder(path)             // → Promise<string>
  ```
  每个方法内部都会将字符串参数 `_b64()` 编码后发送，执行过程中通过 `window.updatePreprocOutput` 回调推送实时日志。视频选择/目录选择请使用 `DialogCEF`，文件存在性检查/目录列举请使用 `FileCEF`。

- **`ReconCEF`** — 3DGS 训练控制：
  ```js
  ReconCEF.send(args)         // → Promise<'success'>   启动训练（args 为完整命令行参数字符串）
  ReconCEF.killBrush()        // → Promise<'success'>   终止训练（后端 `recon kill` 待实现，暂用 cmdRun taskkill）
  ReconCEF.pickDir()          // → Promise<string|null> 选择数据集目录（封装 DialogCEF.pickDir）
  ```
  训练过程中实时输出由后端通过 `window.update3DGSOutput` 推送，`brush/parse.js` 中的 `parseReconOutput` 负责解析日志。GPU 信息不再单独提供 API，改由 `getSystemPerformance` 返回的 JSON 中 `gpu` 数组读取（`main.js` 与 `recon/core.js#queryGPUInfo`）。
  
- **`MotorCEF`** — 电机驱动全接口（参数编码规则：字符串 Base64，数值直接传递）：
  ```js
  MotorCEF.scanPorts()                    // → Promise<Array<string>>
  MotorCEF.connect(port, baud)            // → Promise<string>
  MotorCEF.disconnect()                   // → Promise<string>
  MotorCEF.setStepperRPM(rpm)             // → Promise<string>
  MotorCEF.setStepperDirection(dir)       // → Promise<string>  // 0=CW, 1=CCW
  MotorCEF.startStepper()                 // → Promise<string>
  MotorCEF.stopStepper()                  // → Promise<string>
  MotorCEF.setDCSpeed(pwm)                // → Promise<string>  // 0-255
  MotorCEF.setDCDirection(dir)            // → Promise<string>  // 0=forward, 1=backward
  MotorCEF.startDC()                      // → Promise<string>
  MotorCEF.stopDC()                       // → Promise<string>
  MotorCEF.startBoth()                    // → Promise<string>
  MotorCEF.stopBoth()                     // → Promise<string>
  MotorCEF.isConnected()                  // → Promise<boolean>
  MotorCEF.isStepperRunning()             // → Promise<boolean>
  MotorCEF.isDCRunning()                  // → Promise<boolean>
  MotorCEF.isAutoTestRunning()            // → Promise<boolean>
  MotorCEF.getLastTravelTime()            // → Promise<number>
  MotorCEF.startAutoTest(rpm)             // → Promise<string>
  MotorCEF.stopAutoTest()                 // → Promise<string>
  MotorCEF.sendCommand(cmd)               // → Promise<string>
  MotorCEF.getStatus()                    // → Promise<string> (Base64 编码的状态文本)
  ```
  状态变化通过 `window.updateMotorStatus` 和 `window.updateMotorLimit` 回调通知。

### 命名约定

- **模块对象** — 大写首字母：`PreprocCEF`, `ReconCEF`, `MotorCEF`, `CEF`, `DialogCEF`, `FileCEF`, `Recon`
- **内部变量** — 下划线前缀：`_captureState`, `_motorConnected`, `_pipelineRunning`
- **内部函数** — 下划线前缀：`_clamp`, `_requireMotor`, `_b64`
- **事件监听** — 尽量用 `document.addEventListener` 委托，避免直接绑定在元素上
- **异步** — CEF 调用统一返回 Promise，建议用 `async/await` 或 `.then()`

## 样式规范

- CSS 变量（`var(--blue)`, `var(--red)`, `var(--panel)` 等）定义在 `styles/app.css`
- 拍摄系统样式 → `styles/pages/capture.css`
- 预处理样式 → `styles/pages/preproc.css`
- 重建系统样式 → `styles/pages/recon.css`
- 组件样式 → `styles/components/`

## 关键依赖（CDN）

- Babylon.js 6.x — PLY/SPLAT 模型渲染
- babylonjs.loaders.min.js — SPLATFileLoader
- Three.js (ES Module, viewer/) — COLMAP 稀疏点云 Viewer（需 `app://` 协议）

## 开发指引

1. **新增功能** — 按功能分组放到对应目录，在 `index.html` 按依赖顺序添加 `<script>` 标签
2. **CEF 调用** — 先在 `cef.md` 确认后端接口名，再在对应的 `scripts/cef/` 或 `scripts/motor/api.js` 中包装方法
3. **不要添加 `simulated` 回退** — 所有 CEF 调用无后端时直接报错
4. **文件大小** — 单个 JS 文件保持 100-250 行，超过则拆分
5. **引入新库** — 优先检查是否已有同类库；CDN 引用在 `index.html` `<head>` 中添加