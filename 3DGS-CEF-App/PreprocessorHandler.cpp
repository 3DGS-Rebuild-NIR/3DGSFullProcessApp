//PreprocessorHandler.cpp
#include "PreprocessorHandler.h"
#include "CefHandler.h"
#include "Utils.h"
#include "ExceptionHandler.h"
#include "PreprocessorCore.h"
#include <sstream>
#include <mutex>

static std::mutex g_processorMutex;
static bool g_processorLock = false;

bool HandlePreprocessorQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {

    // 防止重复调用
    if (g_processorLock) {
        HandleException("QueryLockedException", "HandlePreprocessorQuery was running with thread lock.", false);
        return false;
    }

    std::lock_guard<std::mutex> lock(g_processorMutex);
    g_processorLock = true;

    // 确保处理器已初始化
    static bool initialized = false;
    if (!initialized) {
        initialized = InitProcessorCore();
        if (!initialized) {
            g_processorLock = false;
            return false;
        }
    }

    std::istringstream iss(request);
    std::string processorName;
    std::string function;
    iss >> processorName; // 3dgsProcessor
    iss >> function; // func

    bool result = false;
    std::string response;

    if (function == "getVideoInfo") {
        std::string videoPath;
        iss >> videoPath;
        videoPath = Base64DecodeToString(videoPath);

VideoInfo info;
        result = GetVideoInfo(videoPath, info,
            [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });

        if (result) {
            std::string resultJson = "{\"duration\":" + std::to_string(info.duration) +
                ",\"height\":" + std::to_string(info.height) +
                ",\"width\":" + std::to_string(info.width) +
                ",\"fps\":" + std::to_string(info.fps) + "}";
            response = resultJson;
        }
        else {
            HandleException("GetVideoInfoFailed", "Failed to get video info", false);
        }
    }
    else if (function == "splitVideo") {
        std::string videoPath;
        iss >> videoPath;
        videoPath = Base64DecodeToString(videoPath);

        std::string outputDir;
        iss >> outputDir;
        outputDir = Base64DecodeToString(outputDir);

        int height;
        iss >> height;

        result = SplitVideo(videoPath, outputDir, height,
            [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });
    }
    else if (function == "extractFrames") {
        std::string videoPath;
        iss >> videoPath;
        videoPath = Base64DecodeToString(videoPath);

        std::string outputDir;
        iss >> outputDir;
        outputDir = Base64DecodeToString(outputDir);

        double fps;
        iss >> fps;

        result = ExtractFrames(videoPath, outputDir, fps,
            [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });
    }
    else if (function == "colmapFeatureExtractor") {
        std::string imageDir;
        iss >> imageDir;
        imageDir = Base64DecodeToString(imageDir);

        std::string databasePath;
        iss >> databasePath;
        databasePath = Base64DecodeToString(databasePath);

        result = ColmapFeatureExtractor(imageDir, databasePath,
            [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });
    }
    else if (function == "colmapExhaustiveMatcher") {
        std::string databasePath;
        iss >> databasePath;
        databasePath = Base64DecodeToString(databasePath);

        result = ColmapExhaustiveMatcher(databasePath,
            [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });
    }
    else if (function == "colmapMapper") {
        std::string imageDir;
        iss >> imageDir;
        imageDir = Base64DecodeToString(imageDir);

        std::string databasePath;
        iss >> databasePath;
        databasePath = Base64DecodeToString(databasePath);

        std::string outputPath;
        iss >> outputPath;
        outputPath = Base64DecodeToString(outputPath);

        result = ColmapMapper(imageDir, databasePath,
            outputPath, [&](const std::string& output) {
                UpdateUIOutput(browser, output);
            });
    }

    g_processorLock = false;

    if (result) {
        callback->Success(CefString(response));
    }
    else {
        callback->Failure(-1, CefString("preproc " + function + " 执行失败"));
    }
    return true;
}

void UpdateUIOutput(CefRefPtr<CefBrowser> browser, std::string msg) {
    CallJSFunction(browser, "updatePreprocOutput('" + Base64EncodeToString(msg) + "')");
}