#pragma once

#include <include/cef_browser.h>
#include <include/wrapper/cef_message_router.h>

// 处理电机控制相关的CEF查询
bool HandleMoterQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);

// 更新电机状态到UI
void UpdateMotorStatus(CefRefPtr<CefBrowser> browser, const std::string& status);

// 更新电机限位触发到UI
void UpdateMotorLimit(CefRefPtr<CefBrowser> browser, const std::string& type, const std::string& info);