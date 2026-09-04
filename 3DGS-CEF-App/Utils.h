#pragma once

#include <Windows.h>
#include <string>
#include <functional>

using OutputCallback = std::function<void(const std::string& output)>;

// 子进程句柄出参：调用方可持有专属 stdin 写端/进程句柄，
// 避免与全局单槽状态（其他 ExecuteProcess 调用方，如 colmap）互相覆盖。
struct ProcHandle {
    HANDLE hProcess = NULL;     // 子进程句柄（强杀兜底用；WaitForSingleObject 后仍有效，需调用方 CloseHandle）
    HANDLE hStdinWrite = NULL;  // 子进程 stdin 写端（SendCommandToProc 专用；需调用方 CloseHandle）
};

std::string GetExcutableDir();
std::wstring GetExcutableDirW();
std::string Base64DecodeToString(const std::string& base64_input);
std::string Base64EncodeToString(const std::string& raw_data);
std::string ExecuteCommand(const std::string& cmd);
void InitConsole();

bool ExecuteProcess(const std::wstring& exePath,
    const std::wstring& args,
    OutputCallback callback = nullptr,
    DWORD timeoutMs = INFINITE,
    ProcHandle* outProc = nullptr,
    DWORD* outExitCode = nullptr);

bool ExecuteCommand(const std::wstring& cmdLine,
    OutputCallback callback,
    DWORD timeoutMs = INFINITE,
    ProcHandle* outProc = nullptr,
    DWORD* outExitCode = nullptr);

// 向指定子进程的 stdin 写一行命令（优先用调用方持有的句柄；handle 为空时退回全局单槽）。
bool SendCommandToProc(const ProcHandle& handle, const std::string& jsonLine);
// 释放 ProcHandle 持有的句柄（幂等）。
void CloseProcHandle(ProcHandle& handle);

// --- 全局单槽子进程控制（兼容旧调用方：colmap 等）---
// 向最近一次由 ExecuteCommand/ExecuteProcess 启动的子进程发送一行命令。
// 返回 false 表示没有正在运行的可控子进程（或写入失败）。
bool SendCommandToProcess(const std::string& jsonLine);
// 强制结束子进程（优雅停止失败的兜底）。
void KillRunningProcess(DWORD exitCode = 1);