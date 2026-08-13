//PreprocessorHandler.h
#pragma once

#include "include/cef_browser.h"
#include "include/wrapper/cef_message_router.h"

bool HandlePreprocessorQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);

void UpdateUIOutput(CefRefPtr<CefBrowser> browser, std::string msg);