#pragma once

#include <Windows.h>
#include <string>
#include <functional>

using OutputCallback = std::function<void(const std::string& output)>;

std::string GetExcutableDir();
std::wstring GetExcutableDirW();
std::string Base64DecodeToString(const std::string& base64_input);
std::string Base64EncodeToString(const std::string& base64_input);
std::string ExecuteCommand(const std::string& cmd);
void InitConsole();

bool ExecuteProcess(const std::wstring& exePath,
    const std::wstring& args,
    OutputCallback callback = nullptr,
    DWORD timeoutMs = INFINITE);

bool ExecuteCommand(const std::wstring& cmdLine,
    OutputCallback callback,
    DWORD timeoutMs = INFINITE);