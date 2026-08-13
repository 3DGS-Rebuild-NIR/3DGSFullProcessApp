// ExceptionHandler.h
#pragma once
#include <string>
#include <cstdlib>

// 基础异常处理函数
void HandleException(const std::string& exception,
    const std::string& message,
    bool critical = true);