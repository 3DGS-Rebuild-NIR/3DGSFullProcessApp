#include "Cefhandler.h"
#include "CefControl.h"

#include "include/wrapper/cef_closure_task.h"
#include "include/base/cef_bind.h"
#include "include/base/cef_callback.h"

#include "Utils.h"
#include <list>
#include <sstream>
#include <string>
#include "include/cef_app.h"
#include "include/cef_client.h"
#include "include/cef_browser.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_request_handler.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_message_router.h"
#include <include/cef_parser.h>
#include "ExceptionHandler.h"
#include "PreprocessorHandler.h"
#include "3dgsHandler.h"
#include "MotorControlHandler.h"
#include "SystemUsage.h"
#include "FileAPIHandler.h"
#include "Encoding.h"
#include "DialogHandler.h"

bool HandleCefQuery(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& request, bool persistent,
	CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {
	const std::string& requestStr = request;
	std::istringstream iss(requestStr);

	std::string function;
	iss >> function;
	// basic debug
	if (function == "cmdRun") {
		std::string cmdB64;
		iss >> cmdB64;
		auto result = ExecuteCommand(Base64DecodeToString(cmdB64).c_str());
		//HandleException("Deprecated", "cmdRun: " + Base64DecodeToString(cmdB64), false);
		callback->Success(CefString(LocalToUtf8(result)));
		return true;
	}

	if (function == "getExeDir") {
		callback->Success(CefString(Base64EncodeToString(GetExcutableDir())));
		return true;
	}

	else if (function == "msgBox") {
		std::string cmd1_B64;
		iss >> cmd1_B64;
		std::string cmd2_B64;
		iss >> cmd2_B64;
		int type = 0;
		iss >> type;
		int result = MessageBoxA(NULL, Base64DecodeToString(cmd1_B64).c_str()
		, Base64DecodeToString(cmd2_B64).c_str(), type);
		callback->Success(CefString(std::to_string(result)));
		return true;
	}

	else if (function == "devTools") {
		CefWindowInfo windowInfo;
		CefBrowserSettings settings;
		windowInfo.SetAsPopup(nullptr, "DevTools");
		browser->GetHost()->ShowDevTools(windowInfo, /* client */ nullptr, settings, CefPoint());
		callback->Success(CefString("Succ"));
		return true;
	}

	else if (function == "chromeSettings") {
		CefWindowInfo windowInfo;
		CefBrowserSettings settings;
		windowInfo.SetAsPopup(NULL, "Settings");
		CefBrowserHost::CreateBrowser(windowInfo, nullptr, "chrome://settings", settings, nullptr, nullptr);
		callback->Success(CefString("Succ"));
		return true;
	}

	else if (function == "getSystemPerformance") {
		try {
			std::string performanceJson = GetSystemPerformanceInfo();
			callback->Success(CefString(performanceJson));
		}
		catch (const std::exception& e) {
			// 如果出错，返回错误信息
			std::string errorJson = "{\"error\":\"" + std::string(e.what()) + "\"}";
			callback->Success(CefString(errorJson));
		}
		return true;
	}

	else if (function == "window") {
		std::string action;
		iss >> action;
		auto handle = [](std::string act, CefRefPtr<CefMessageRouterBrowserSide::Callback> cb, CefRefPtr<CefBrowser> browser) {
			HWND hwnd = browser ? browser->GetHost()->GetWindowHandle() : nullptr;
			HWND parentHwnd = hwnd ? GetParent(hwnd) : nullptr;
			if (!parentHwnd) {
				parentHwnd = hwnd;
			}
			if (!parentHwnd) {
				if (act == "close") {
					exit(0);
				}
				cb->Failure(-1, CefString("no window"));
				return;
			}
			if (act == "min") {
				ShowWindow(parentHwnd, SW_MINIMIZE);
				cb->Success(CefString("ok"));
			}
			else if (act == "max") {
				ShowWindow(parentHwnd, IsZoomed(parentHwnd) ? SW_RESTORE : SW_MAXIMIZE);
				cb->Success(CefString(IsZoomed(parentHwnd) ? "max" : "restore"));
			}
			else if (act == "restore") {
				ShowWindow(parentHwnd, SW_RESTORE);
				cb->Success(CefString("restore"));
			}
			else if (act == "close") {
				cb->Success(CefString("ok"));
				PostMessage(parentHwnd, WM_CLOSE, 0, 0);
			}
			else if (act == "state") {
				if (IsIconic(parentHwnd)) {
					cb->Success(CefString("min"));
				}
				else if (IsZoomed(parentHwnd)) {
					cb->Success(CefString("max"));
				}
				else {
					cb->Success(CefString("restore"));
				}
			}
			else if (act == "dragStart") {
				// 页面 mousedown 触发：启动 OS 标题栏式拖动循环，直接移动顶层窗口
				ReleaseCapture();
				POINT pt;
				GetCursorPos(&pt);
				SendMessage(parentHwnd, WM_NCLBUTTONDOWN, HTCAPTION, MAKELPARAM(pt.x, pt.y));
				cb->Success(CefString("ok"));
			}
			else {
				cb->Failure(-1, CefString("unknown action"));
			}
		};
		if (CefCurrentlyOn(TID_UI)) {
			handle(action, callback, browser);
		}
		else {
			CefPostTask(TID_UI, base::BindOnce(handle, action, callback, browser));
		}
		return true;
	}

	else if (function == "file") {
		return HandleFileQuery(browser, requestStr, callback);
	}

	else if (function == "dialog") {
		return HandleDialogQuery(browser, requestStr, callback);
	}

	// gsprocessor
	else if (function == "preproc") {
		return HandlePreprocessorQuery(browser, requestStr, callback);
	}

	// 3dgs
	else if (function == "recon") {
		return Handle3dgsQuery(browser, requestStr, callback);
	}

	// moter
	else if (function == "moter") {
		return HandleMoterQuery(browser, requestStr, callback);
	}
	else {
		HandleException("CefHandlerException", "failed to handle cef query \"" + function + "\"", true);
	}
	return false;
}

void CallJSFunction(CefRefPtr<CefBrowser> browser, std::string js) {

	// 检查是否在UI线程
	if (!CefCurrentlyOn(TID_UI)) {
		CefPostTask(TID_UI, base::BindOnce(&CallJSFunction, browser, js));
		return;
	}

	// 现在在UI线程，安全执行
	if (!browser || browser->IsSame(nullptr)) {
		return; // browser已无效
		HandleException("CefHandlerException", "failed to callback js function, no browser instance\nJS code:\n" + js, true);
	}

	// 获取当前页面的主框架（Main Frame）
	CefRefPtr<CefFrame> frame = browser->GetMainFrame();

	if (frame) {
		frame->ExecuteJavaScript(js, frame->GetURL(), 0);
	}
}
