#include "FileAPIHandler.h"
#include "Utils.h"          // Base64DecodeToString, Base64EncodeToString
#include <filesystem>
#include <fstream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <ctime>

namespace fs = std::filesystem;

// 将 filesystem::file_time_type 转换为 ISO8601 字符串
static std::string FileTimeToString(const fs::file_time_type& ftime) {
    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
        ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
    std::time_t tt = std::chrono::system_clock::to_time_t(sctp);
    std::tm tm = *std::localtime(&tt);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S");
    return oss.str();
}

bool HandleFileQuery(CefRefPtr<CefBrowser> browser,
    const std::string& request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {
    std::istringstream iss(request);
    std::string prefix;     // 原始请求中的 "file"
    std::string subcmd;
    iss >> prefix >> subcmd;

    // 便捷回复函数，成功或失败统一处理
    auto reply = [&callback](const std::string& msg, bool success = true) {
        if (success) callback->Success(msg);
        else callback->Failure(-1, msg);
        };

    try {
        if (subcmd == "read") {
            std::string pathB64;
            iss >> pathB64;
            std::string path = Base64DecodeToString(pathB64);
            std::ifstream f(path);
            if (!f.is_open()) {
                reply("Cannot open file: " + path, false);
                return true;
            }
            std::string content((std::istreambuf_iterator<char>(f)),
                std::istreambuf_iterator<char>());
            f.close();
            callback->Success(Base64EncodeToString(content));
            return true;
        }
        else if (subcmd == "write") {
            std::string pathB64, contentB64;
            iss >> pathB64 >> contentB64;
            std::string path = Base64DecodeToString(pathB64);
            std::string content = Base64DecodeToString(contentB64);
            std::ofstream f(path);
            if (!f.is_open()) {
                reply("Cannot write file: " + path, false);
                return true;
            }
            f << content;
            f.close();
            reply("success");
            return true;
        }
        else if (subcmd == "delete") {
            std::string pathB64;
            iss >> pathB64;
            std::string path = Base64DecodeToString(pathB64);
            std::error_code ec;
            bool removed = fs::remove(path, ec);
            if (removed) reply("success");
            else reply("Error: " + ec.message(), false);
            return true;
        }
        else if (subcmd == "mkdir") {
            std::string pathB64;
            iss >> pathB64;
            std::string path = Base64DecodeToString(pathB64);
            std::error_code ec;
            fs::create_directories(path, ec);
            // create_directories 返回 false 表示目录已存在，属于正常情况
            if (ec) reply("Error: " + ec.message(), false);
            else reply("success");
            return true;
        }
        else if (subcmd == "move") {
            std::string pathB64;
            std::string path2B64;
            iss >> pathB64;
            iss >> path2B64;
            std::string path = Base64DecodeToString(pathB64);
            std::string path2 = Base64DecodeToString(path2B64);
            std::error_code ec;
            fs::rename(path, path2);
            // create_directories 返回 false 表示目录已存在，属于正常情况
            if (ec) reply("Error: " + ec.message(), false);
            else reply("success");
            return true;
        }
        else if (subcmd == "copy") {
            std::string pathB64;
            std::string path2B64;
            iss >> pathB64;
            iss >> path2B64;
            std::string path = Base64DecodeToString(pathB64);
            std::string path2 = Base64DecodeToString(path2B64);
            std::error_code ec;
            fs::copy_file(path, path2);
            // create_directories 返回 false 表示目录已存在，属于正常情况
            if (ec) reply("Error: " + ec.message(), false);
            else reply("success");
            return true;
        }
        else if (subcmd == "exists") {
            std::string pathB64;
            iss >> pathB64;
            std::string path = Base64DecodeToString(pathB64);
            reply(fs::exists(path) ? "true" : "false");
            return true;
        }
        else if (subcmd == "list") {
            std::string pathB64;
            iss >> pathB64;
            std::string dirPath = Base64DecodeToString(pathB64);

            std::error_code ec;
            if (!fs::is_directory(dirPath, ec)) {
                reply("Not a directory or does not exist: " + dirPath, false);
                return true;
            }

            // 转义 JSON 字符串中的特殊字符（仅处理 " 和 \，这里文件名通常不会出现控制字符）
            auto escapeJson = [](const std::string& s) -> std::string {
                std::string out;
                for (char c : s) {
                    switch (c) {
                    case '"': out += "\\\""; break;
                    case '\\': out += "\\\\"; break;
                    default: out += c;
                    }
                }
                return out;
                };

            std::ostringstream json;
            json << "[";
            bool first = true;

            try {
                for (const auto& entry : fs::directory_iterator(dirPath, ec)) {
                    if (ec) break; // 遇到错误终止遍历
                    if (!first) json << ",";
                    first = false;

                    bool is_file = entry.is_regular_file(ec);
                    uintmax_t size = 0;
                    if (is_file && !ec) {
                        size = entry.file_size(ec);
                        if (ec) size = 0;
                    }

                    json << "{"
                        << "\"name\":\"" << escapeJson(entry.path().filename().string()) << "\","
                        << "\"is_file\":" << (is_file ? "true" : "false") << ","
                        << "\"size\":" << size
                        << "}";
                }
            }
            catch (const std::exception& e) {
                reply(std::string("Exception while listing directory: ") + e.what(), false);
                return true;
            }

            json << "]";
            reply(json.str());
            return true;
        }
        else if (subcmd == "stat") {
            std::string pathB64;
            iss >> pathB64;
            std::string path = Base64DecodeToString(pathB64);
            std::error_code ec;
            bool exists = fs::exists(path);
            bool is_file = fs::is_regular_file(path, ec);
            bool is_dir = fs::is_directory(path, ec);
            uintmax_t size = 0;
            std::string mtime = "";
            if (exists && !ec) {
                size = fs::file_size(path, ec);
                auto ftime = fs::last_write_time(path, ec);
                if (!ec) mtime = FileTimeToString(ftime);
            }
            std::ostringstream json;
            json << "{"
                << "\"exists\":" << (exists ? "true" : "false") << ","
                << "\"is_file\":" << (is_file ? "true" : "false") << ","
                << "\"is_directory\":" << (is_dir ? "true" : "false") << ","
                << "\"size\":" << size << ","
                << "\"last_modified\":\"" << mtime << "\""
                << "}";
            reply(json.str());
            return true;
        }
        else {
            reply("Unknown file subcommand: " + subcmd, false);
            return true;
        }
    }
    catch (const std::exception& e) {
        reply(std::string("Exception: ") + e.what(), false);
        return true;
    }
}