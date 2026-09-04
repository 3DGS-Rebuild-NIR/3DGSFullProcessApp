#include "Utils.h"
#include "ExceptionHandler.h"
#include <include/internal/cef_string.h>
#include <include/cef_values.h>
#include <include/cef_parser.h>
#include "Encoding.h"

#include <mutex>

// ---- 获取 Win32 错误描述 ----
static std::string GetWin32ErrorMessage(DWORD errorCode) {
    char buf[512] = {0};
    DWORD len = FormatMessageA(
        FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        NULL, errorCode, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
        buf, sizeof(buf), NULL);
    if (len > 0) {
        // 去除末尾换行
        while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r')) buf[--len] = '\0';
        return std::string(buf) + " (error " + std::to_string(errorCode) + ")";
    }
    return "error " + std::to_string(errorCode);
}

// ---- 子进程控制状态（管道协议） ----
static std::mutex g_procMutex;
static HANDLE g_childStdinWrite = NULL;   // 写入子进程 stdin 的管道句柄
static HANDLE g_childProcess = NULL;      // 子进程句柄（TerminateProcess 兜底用）

bool SendCommandToProcess(const std::string& jsonLine) {
    std::lock_guard<std::mutex> lock(g_procMutex);
    if (!g_childStdinWrite) return false;
    std::string line = jsonLine;
    if (line.empty() || line.back() != '\n') line += "\n";
    DWORD written = 0;
    BOOL ok = WriteFile(g_childStdinWrite, line.c_str(), (DWORD)line.size(), &written, NULL);
    return ok && written == line.size();
}

void KillRunningProcess(DWORD exitCode) {
    std::lock_guard<std::mutex> lock(g_procMutex);
    if (g_childProcess) {
        TerminateProcess(g_childProcess, exitCode);
    }
}

std::string GetExcutableDir() {
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string exeDir = exePath;
	exeDir = exeDir.substr(0, exeDir.find_last_of("\\/"));
	SetCurrentDirectoryA(exeDir.c_str());
	return exeDir;
}

std::wstring GetExcutableDirW() {
    wchar_t exePath[MAX_PATH];
    GetModuleFileName(NULL, exePath, MAX_PATH);
    std::wstring exeDir = exePath;
    exeDir = exeDir.substr(0, exeDir.find_last_of(L"\\/"));
    SetCurrentDirectory(exeDir.c_str());
    return exeDir;
}

std::string Base64DecodeToString(const std::string& base64_input) {
    // 1. 将 std::string 转为 CefString（CEF 会自动处理编码）
    CefString cef_input = base64_input;

    // 2. 调用 CEF 的 Base64 解码函数
    CefRefPtr<CefBinaryValue> binary_value = CefBase64Decode(cef_input);

    // 3. 检查解码是否成功（非致命：返回空串由调用方判断，避免整个进程退出）
    if (!binary_value || binary_value->GetSize() == 0) {
        HandleException("Base64DecodeException", "Base64 decode failed", false);
        return std::string();
    }

    // 4. 获取解码后的数据大小
    size_t data_size = binary_value->GetSize();

    // 5. 创建足够大的缓冲区
    std::string result(data_size, '\0');

    // 6. 将 CefBinaryValue 中的数据复制到 std::string
    //    注意：GetData 的返回值是 size_t，表示实际复制的字节数
    size_t copied = binary_value->GetData(
        const_cast<char*>(result.data()),  // CefBinaryValue 需要 void*，这里转为 char*
        data_size,                         // 缓冲区大小
        0                                  // 偏移量，从开头读取
    );

    // 7. 如果实际复制的大小不等于预期大小，说明可能有问题
    if (copied != data_size) {
        HandleException("Base64DecodeException", "Base64 decode incomplete", false);
        return std::string();
    }

    return Utf8ToLocal(result);
}

std::string Base64EncodeToString(const std::string& raw_data) {
    std::string data = LocalToUtf8(raw_data);

    // 直接调用 CefBase64Encode，传入数据指针和大小
    CefString base64_result = CefBase64Encode(
        data.data(),   // const void* 数据指针
        data.size()    // size_t 数据大小
    );

    // 将 CefString 转为 std::string 并返回
    return base64_result.ToString();
}

std::string ExecuteCommand(const std::string& cmd) {
    std::string result = "";
    char buffer[128];

    // 创建管道
    HANDLE hReadPipe, hWritePipe;
    SECURITY_ATTRIBUTES sa = { sizeof(SECURITY_ATTRIBUTES), NULL, TRUE };

    if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
        return "Error: CreatePipe failed";
    }

    // 设置进程启动信息
    STARTUPINFOA si = { sizeof(STARTUPINFOA) };
    PROCESS_INFORMATION pi;

    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;  // 关键：隐藏窗口
    si.hStdOutput = hWritePipe;
    si.hStdError = hWritePipe;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    // 创建进程
    std::string cmdLine = "cmd.exe /c " + cmd;
    if (!CreateProcessA(NULL, (LPSTR)cmdLine.c_str(), NULL, NULL, TRUE,
        CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        CloseHandle(hReadPipe);
        CloseHandle(hWritePipe);
        return "Error: CreateProcess failed";
    }

    CloseHandle(hWritePipe);
    CloseHandle(pi.hThread);

    // 读取输出
    DWORD bytesRead;
    while (ReadFile(hReadPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead > 0) {
        buffer[bytesRead] = '\0';
        result += buffer;
    }

    WaitForSingleObject(pi.hProcess, INFINITE);
    CloseHandle(pi.hProcess);
    CloseHandle(hReadPipe);

    return result;
}

void InitConsole()
{
    AllocConsole();

    freopen_s((FILE**)stdout, "CONOUT$", "w", stdout);
    freopen_s((FILE**)stderr, "CONOUT$", "w", stderr);

    auto consoleWindow = GetConsoleWindow();
    SetForegroundWindow(consoleWindow);
    ShowWindow(consoleWindow, SW_RESTORE);
    ShowWindow(consoleWindow, SW_SHOW);
}

bool ExecuteProcess(const std::wstring& exePath,
    const std::wstring& args,
    OutputCallback callback,
    DWORD timeoutMs,
    ProcHandle* outProc,
    DWORD* outExitCode) {
    std::wstring cmdLine = L"\"" + exePath + L"\" " + args;
    return ExecuteCommand(cmdLine, callback, timeoutMs, outProc, outExitCode);
}

static void ProcessPipeOutput(HANDLE hRead, const OutputCallback& callback) {
    char buffer[4096];
    DWORD bytesRead;
    std::string outputBuffer;

    while (ReadFile(hRead, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead > 0) {
        buffer[bytesRead] = '\0';
        outputBuffer += std::string(buffer, bytesRead);

        size_t pos = 0;
        size_t end;
        while ((end = outputBuffer.find('\n', pos)) != std::string::npos) {
            std::string line = outputBuffer.substr(pos, end - pos);
            if (!line.empty()) {
                if (line.back() == '\r') {
                    line.pop_back();
                }
                callback(line);
            }
            pos = end + 1;
        }

        if (pos < outputBuffer.length()) {
            outputBuffer = outputBuffer.substr(pos);
        }
        else {
            outputBuffer.clear();
        }
    }

    // 处理 ReadFile 结束后残余的未flush数据（子进程关闭管道时最后一批可能无换行符）
    if (!outputBuffer.empty()) {
        std::string tail = outputBuffer;
        if (tail.back() == '\r') tail.pop_back();
        if (!tail.empty()) callback(tail);
    }
}

bool ExecuteCommand(const std::wstring& cmdLine,
    OutputCallback callback,
    DWORD timeoutMs,
    ProcHandle* outProc,
    DWORD* outExitCode) {

    if (outExitCode) *outExitCode = (DWORD)-1;

    HANDLE hReadPipe = NULL, hWritePipe = NULL;
    HANDLE hReadPipeIn = NULL, hWritePipeIn = NULL;
    SECURITY_ATTRIBUTES sa = { sizeof(SECURITY_ATTRIBUTES), NULL, TRUE };

    if (callback) {
        if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
            return false;
        }
        SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);

        if (!CreatePipe(&hReadPipeIn, &hWritePipeIn, &sa, 0)) {
            CloseHandle(hReadPipe);
            CloseHandle(hWritePipe);
            return false;
        }
        SetHandleInformation(hWritePipeIn, HANDLE_FLAG_INHERIT, 0);
    }

    STARTUPINFOW si = { sizeof(STARTUPINFOW) };
    PROCESS_INFORMATION pi = { 0 };

    if (callback) {
        si.hStdOutput = hWritePipe;
        si.hStdError = hWritePipe;
        si.hStdInput = hReadPipeIn;
        si.dwFlags |= STARTF_USESTDHANDLES;
    }

    std::wstring mutableCmd = cmdLine;
    if (!CreateProcessW(NULL, (LPWSTR)mutableCmd.c_str(),
        NULL, NULL, callback ? TRUE : FALSE,
        CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        DWORD err = GetLastError();
        if (callback) {
            callback("[ERROR] CreateProcessW failed: " + GetWin32ErrorMessage(err) + "\n  cmd: " + wstring_to_utf8(cmdLine));
            CloseHandle(hReadPipe);
            CloseHandle(hWritePipe);
            CloseHandle(hReadPipeIn);
            CloseHandle(hWritePipeIn);
        }
        return false;
    }

    {
        std::lock_guard<std::mutex> lock(g_procMutex);
        if (g_childProcess) CloseHandle(g_childProcess);
        g_childProcess = pi.hProcess;
        if (g_childStdinWrite) CloseHandle(g_childStdinWrite);
        g_childStdinWrite = hWritePipeIn;
    }

    if (callback) {
        CloseHandle(hWritePipe);
        CloseHandle(pi.hThread);

        ProcessPipeOutput(hReadPipe, callback);
        CloseHandle(hReadPipe);
    }

    WaitForSingleObject(pi.hProcess, timeoutMs);

    DWORD exitCode = (DWORD)-1;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    if (outExitCode) *outExitCode = exitCode;

    // 出参句柄移交给调用方（进程句柄复制一份，stdin 写端直接移交；
    // 复制句柄失败时调用方退回全局单槽接口）
    if (outProc) {
        outProc->hStdinWrite = NULL;
        outProc->hProcess = NULL;
        HANDLE dup = NULL;
        if (DuplicateHandle(GetCurrentProcess(), pi.hProcess, GetCurrentProcess(),
            &dup, 0, FALSE, DUPLICATE_SAME_ACCESS)) {
            outProc->hProcess = dup;
        }
        outProc->hStdinWrite = hWritePipeIn;
        hWritePipeIn = NULL; // 所有权已移交
        if (!outProc->hProcess && !outProc->hStdinWrite) {
            outProc = nullptr; // 无任何可用句柄，不误导读者
        }
    }

    CloseHandle(pi.hProcess);
    if (!callback) CloseHandle(pi.hThread);
    if (hWritePipeIn) CloseHandle(hWritePipeIn);

    return exitCode == 0;
}

bool SendCommandToProc(const ProcHandle& handle, const std::string& jsonLine) {
    if (!handle.hStdinWrite) return SendCommandToProcess(jsonLine);
    std::string line = jsonLine;
    if (line.empty() || line.back() != '\n') line += "\n";
    DWORD written = 0;
    BOOL ok = WriteFile(handle.hStdinWrite, line.c_str(), (DWORD)line.size(), &written, NULL);
    return ok && written == line.size();
}

void CloseProcHandle(ProcHandle& handle) {
    if (handle.hStdinWrite) { CloseHandle(handle.hStdinWrite); handle.hStdinWrite = NULL; }
    if (handle.hProcess) { CloseHandle(handle.hProcess); handle.hProcess = NULL; }
}