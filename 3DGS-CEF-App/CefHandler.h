#pragma once

#include <windows.h>
#include "include/cef_app.h"
#include "include/cef_client.h"
#include "include/cef_browser.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_request_handler.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_message_router.h"

bool HandleCefQuery(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& request, bool persistent,
	CefRefPtr<CefMessageRouterBrowserSide::Callback> callback);

void CallJSFunction(CefRefPtr<CefBrowser> browser, std::string js);
