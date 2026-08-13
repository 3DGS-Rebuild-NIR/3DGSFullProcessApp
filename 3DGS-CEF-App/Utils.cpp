#include "Utils.h"
#include "ExceptionHandler.h"
#include <include/internal/cef_string.h>
#include <include/cef_values.h>
#include <include/cef_parser.h>
#include "Encoding.h"

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

    // 3. 检查解码是否成功
    if (!binary_value || binary_value->GetSize() == 0) {
        HandleException("Base64DecodeException", "Base64 decode failed", true);
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
        HandleException("Base64DecodeException", "Base64 decode failed", true);
        return std::string();  // 数据不完整，返回空字符串
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
    DWORD timeoutMs) {
    std::wstring cmdLine = L"\"" + exePath + L"\" " + args;
    return ExecuteCommand(cmdLine, callback, timeoutMs);
}

bool ExecuteCommand(const std::wstring& cmdLine,
    OutputCallback callback,
    DWORD timeoutMs) {

    HANDLE hReadPipe = NULL, hWritePipe = NULL;
    SECURITY_ATTRIBUTES sa = { sizeof(SECURITY_ATTRIBUTES), NULL, TRUE };

    if (callback) {
        if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
            return false;
        }
        SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);
    }

    STARTUPINFOW si = { sizeof(STARTUPINFOW) };
    PROCESS_INFORMATION pi = { 0 };

    if (callback) {
        si.hStdOutput = hWritePipe;
        si.hStdError = hWritePipe;
        si.dwFlags |= STARTF_USESTDHANDLES;
    }

    // 关键：设置环境变量强制无缓冲
    std::wstring env = L"PYTHONUNBUFFERED=1";  // 如果子进程是Python
    // 或者使用 SetEnvironmentVariableW(L"PYTHONUNBUFFERED", L"1");

    if (!CreateProcessW(NULL, (LPWSTR)cmdLine.c_str(),
        NULL, NULL, callback ? TRUE : FALSE,
        CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        if (callback) {
            CloseHandle(hReadPipe);
            CloseHandle(hWritePipe);
        }
        return false;
    }

    if (callback) {
        CloseHandle(hWritePipe);

        // 使用宽字符或UTF-8处理
        char buffer[4096];
        DWORD bytesRead;
        std::string outputBuffer;

        while (ReadFile(hReadPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead > 0) {
            buffer[bytesRead] = '\0';
            outputBuffer += std::string(buffer, bytesRead);

            // 处理完整的行（包括\n）
            size_t pos = 0;
            size_t end;
            while ((end = outputBuffer.find('\n', pos)) != std::string::npos) {
                std::string line = outputBuffer.substr(pos, end - pos);
                // 保留行尾的\r（如果有）
                if (!line.empty()) {
                    // 去除行尾的\r
                    if (line.back() == '\r') {
                        line.pop_back();
                    }
                    callback(line);
                }
                pos = end + 1;
            }

            // 保留未完成的行
            if (pos < outputBuffer.length()) {
                outputBuffer = outputBuffer.substr(pos);
            }
            else {
                outputBuffer.clear();
            }
        }
        CloseHandle(hReadPipe);
    }

    // 等待进程结束
    WaitForSingleObject(pi.hProcess, timeoutMs);

    DWORD exitCode;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    return exitCode == 0;
}