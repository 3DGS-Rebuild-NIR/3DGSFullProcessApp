#pragma once
#include "include/cef_browser.h"
#include "include/wrapper/cef_message_router.h"

// 处理 file 相关的 CEF 查询，返回 true 表示已处理
bool HandleFileQuery(CefRefPtr<CefBrowser> browser,
    const std::string& request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);