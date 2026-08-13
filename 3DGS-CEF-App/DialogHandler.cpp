#include "DialogHandler.h"
#include "Utils.h"          // Base64EncodeToString
#include "include/cef_app.h"
#include "include/wrapper/cef_closure_task.h"
#include "include/base/cef_bind.h"
#include "include/base/cef_callback.h"
#include <sstream>
#include <vector>
#include <string>

namespace {

    // 对话框回调：在用户完成选择后唤醒原来的 callback
    class DialogCallback : public CefRunFileDialogCallback {
    public:
        DialogCallback(CefRefPtr<CefMessageRouterBrowserSide::Callback> callback)
            : callback_(callback) {
        }

        void OnFileDialogDismissed(
            const std::vector<CefString>& file_paths) override {
            if (!callback_)
                return;

            // 用户取消选择 -> 返回空字符串（前端判断为 null）
            if (file_paths.empty()) {
                callback_->Success("");
            }
            else {
                // 只处理第一个文件（如需多选可扩展）
                callback_->Success(Base64EncodeToString(file_paths[0].ToString()));
            }
        }

    private:
        CefRefPtr<CefMessageRouterBrowserSide::Callback> callback_;
        IMPLEMENT_REFCOUNTING(DialogCallback);
    };

    // 解析过滤器字符串，例如 "图像文件|*.png;*.jpg"
    // 前端可选传递，格式为 "描述|扩展名1;扩展名2"
    std::vector<CefString> ParseFilter(const std::string& filter_str) {
        std::vector<CefString> filters;
        if (filter_str.empty()) {
            // 默认所有文件
            filters.push_back("所有文件|*.*");
            return filters;
        }
        // 简单拆分，支持多个过滤器用 "||" 连接，例如
        // "图片|*.png;*.jpg||视频|*.mp4"
        std::istringstream group_iss(filter_str);
        std::string group;
        while (std::getline(group_iss, group, '|')) { // 注意这里用单竖线做组分隔需修改
            // 实际上 Cef 的 filter 格式是 "描述|模式" 整体为一个 string
            // 这里我们假设前端传入的是完整字符串，直接放入
        }
        // 为简化，直接按原样存入（前端需按 CEF 格式构造）
        filters.push_back(filter_str);
        return filters;
    }

} // anonymous namespace

bool HandleDialogQuery(CefRefPtr<CefBrowser> browser,
    const std::string& request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {
    // 必须在 UI 线程调用 RunFileDialog
    if (!CefCurrentlyOn(TID_UI)) {
        CefPostTask(TID_UI, base::BindOnce(
            [](CefRefPtr<CefBrowser> browser, std::string request,
                CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {
                    HandleDialogQuery(browser, request, callback);
            }, browser, request, callback));
        return true; // 已经投递，原调用返回
    }

    std::istringstream iss(request);
    std::string prefix;     // "dialog"
    std::string subcmd;
    iss >> prefix >> subcmd;

    // 准备对话框参数
    CefBrowserHost::FileDialogMode mode;
    std::string title = "选择文件";
    std::string default_file;
    std::string filter_str = "所有文件|*.*"; // 默认

    // 解析子命令及可能的额外参数（格式：subcmd title_b64 filter_b64）
    if (subcmd == "openFile") {
        mode = FILE_DIALOG_OPEN;
    }
    else if (subcmd == "saveFile") {
        mode = FILE_DIALOG_SAVE;
        // 可带默认文件名
        std::string defaultB64;
        if (iss >> defaultB64) {
            default_file = Base64DecodeToString(defaultB64);
        }
    }
    else if (subcmd == "pickDir") {
        mode = FILE_DIALOG_OPEN_FOLDER;
        title = "选择文件夹";
    }
    else {
        callback->Failure(-1, "Unknown dialog subcommand: " + subcmd);
        return true;
    }

    // 通用可选参数：标题、过滤器（均为 Base64 编码）
    std::string titleB64, filterB64;
    if (iss >> titleB64) {
        title = Base64DecodeToString(titleB64);
    }
    if (iss >> filterB64) {
        filter_str = Base64DecodeToString(filterB64);
    }

    // 解析过滤器列表（CEF 要求 vector<CefString>）
    std::vector<CefString> filters;
    // 支持用 "||" 分割多个过滤器组，例如 "图片|*.png;*.jpg||视频|*.mp4"
    {
        std::istringstream filter_stream(filter_str);
        std::string single_filter;
        while (std::getline(filter_stream, single_filter, '|')) {
            // 注意：此处简化处理，实际应按双竖线分隔，这里假设单竖线不用于分隔
        }
        // 改为按双竖线分隔
        size_t pos = 0;
        std::string token;
        std::string delim = "||";
        std::string str = filter_str;
        while ((pos = str.find(delim)) != std::string::npos) {
            token = str.substr(0, pos);
            if (!token.empty()) filters.push_back(token);
            str.erase(0, pos + delim.length());
        }
        if (!str.empty()) filters.push_back(str);
    }
    if (filters.empty()) {
        filters.push_back("所有文件|*.*");
    }

    // 调用系统对话框
    browser->GetHost()->RunFileDialog(
        mode,
        title,
        default_file,
        filters,
        new DialogCallback(callback)
    );

    return true; // 已接管，异步回调中会调用 callback
}