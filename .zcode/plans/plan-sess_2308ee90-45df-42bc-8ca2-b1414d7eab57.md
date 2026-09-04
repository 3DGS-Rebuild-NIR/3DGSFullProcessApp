# 修复 brush-headless 调用链（C++ + Rust + 前端）

## 诊断结论（已逐一核实）

**调用链**：`buildBrushArgs()` → base64 → `Handle3dgsQuery`(3dgsHandler.cpp) → `ExecuteProcess`(Utils.cpp) → brush-headless.exe → stdout JSON 事件 → `update3DGSOutput` → `parseReconOutput`(parse.js) → `handleBrushEvent`(events.js)。

### 致命问题（导致完全不可用）
1. **`[3DGS] ` 前缀杀死 JSON 事件链**（3dgsHandler.cpp:96）：子进程每行输出被加上 `[3DGS] ` 前缀后推给前端，而 parse.js 的 JSON 判断是 `msg.charAt(0)==='{'`——永远不成立。所有 `{"type":"step"/"eval"/"done"...}` 事件落入纯文本兜底逻辑，只往日志里倒原始 JSON：进度条、指标、完成回调全部失效，UI 永远卡在"训练中"。
2. **`--background-color #000000` 让 clap 直接退出**（args.js:88-89 + index.html:848）：`reconBgColor` 是 color input，值恒为 `#RRGGBB`，被原样传给需要 3 个 f32 的 `--background-color` → clap 解析失败 exit code 2，进程秒退。`bgColor.replace(/,/g,',')` 是个没写完的转换。
3. **`RUST_LOG_STYLE=always`**（3dgsHandler.cpp:93）：强制 env_logger 输出 ANSI 颜色转义码，日志行变成乱码，parse.js 的日志正则也匹配不上。

### 参数/协议问题（Rust 侧）
4. **`--ir-rotation-offset` 缺 `allow_hyphen_values`**（BrushIR/crates/brush-dataset/src/config.rs:46-47）：负四元数分量（如 `-0.1`）被 clap 当作未知 flag → exit 2。`--ir-translation-offset` 有此属性而 rotation 没有。
5. **headless 详细评估失败会中止整个训练**（apps/brush-headless/src/main.rs:313、363 的 `?`）：任一视图加载失败 → 整个训练退出。应降级为 warning 事件并继续。
6. **`done` 事件的 export_ply 路径未规范化**（main.rs:443）：`parent.join("./xxx_exports/")` 产生 `...\.\xxx_exports\...`，应像 train_stream.rs:209 一样 `components().collect()`。

### C++ 进程管理问题
7. **子进程句柄是全局单槽**（Utils.cpp:26-28）：brush 和 colmap（PreprocessorCore 也用 `ExecuteProcess`）互相覆盖 `g_childStdinWrite`/`g_childProcess`。若 colmap 后启动，"停止训练"的 stdin 命令会写进 colmap（返回 true，前端误以为已停止）。
8. **退出码错误上报**（3dgsHandler.cpp:100-104）：`ExecuteCommand` 返回 false 后读 `GetLastError()` 是陈旧值；clap 参数错误（exit 2）会被误报为"启动失败 (Win32 error: N)"。
9. **`Base64DecodeToString` 解码失败直接 `exit(1)`**（Utils.cpp:80、99，`HandleException(..., true)`）：3dgsHandler.cpp:82-84 的 `catch(...)` 兜底永远不生效，任何畸形请求会杀死整个应用。
10. **`fs::current_path().string()`**（3dgsHandler.cpp:90）：中文安装路径下 `path::string()` 转换可能抛异常。
11. **CallJSFunction 无 browser 时 `exit(1)`**（CefHandler.cpp:196-198）：训练中关页面会连带杀掉整个进程。

### 前端展示问题
12. **IR 阶段进度条倒退**（events.js 'step' 分支）：Rust 的 `IrTrainStep.iter` 是 1..ir_iters（train_stream.rs:559），前端直接 `Recon.step = d.iter`，进入 IR 阶段进度从 30000 跳回 1。应为 `rgbTotal + d.iter`，且 IR 阶段开始时 `Recon.total = rgbTotal + irSteps`。
13. **评估图路径提示指向不存在的目录**（events.js `evalTrainedPly`/core.js `_showEvalPathHint`）：提示 `export_path/eval`，实际训练循环的图在 `export_path/eval_{iter}/`（train_stream.rs:652），headless 详细评估图需要 `--eval-out`（前端从未传）。
14. **`--eval-every`/`--export-every` 传 0 会触发 clap `range(1..)` 报错**（reconEvalEveryDetail 的 min=0），前端应钳制。

## 修复方案

### A. 前端 `Frontend/scripts`
- **brush/args.js**：
  - `--background-color`：hex → `R,G,B`（0~1 浮点，3 位小数），全黑时可省略。
  - 新增 `--eval-out <导出目录>`：新增 `_resolveExportBase()`（复刻 Rust 语义：用户给的绝对路径直接用；相对路径拼到数据集父目录；空则 `父目录/{数据集名}_exports`），供 events.js 提示路径复用。
  - `--eval-every`/`--export-every` 钳制 ≥1。
- **brush/parse.js**：`parseReconOutput` 入口先 strip `[3DGS] ` 前缀再做 JSON 判断（兼容新旧 C++）。
- **brush/events.js**：IR 阶段 step 换算绝对迭代（phase==='ir' 时 `rgbTotal + d.iter`）；'phase' 事件收到 'ir' 时更新 `Recon.total`；`evalTrainedPly`/`_showEvalPathHint` 改用 `_resolveExportBase()` 指向 `eval_out` 目录下的 `eval_{iter}_{phase}` 子目录。
- **recon/core.js**：停止导致的非零退出改为正常提示（"训练已停止"而非报错）。

### B. C++ `3DGS-CEF-App`
- **Utils.cpp/.h**：
  - `Base64DecodeToString` 解码失败改为非致命（返回空串，由调用方判断），不再 `exit(1)`。
  - `ExecuteProcess/ExecuteCommand` 增加可选出参 `ProcHandle{ hProcess, hStdinWrite }`（默认 nullptr 保持兼容）；brush 调用点持有自己的句柄，colmap 不受影响；退出码通过出参返回。
- **3dgsHandler.cpp**：
  - 子进程输出原样透传（去掉 `[3DGS] ` 前缀，C++ 自身消息保留前缀，前端两种都能识别）。
  - `RUST_LOG_STYLE=never`。
  - `recon stop` 改用 brush 专属句柄写入；训练结束/退出时释放。
  - 失败时回传真实退出码 + stderr 末尾几行（clap 错误能直接看到）。
  - 用 exe 目录（wstring→UTF-8）替换 `fs::current_path().string()`。
- **CefHandler.cpp**：`CallJSFunction` 无 browser 时降级为忽略（不 exit）。

### C. Rust `C:\WKSPC\RUST\BrushIR`
- **crates/brush-dataset/src/config.rs**：`ir_rotation_offset` 加 `allow_hyphen_values = true`。
- **apps/brush-headless/src/main.rs**：
  - `run_eval_once` 失败改为 `emit_event({"type":"warning",...})` 并继续训练，不中止。
  - `final_export_ply` 路径 `components().collect()` 规范化。
  - 训练开始时补发 `{"type":"phase","name":"rgb"}` 事件。
- 重新构建：`cargo build --release -p brush-headless`（target/ 已有增量缓存），部署 exe 到 `x64/Release/plugins/brushIR/`。

### D. 验证
1. **CLI 冒烟**（不启 GUI）：用现成数据集 `3DGS-Rebuild/gsdata`（含 colmap/imgs）以 `--total-train-iters 200 --eval-split-every 8 --eval-every 100 --export-every 100 --ir-iters 50 --ir-rotation-offset 1 -0.05 0 0` 直接跑 brush-headless：验证 clap 接受全部参数、stdout 输出 JSON 事件序列（dataset/step/eval/phase/summary/done）、stdin 发 `{"cmd":"stop"}` 能优雅退出、done 的 export_ply 路径存在。
2. **构建 CEFApp**（msbuild x64 Release）并部署前端脚本。
3. **GUI 端到端**留给用户验收（或我通过界面操作验证）：进度条推进、指标卡片/曲线更新、停止按钮生效、完成报告与 PLY 预览加载。

### 已知保留项（不在本次范围）
- 训练循环内置 eval 与 headless 详细 eval 双份计算（同迭代点跑两次评估）——保留现状，只加 Rust phase 事件；如需省算力后续给 ProcessConfig 加开关。
- 评估期间 stdin 命令响应延迟（eval 是同步 await）——影响仅几秒。
