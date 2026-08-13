#include "Encoding.h"
#include <Windows.h>


// std::string (UTF-8) -> std::wstring (UTF-16)
std::wstring utf8_to_wstring(const std::string& str) {
    if (str.empty()) return std::wstring();

    int size_needed = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

// std::wstring (UTF-16) -> std::string (UTF-8)
std::string wstring_to_utf8(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();

    int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

// 将 UTF-8 字符串转换为当前系统本地编码（ANSI）
std::string Utf8ToAnsi(const std::string& utf8Str) {
    if (utf8Str.empty()) return {};

    // 1. UTF-8 -> UTF-16
    int wideLen = MultiByteToWideChar(CP_UTF8, 0, utf8Str.c_str(), -1, nullptr, 0);
    if (wideLen == 0) return utf8Str; // 转换失败，返回原串

    std::wstring wideStr(wideLen, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8Str.c_str(), -1, &wideStr[0], wideLen);

    // 2. UTF-16 -> ANSI (CP_ACP)
    int ansiLen = WideCharToMultiByte(CP_ACP, 0, wideStr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (ansiLen == 0) return utf8Str;

    std::string ansiStr(ansiLen, '\0');
    WideCharToMultiByte(CP_ACP, 0, wideStr.c_str(), -1, &ansiStr[0], ansiLen, nullptr, nullptr);

    // 去除末尾多余的 null 字符（-1 长度会包含结束符）
    ansiStr.resize(ansiLen - 1);
    return ansiStr;
}

std::string Utf8ToLocal(const std::string& utf8Str) {
#ifdef _WIN32
    return utf8Str;
    return Utf8ToAnsi(utf8Str);
#else
    return utf8Str; // Linux/macOS 通常就是 UTF-8
#endif
}

#ifdef _WIN32
#include <windows.h>

std::string AnsiToUtf8(const std::string& ansiStr) {
    if (ansiStr.empty()) return {};

    // 1. ANSI (CP_ACP) -> UTF-16
    int wideLen = MultiByteToWideChar(CP_ACP, 0, ansiStr.c_str(), -1, nullptr, 0);
    if (wideLen == 0) return ansiStr;

    std::wstring wideStr(wideLen, L'\0');
    MultiByteToWideChar(CP_ACP, 0, ansiStr.c_str(), -1, &wideStr[0], wideLen);

    // 2. UTF-16 -> UTF-8
    int utf8Len = WideCharToMultiByte(CP_UTF8, 0, wideStr.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (utf8Len == 0) return ansiStr;

    std::string utf8Str(utf8Len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wideStr.c_str(), -1, &utf8Str[0], utf8Len, nullptr, nullptr);

    // 去除末尾 null 字符
    utf8Str.resize(utf8Len - 1);
    return utf8Str;
}
#endif

// 统一接口，跨平台
std::string LocalToUtf8(const std::string& localStr) {
#ifdef _WIN32
    return localStr;
    return AnsiToUtf8(localStr);
#else
    // Linux/macOS 等系统默认本地编码通常就是 UTF-8，直接返回即可
    return localStr;
#endif
}