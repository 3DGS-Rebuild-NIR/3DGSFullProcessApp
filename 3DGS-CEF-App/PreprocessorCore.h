//PreprocessorCore.h
#pragma once

#include <windows.h>
#include <string>
#include <vector>
#include <functional>
#include <regex>
#include <fstream>
#include "Utils.h"

// 视频信息结构
struct VideoInfo {
    double duration = 0;
    int height = 0;
    int width = 0;
    double fps = 0;
};

// 全局变量声明
extern std::string g_colmapPath;

// 初始化函数
bool InitProcessorCore();

bool GetVideoInfo(const std::string& videoPath,
    VideoInfo& info,
    OutputCallback callback = nullptr);

bool SplitVideo(const std::string& videoPath,
    const std::string& outputDir,
    int height,
    OutputCallback callback = nullptr);

bool ExtractFrames(const std::string& videoPath,
    const std::string& outputDir,
    double fps,
    OutputCallback callback = nullptr);

bool ColmapFeatureExtractor(const std::string& imageDir,
    const std::string& databasePath,
    OutputCallback callback = nullptr);

bool ColmapExhaustiveMatcher(const std::string& databasePath,
    OutputCallback callback = nullptr);

bool ColmapMapper(const std::string& imageDir,
    const std::string& databasePath,
    const std::string& outputPath,
    OutputCallback callback = nullptr);