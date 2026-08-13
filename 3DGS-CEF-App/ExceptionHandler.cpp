// ExceptionHandler.cpp
#include "ExceptionHandler.h"
#include <Windows.h>
#include <string>
#include <cstdlib>
#include <iostream>

void HandleException(const std::string& exception,
    const std::string& message,
    bool critical) {
    std::string fullMessage = "Program crashed!\n" + message;
    MessageBoxA(NULL, fullMessage.c_str(), exception.c_str(), MB_ICONERROR);

    // 同时输出到控制台（方便调试）
    std::cerr << "[" << exception << "] " << message << std::endl;

    if (critical) {
        exit(1);  // 使用 EXIT_FAILURE 更标准
    }
}