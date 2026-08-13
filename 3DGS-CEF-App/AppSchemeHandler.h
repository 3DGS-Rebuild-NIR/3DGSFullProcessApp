#pragma once
#include "include/cef_scheme.h"

// app:// 自定义 scheme 处理器
//   app://localhost/<path>      -> <exeDir>/resources/<path>（前端资源）
//   app://localhost/raw/<enc>   -> <enc>（URL 编码的任意本地绝对路径，用于图片/PLY 等）
class AppSchemeHandlerFactory : public CefSchemeHandlerFactory {
public:
	CefRefPtr<CefResourceHandler> Create(CefRefPtr<CefBrowser> browser,
		CefRefPtr<CefFrame> frame,
		const CefString& scheme_name,
		CefRefPtr<CefRequest> request) override;

private:
	IMPLEMENT_REFCOUNTING(AppSchemeHandlerFactory);
};
