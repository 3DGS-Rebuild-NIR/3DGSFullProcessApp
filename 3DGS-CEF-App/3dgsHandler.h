#pragma once
#include <include/cef_browser.h>
#include <include/wrapper/cef_message_router.h>


bool Handle3dgsQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);

void Update3DGSOutput(CefRefPtr<CefBrowser> browser, std::string msg);