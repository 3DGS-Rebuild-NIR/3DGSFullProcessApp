#include <windows.h>
#include "CefControl.h"
#include "utils.h"
#include "resource.h"
#include <string>

#include "include/cef_command_line.h"
#include "SystemUsage.h"

#define MUTEX_NAME L"Global\\{1029-AAAA-1029-8B4E-4B5C-9D3A-7F8E2A1B3C4D}"

int APIENTRY wWinMain(HINSTANCE hInstance,
    HINSTANCE hPrevInstance,
    LPTSTR lpCmdLine,
    int nCmdShow) {
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);

    SetConsoleOutputCP(CP_UTF8);
    CefMainArgs mainArgs(hInstance);

    
    CefRefPtr<CefCommandLine> command_line = CefCommandLine::CreateCommandLine();//CefCommandLine::GetGlobalCommandLine();


    command_line->AppendSwitch("disable-password-manager");
    command_line->AppendSwitch("disable-save-password-bubble");
    command_line->AppendSwitch("disable-default-apps");
    command_line->AppendSwitch("disable-plugins");
    command_line->AppendSwitch("disable-dev-tools");
    command_line->AppendSwitch("disable-web-security");

    command_line->AppendSwitch("disable-features=PasswordImport,PasswordProtection");
    command_line->AppendSwitch("enable-features=DisablePasswordManager");

    command_line->AppendSwitch("disable-chrome-pages");

    CefRefPtr<SimpleApp> app(new SimpleApp());

    int exit_code = CefExecuteProcess(mainArgs, app.get(), nullptr);
    if (exit_code >= 0) {
        return exit_code;
    }


    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    HANDLE hMutex = CreateMutex(NULL, TRUE, MUTEX_NAME);
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        // 已有实例在运行，激活旧窗口
        HWND hOldWnd = FindWindow(L"3DGS_CEF_Window", L"IR强化的3DGS全链路重建系统");
        if (hOldWnd) {
            // 如果最小化了则恢复
            if (IsIconic(hOldWnd)) {
                ShowWindow(hOldWnd, SW_RESTORE);
            }
            SetForegroundWindow(hOldWnd);
            // 如果有命令行参数需要传给旧窗口，可以通过 WM_COPYDATA 发送
            // 此处省略（如有需要可追加）
        }
        if (!hMutex) {
        }
        exit(0);
    }
    

    CefSettings settings;
    settings.no_sandbox = true;
    settings.multi_threaded_message_loop = false;
    settings.chrome_app_icon_id = ID_MAINICON;
    //settings.command_line_args_disabled = true;

    auto exeDir = GetExcutableDirW();
    CefString(&settings.resources_dir_path) = exeDir;
    CefString(&settings.locales_dir_path) = exeDir + L"\\locales";

    std::wstring cachePath = exeDir + L"\\appdata";
    std::wstring dataPath = cachePath + L"\\cefdata";
    CefString(&settings.root_cache_path) = cachePath;
    CefString(&settings.cache_path) = dataPath;

    //InitConsole();

    if (!CefInitialize(mainArgs, settings, app.get(), nullptr)) {
        return -1;
    }

    CefRunMessageLoop();

    CefShutdown();
    return 0;
}
