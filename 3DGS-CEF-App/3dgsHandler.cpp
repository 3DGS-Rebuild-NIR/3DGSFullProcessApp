#include "3dgsHandler.h"
#include <include/cef_browser.h>
#include <include/wrapper/cef_message_router.h>
#include "Utils.h"
#include "CefHandler.h"
#include "Encoding.h"
#include <mutex>
#include <sstream>
#include "ExceptionHandler.h"
#include <iostream>

#include <windows.h>
#include <string>
#include <filesystem>
#include <functional>

namespace fs = std::filesystem;

static std::mutex g_gsMutex;
fs::path g_brushirPath;
static bool g_gsLock = false;

bool Init3DGSCore() {
    fs::path pluginDir = fs::current_path() / "plugins";

    // 查找 brushIR（优先 brush-headless.exe，回退 brush.exe）
    if (fs::exists(pluginDir / "brushIR" / "brush-headless.exe")) {
        g_brushirPath = pluginDir / "brushIR" / "brush-headless.exe";
    }
    else if (fs::exists(pluginDir / "brushIR" / "brush.exe")) {
        g_brushirPath = pluginDir / "brushIR" / "brush.exe";
    }
    else {
        HandleException("3DGSNotFound", "brush-headless.exe not found in ./plugins or current directory", true);
        return false;
    }

    return true;
}

bool Handle3dgsQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {

    // 解析子命令：请求格式 "recon <subcmd|base64args>"
    std::istringstream iss(request);
    std::string function;
    std::string rest;
    iss >> function;
    std::getline(iss, rest);
    // trim
    rest.erase(0, rest.find_first_not_of(" \t\r\n"));

    // 子命令：stop —— 向 brush-headless 的 stdin 发停止命令（优雅停止）。
    // 不占用 g_gsMutex，避免与阻塞中的训练查询（ExecuteProcess 常驻）死锁。
    if (rest == "stop") {
        bool ok = SendCommandToProcess("{\"cmd\":\"stop\"}");
        callback->Success(CefString(ok ? "stopped" : "no-process"));
        return true;
    }
    if (rest.empty()) {
        callback->Failure(-1, CefString("recon: missing args"));
        return true;
    }

    std::lock_guard<std::mutex> lock(g_gsMutex);
    g_gsLock = true;

    // 确保处理器已初始化
    static bool initialized = false;
    if (!initialized) {
        initialized = Init3DGSCore();
        if (!initialized) {
            g_gsLock = false;
            return false;
        }
    }

    std::string args;
    try {
        args = Base64DecodeToString(rest);
    } catch (...) {
        args = rest;
    }

    // brush-headless 无查看器；训练/评估参数由前端组装
    // （含 --eval-split-every、--eval-every 等实时评估所需参数）
    SetEnvironmentVariableW(L"RUST_LOG_STYLE", L"always");
    SetEnvironmentVariable(L"RUST_LOG", L"info");
    ExecuteProcess(g_brushirPath, utf8_to_wstring(args), [&](const std::string& output) {
        Update3DGSOutput(browser, "[3DGS] "+output);
        });
    SetEnvironmentVariable(L"RUST_LOG", NULL);

    g_gsLock = false;

    return true;
}

void Update3DGSOutput(CefRefPtr<CefBrowser> browser, std::string msg) {
    CallJSFunction(browser, "update3DGSOutput('" + Base64EncodeToString(msg) + "')");
}

/*
C:\WKSPC\RUST\BrushIR\target\release>brush --help
Brush - universal splats

Usage: brush [OPTIONS] [PATH_OR_URL]

Arguments:
  [PATH_OR_URL]  Source to load from (path or URL)

Options:
      --with-viewer  Spawn a viewer to visualize the training
  -h, --help         Print help
  -V, --version      Print version

Training options:
      --total-train-iters <TOTAL_TRAIN_ITERS>
          Total number of steps to train for [default: 30000]
      --render-mode <RENDER_MODE>
          [possible values: default, mip]
      --lr-mean <LR_MEAN>
          Start learning rate for the mean parameters [default: 2e-5]
      --lr-mean-end <LR_MEAN_END>
          Start learning rate for the mean parameters [default: 2e-7]
      --mean-noise-weight <MEAN_NOISE_WEIGHT>
          How much noise to add to the mean parameters of low opacity gaussians [default: 50.0]
      --lr-coeffs-dc <LR_COEFFS_DC>
          Learning rate for the base SH (RGB) coefficients [default: 2e-3]
      --lr-coeffs-sh-scale <LR_COEFFS_SH_SCALE>
          How much to divide the learning rate by for higher SH orders [default: 10.0]
      --lr-opac <LR_OPAC>
          Learning rate for the opacity parameter [default: 0.012]
      --lr-scale <LR_SCALE>
          Learning rate for the scale parameters [default: 5e-3]
      --lr-rotation <LR_ROTATION>
          Learning rate for the rotation parameters [default: 2e-3]
      --ssim-weight <SSIM_WEIGHT>
          Weight of SSIM loss (compared to l1 loss) [default: 0.2]
      --opac-decay <OPAC_DECAY>
          Factor of the opacity decay [default: 0.004]
      --background-color <BACKGROUND_COLOR> <BACKGROUND_COLOR> <BACKGROUND_COLOR>
          Base background color (R,G,B) used during training [default: 0,0,0]
      --background-noise-strength <BACKGROUND_NOISE_STRENGTH>
          Strength of random noise added to the background color each step. Noise is uniform in [-strength, +strength], clamped to [0, 1] [default: 0.1]
      --random-init-scene-scale <RANDOM_INIT_SCENE_SCALE>
          Scene scale used for random splat initialization. When no init is provided, splats are randomly placed inside camera frustums up to this depth. By default this is estimated from the camera spacing (with a 1m minimum)

Refine options:
      --max-splats <MAX_SPLATS>
          Max nr. of splats. This is only an upper bound, the actual final number of splats is NOT determined by this [default: 10000000]
      --refine-every <REFINE_EVERY>
          Frequency of 'refinement' where gaussians are replaced and densified. This should roughly be the number of images it takes to properly "cover" your scene [default: 200]
      --growth-grad-threshold <GROWTH_GRAD_THRESHOLD>
          Threshold to control splat growth. Lower means faster growth [default: 0.0025]
      --growth-select-fraction <GROWTH_SELECT_FRACTION>
          What fraction of splats that are deemed as needing to grow do actually grow. Increase this to make splats grow more aggressively [default: 0.25]
      --growth-stop-iter <GROWTH_STOP_ITER>
          Period after which splat growth stops [default: 15000]
      --split-at-screen-size <SPLIT_AT_SCREEN_SIZE>
          Split any splat whose max screen-space extent exceeds this fraction of the image dimension, shrinking the children so they land at (at most) this size on screen. 0 disables [default: 0.5]
      --match-alpha-weight <MATCH_ALPHA_WEIGHT>
          Weight of l1 loss on alpha if input view has transparency [default: 0.1]
      --lpips-loss-weight <LPIPS_LOSS_WEIGHT>
          [default: 0.0]

LOD options:
      --lod-levels <LOD_LEVELS>
          Number of LOD levels to generate after initial training (0 = disabled) [default: 0]
      --lod-refine-steps <LOD_REFINE_STEPS>
          Number of refinement training steps per LOD level [default: 5000]
      --lod-decimation-keep <LOD_DECIMATION_KEEP>
          Percentage of gaussians to keep at each LOD level (1-100) [default: 50]
      --lod-image-scale <LOD_IMAGE_SCALE>
          Percentage to scale source images at each LOD level (1-100) [default: 50]

IR options:
      --ir-iters <IR_ITERS>
          Number of IR-only training iterations after RGB training (0 = disabled) [default: 0]
      --lr-ir <LR_IR>
          Learning rate for IR intensity parameter [default: 0.01]
      --ir-refine-every <IR_REFINE_EVERY>
          Refinement interval during IR training (0 = no refinement) [default: 0]

Model Options:
      --sh-degree <SH_DEGREE>  SH degree of splats [default: 3]

Dataset Options:
      --max-frames <MAX_FRAMES>
          Max nr. of frames of dataset to load
      --max-resolution <MAX_RESOLUTION>
          Max resolution of images to load [default: 1920]
      --eval-split-every <EVAL_SPLIT_EVERY>
          Create an eval dataset by selecting every nth image
      --subsample-frames <SUBSAMPLE_FRAMES>
          Load only every nth frame
      --subsample-points <SUBSAMPLE_POINTS>
          Load only every nth point from the initial sfm data
      --alpha-mode <ALPHA_MODE>
          Whether to interpret an alpha channel (or masks) as transparency or masking [possible values: masked, transparent]

IR Options:
      --ir-subdir <IR_SUBDIR>                                                                                   IR subdirectory name (e.g. "ir"). IR images loaded when set
      --ir-translation-offset <IR_TRANSLATION_OFFSET> <IR_TRANSLATION_OFFSET> <IR_TRANSLATION_OFFSET>           Translation offset from RGB camera to IR camera (meters). [x, y, z] [default: 0.0]
      --ir-rotation-offset <IR_ROTATION_OFFSET> <IR_ROTATION_OFFSET> <IR_ROTATION_OFFSET> <IR_ROTATION_OFFSET>  Rotation offset (quaternion) from RGB camera to IR camera. [w, x, y, z] [default: 1.0]

Process options:
      --seed <SEED>                  Random seed [default: 42]
      --start-iter <START_ITER>      Iteration to resume from [default: 0]
      --eval-every <EVAL_EVERY>      Eval every this many steps [default: 1000]
      --eval-save-to-disk            Save the rendered eval images to disk. Uses export-path for the file location
      --export-every <EXPORT_EVERY>  Export every this many steps [default: 5000]
      --export-path <EXPORT_PATH>    Location to put exported files. Supports {dataset} interpolation for the dataset folder name. Path is relative to the dataset's parent directory (or CWD if unavailable). Use "./{dataset}/" to export inside the dataset folder [default: ./{dataset}_exports/]
      --export-name <EXPORT_NAME>    Filename of exported ply file [default: export_{iter}.ply]

Rerun options:
      --rerun-enabled
          Whether to enable rerun.io logging for this run
      --rerun-log-train-stats-every <RERUN_LOG_TRAIN_STATS_EVERY>
          How often to log basic training statistics [default: 50]
      --rerun-log-splats-every <RERUN_LOG_SPLATS_EVERY>
          How often to log out the full splat point cloud to rerun (warning: heavy)
      --rerun-log-distribution-every <RERUN_LOG_DISTRIBUTION_EVERY>
          How often to log the splat scale/opacity/anisotropy distribution stats [default: 1000]
      --rerun-max-img-size <RERUN_MAX_IMG_SIZE>
          The maximum size of images from the dataset logged to rerun [default: 512]
*/