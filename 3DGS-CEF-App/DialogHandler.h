#pragma once
#include "include/cef_browser.h"
#include "include/wrapper/cef_message_router.h"

// 处理 dialog 前缀的 CEF 查询，返回 true 表示已处理
bool HandleDialogQuery(CefRefPtr<CefBrowser> browser,
    const std::string& request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);