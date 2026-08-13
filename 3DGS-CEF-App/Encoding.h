#pragma once
#include <string>

// std::string (UTF-8) -> std::wstring (UTF-16)
std::wstring utf8_to_wstring(const std::string& str);

// std::wstring (UTF-16) -> std::string (UTF-8)
std::string wstring_to_utf8(const std::wstring& wstr);

std::string Utf8ToLocal(const std::string& utf8Str);

std::string LocalToUtf8(const std::string& localStr);