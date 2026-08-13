#include "CefControl.h"
#include "Cefhandler.h"
#include "Utils.h"
#include <list>
#include <sstream>
#include <string>

#include "resource.h"

#include "include/base/cef_callback.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_closure_task.h"
#include "PreprocessorCore.h"
#include "AppSchemeHandler.h"
#include <thread>
#include "ExceptionHandler.h"

namespace {

SimpleHandler* g_instance = nullptr;
CefRefPtr<SimpleHandler> g_handler;

std::string GetDataURI(const std::string& data, const std::string& mime_type) {
    return "data:" + mime_type + ";base64," +
           CefURIEncode(CefBase64Encode(data.data(), data.size()), false).ToString();
}

class QueryHandler : public CefMessageRouterBrowserSide::Handler {
public:
    QueryHandler() = default;

    bool OnQuery(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
        int64_t query_id, const CefString& request, bool persistent,
        CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) override {

        // 复制参数到工作线程（注意：CefString需要复制）
        CefString request_copy = request;
        CefRefPtr<CefBrowser> browser_ref = browser;
        CefRefPtr<CefFrame> frame_ref = frame;
        CefRefPtr<CefMessageRouterBrowserSide::Callback> callback_ref = callback;

        // 启动工作线程执行耗时任务
        std::thread worker([browser_ref, frame_ref, request_copy, persistent, callback_ref]() {
            // 在工作线程执行原来的耗时逻辑
            HandleCefQuery(browser_ref, frame_ref, request_copy, persistent, callback_ref);
            });
        worker.detach();  // 分离线程，让它在后台运行

        return true;  // 立即返回
    }

    void OnQueryCanceled(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
        int64_t query_id) override {}
};

LRESULT CALLBACK ParentWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {

    case WM_GETMINMAXINFO:
        // 最大化时钳制到当前显示器工作区，不遮挡任务栏
        {
            HMONITOR mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            MONITORINFO mi = { sizeof(MONITORINFO) };
            if (GetMonitorInfo(mon, &mi)) {
                RECT w = mi.rcWork;
                LPMINMAXINFO mmi = (LPMINMAXINFO)lParam;
                mmi->ptMaxPosition = { w.left, w.top };
                mmi->ptMaxSize = { w.right - w.left, w.bottom - w.top };
                mmi->ptMinTrackSize = { 800, 600 };
            }
        }
        return 0;

    case WM_NCCALCSIZE:
        // 最大化时去掉系统边框残留，避免顶部白线
        if (wParam == TRUE && IsZoomed(hwnd)) {
            return 0;
        }
        break;

    case WM_SIZE:
        if (g_browser) {
            HWND browserHwnd = g_browser->GetHost()->GetWindowHandle();
            if (browserHwnd) {
                RECT rect;
                GetClientRect(hwnd, &rect);
                SetWindowPos(browserHwnd, NULL, 0, 0, rect.right, rect.bottom, SWP_NOZORDER);
                // 同步触发 CEF 重新布局，确保视口与窗口一致
                g_browser->GetHost()->WasResized();
            }
        }
        return 0;

    case WM_CLOSE:
        if (g_handler && !g_handler->IsClosing()) {
            g_handler->CloseAllBrowsers(true);
            return 0;
        }
        break;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

HWND CreateParentWindow(HINSTANCE hInstance) {
    WNDCLASSEX wc = { sizeof(WNDCLASSEX) };
    wc.lpfnWndProc = ParentWndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"3DGS_CEF_Window";

    wc.hIcon = LoadIcon(hInstance, MAKEINTRESOURCE(ID_MAINICON));  
    wc.hIconSm = LoadIcon(hInstance, MAKEINTRESOURCE(ID_MAINICON)); // 小图标

    if (!RegisterClassEx(&wc)) {
        return NULL;
    }

    // 按主显示器工作区自适应尺寸，避免硬编码尺寸超出屏幕导致页面溢出
    RECT workArea = { 0 };
    if (!SystemParametersInfo(SPI_GETWORKAREA, 0, &workArea, 0)) {
        workArea.left = 0;
        workArea.top = 0;
        workArea.right = 1920;
        workArea.bottom = 1600;
    }
    int width = workArea.right - workArea.left;
    int height = workArea.bottom - workArea.top;

    HWND hwnd = CreateWindowEx(WS_EX_APPWINDOW, L"3DGS_CEF_Window", L"3DGS",
        WS_POPUP|WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX| WS_VISIBLE,
        workArea.left, workArea.top, width, height,
        NULL, NULL, hInstance, NULL);

    return hwnd;
}

}  // namespace

CefRefPtr<CefBrowser> g_browser = nullptr;

SimpleHandler::SimpleHandler() {
    DCHECK(!g_instance);
    g_instance = this;

    CefMessageRouterConfig config;
    message_router_ = CefMessageRouterBrowserSide::Create(config);
    message_router_->AddHandler(new QueryHandler(), true);
}

SimpleHandler::~SimpleHandler() {
    g_instance = nullptr;
}

SimpleHandler* SimpleHandler::GetInstance() {
    return g_instance;
}

void SimpleHandler::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                  const CefString& title) {
    CEF_REQUIRE_UI_THREAD();

    PlatformTitleChange(browser, title);
    if (browser) {
        // 延迟一帧调用，确保窗口完全创建
        CefPostDelayedTask(TID_UI, base::BindOnce([](CefRefPtr<CefBrowser> b) {
            if (b) {
                // 先强制尺寸
                b->GetHost()->WasResized();
                // 再显示窗口
                HWND hwnd = b->GetHost()->GetWindowHandle();
                if (hwnd) ::ShowWindow(hwnd, SW_SHOW);
            }
            }, browser), 50);
    }
    InitProcessorCore();
}

void SimpleHandler::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();

    browser_list_.push_back(browser);
    g_browser = browser;

    // 浏览器窗口创建后立即把视口同步到父窗口实际客户区尺寸并强制重排，
    // 避免启动时视口仍停留在创建时的初始尺寸导致页面不缩放/溢出
    CefPostDelayedTask(TID_UI, base::BindOnce([](CefRefPtr<CefBrowser> b) {
        if (!b) {
            return;
        }
        CefWindowHandle hwnd = b->GetHost()->GetWindowHandle();
        if (hwnd) {
            HWND parentHwnd = GetParent(hwnd);
            if (parentHwnd) {
                RECT rect;
                GetClientRect(parentHwnd, &rect);
                SetWindowPos(hwnd, NULL, 0, 0, rect.right, rect.bottom, SWP_NOZORDER);
                b->GetHost()->WasResized();
                ::ShowWindow(hwnd, SW_SHOW);
            }
        }
        }, browser), 50);
}

bool SimpleHandler::DoClose(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();
    if (browser_list_.size() == 1) {
        is_closing_ = true;
    }
    HWND browserHwnd = browser->GetHost()->GetWindowHandle();
    if (browserHwnd) {
        HWND parentHwnd = GetParent(browserHwnd);
        if (parentHwnd) {
            PostMessage(parentHwnd, WM_CLOSE, 0, 0);
        }
    }
    return false;
}

void SimpleHandler::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();
    message_router_->OnBeforeClose(browser);
    browser_list_.remove_if([&browser](const CefRefPtr<CefBrowser>& b) {
        return b->IsSame(browser);
    });
    if (browser_list_.empty()) {
        g_browser = nullptr;
        CefQuitMessageLoop();
    }
}

bool SimpleHandler::OnBeforeBrowse(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefRefPtr<CefRequest> request, bool user_gesture, bool is_redirect) {
    message_router_->OnBeforeBrowse(browser, frame);
    auto url = std::string(frame->GetURL());
    if (url.rfind("app://", 0) != 0 && url.length() > 0) {
        HandleException("UrlCheckFail", "Load from outter link is not allowed!", true);
        return true;
    }
    return false;
}

void SimpleHandler::OnLoadError(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    ErrorCode errorCode,
    const CefString& errorText,
    const CefString& failedUrl) {

    std::string errMsg = "Failed to load page\n";
    errMsg += "errorCode: " + std::to_string(errorCode);
    errMsg += "\nerrorText: " + std::string(CefURIEncode(errorText.ToString(), false));
    errMsg += "\nfailedUrl: " + std::string(CefURIEncode(failedUrl.ToString(), false));
    HandleException("PageLoadError", errMsg, true);

    CEF_REQUIRE_UI_THREAD();
    if (errorCode == ERR_ABORTED) {
        return;
    }

    // 构建错误信息参数
    std::string url = "app://localhost/error.html";
    

    // 加载错误页面
    frame->LoadURL(url);
}

bool SimpleHandler::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefProcessId source_process, CefRefPtr<CefProcessMessage> message) {
    return message_router_->OnProcessMessageReceived(browser, frame, source_process, message);
}

void SimpleHandler::OnBeforeContextMenu(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefContextMenuParams> params,
    CefRefPtr<CefMenuModel> model) {
    CEF_REQUIRE_UI_THREAD();
    if (model) {
        model->Clear();
    }
}

bool SimpleHandler::OnDragEnter(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefDragData> dragData,
    CefDragHandler::DragOperationsMask mask) {
    CEF_REQUIRE_UI_THREAD();
    return true;
}

void SimpleHandler::PlatformTitleChange(CefRefPtr<CefBrowser> browser,
                                        const CefString& title) {
    CefWindowHandle hwnd = browser->GetHost()->GetWindowHandle();
    if (hwnd) {
        HWND parentHwnd = GetParent(hwnd);
        if (parentHwnd) {
            SetWindowText(parentHwnd, std::wstring(title).c_str());
        }
    }
}

void SimpleHandler::CloseAllBrowsers(bool force_close) {
    if (!CefCurrentlyOn(TID_UI)) {
        CefPostTask(TID_UI, base::BindOnce(&SimpleHandler::CloseAllBrowsers, this, force_close));
        return;
    }
    for (const auto& browser : browser_list_) {
        browser->GetHost()->CloseBrowser(force_close);
    }
}

bool SimpleHandler::OnBeforeDownload(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefDownloadItem> download_item,
    const CefString& suggested_name,
    CefRefPtr<CefBeforeDownloadCallback> callback)
{
    // 第二个参数设置为 true，弹出默认的"另存为"对话框
    // 第一个参数留空，CEF会使用建议的文件名
    callback->Continue(suggested_name, true);
    return true;
}

SimpleApp::SimpleApp() = default;

void SimpleApp::OnContextInitialized() {
    CEF_REQUIRE_UI_THREAD();

    HINSTANCE hInstance = (HINSTANCE)GetModuleHandle(NULL);
    HWND parentHwnd = CreateParentWindow(hInstance);
    if (!parentHwnd) {
        return;
    }

    CefRefPtr<SimpleHandler> handler(new SimpleHandler());
    g_handler = handler;

    // 注册 app:// 自定义 scheme，解决 file:// 下 ES module 的 CORS 拦截
    CefRegisterSchemeHandlerFactory("app", "localhost", new AppSchemeHandlerFactory());

    CefBrowserSettings browser_settings;
    CefWindowInfo window_info;
    RECT rect;
    GetClientRect(parentHwnd, &rect);
    window_info.SetAsChild(parentHwnd, CefRect(0, 0, rect.right, rect.bottom));

    std::wstring htmlFilePath = L"app://localhost/index.html";
    CefBrowserHost::CreateBrowser(window_info, handler,
        htmlFilePath.c_str(),
        browser_settings, nullptr, nullptr);
}

void SimpleApp::OnRegisterCustomSchemes(CefRawPtr<CefSchemeRegistrar> registrar) {
    registrar->AddCustomScheme("app",
        CEF_SCHEME_OPTION_STANDARD |
        CEF_SCHEME_OPTION_CORS_ENABLED |
        CEF_SCHEME_OPTION_FETCH_ENABLED);
}

CefRefPtr<CefClient> SimpleApp::GetDefaultClient() {
    return SimpleHandler::GetInstance();
}

void SimpleApp::OnContextCreated(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefRefPtr<CefV8Context> context) {
    if (!message_router_) {
        CefMessageRouterConfig config;
        message_router_ = CefMessageRouterRendererSide::Create(config);
    }
    message_router_->OnContextCreated(browser, frame, context);
}

void SimpleApp::OnContextReleased(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefRefPtr<CefV8Context> context) {
    if (message_router_) {
        message_router_->OnContextReleased(browser, frame, context);
    }
}

bool SimpleApp::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefProcessId source_process, CefRefPtr<CefProcessMessage> message) {
    if (message_router_) {
        return message_router_->OnProcessMessageReceived(browser, frame, source_process, message);
    }
    return false;
}
