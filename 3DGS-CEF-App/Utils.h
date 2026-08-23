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

// --- 子进程控制（管道协议：向子进程 stdin 写一行 JSON 命令）---
// 向最近一次由 ExecuteCommand/ExecuteProcess 启动的子进程发送一行命令。
// 返回 false 表示没有正在运行的可控子进程（或写入失败）。
bool SendCommandToProcess(const std::string& jsonLine);
// 强制结束子进程（优雅停止失败的兜底）。
void KillRunningProcess(DWORD exitCode = 1);