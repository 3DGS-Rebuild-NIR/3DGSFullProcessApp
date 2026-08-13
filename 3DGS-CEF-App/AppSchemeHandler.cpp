#include "AppSchemeHandler.h"

#include "include/cef_parser.h"
#include "include/cef_response.h"
#include "include/wrapper/cef_stream_resource_handler.h"

#include <algorithm>
#include <cctype>
#include <string>
#include <windows.h>
#include <fstream>
#include <iomanip>

namespace {

	// 解密密钥
	const uint64_t key = 114514;


	std::string GetExeDir() {
		char exePath[MAX_PATH];
		GetModuleFileNameA(NULL, exePath, MAX_PATH);
		std::string exeDir(exePath);
		size_t pos = exeDir.find_last_of("\\/");
		if (pos != std::string::npos) exeDir = exeDir.substr(0, pos);
		return exeDir;
	}

	std::string GetMimeType(const std::string& path) {
		std::string ext;
		size_t pos = path.find_last_of('.');
		if (pos != std::string::npos) {
			ext = path.substr(pos);
			std::transform(ext.begin(), ext.end(), ext.begin(),
				[](unsigned char c) { return (char)::tolower(c); });
		}
		if (ext == ".html" || ext == ".htm") return "text/html";
		if (ext == ".js" || ext == ".mjs") return "text/javascript";
		if (ext == ".css") return "text/css";
		if (ext == ".json") return "application/json";
		if (ext == ".png") return "image/png";
		if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
		if (ext == ".gif") return "image/gif";
		if (ext == ".svg") return "image/svg+xml";
		if (ext == ".webp") return "image/webp";
		if (ext == ".ico") return "image/x-icon";
		if (ext == ".bmp") return "image/bmp";
		if (ext == ".woff") return "font/woff";
		if (ext == ".woff2") return "font/woff2";
		if (ext == ".ttf") return "font/ttf";
		if (ext == ".mp4") return "video/mp4";
		if (ext == ".wasm") return "application/wasm";
		if (ext == ".ply" || ext == ".bin" || ext == ".data") return "application/octet-stream";
		if (ext == ".txt") return "text/plain";
		if (ext == ".map") return "application/json";
		return "application/octet-stream";
	}

	bool ContainsTraversal(const std::string& path) {
		return path.find("..") != std::string::npos;
	}

	std::string PathHash(const std::string& path) {
		// 使用 FNV-1a 哈希算法（快速且简单）
		const uint64_t FNV_OFFSET_BASIS = 14695981039346656037ULL;
		const uint64_t FNV_PRIME = 1099511628211ULL;

		uint64_t hash = FNV_OFFSET_BASIS;
		for (char c : path) {
			hash ^= static_cast<uint64_t>(c);
			hash *= FNV_PRIME;
		}

		// 转为16进制字符串（取16位）
		std::stringstream ss;
		ss << std::hex << std::setfill('0') << std::setw(16) << hash;
		return ss.str();
	}

	std::vector<char> ReadFileDecrypt(const std::string& path) {
		std::string actualPath = path+".z9enc";

		// 打开文件
		std::ifstream file(actualPath, std::ios::binary | std::ios::ate);
		if (!file.is_open()) {
			// 如果哈希文件不存在，尝试原始路径
			file.open(path, std::ios::binary | std::ios::ate);
			if (!file.is_open()) {
				return {};
			}
			actualPath = path;
		}

		// 获取文件大小
		std::streamsize size = file.tellg();
		if (size <= 0) {
			return {};
		}

		file.seekg(0, std::ios::beg);

		// 读取文件数据
		std::vector<char> data(size);
		if (!file.read(reinterpret_cast<char*>(data.data()), size)) {
			return {};
		}
		file.close();
		// 解密数据
		uint64_t x = key + size;  // 初始值

		for (std::streamsize i = 0; i < size; ++i) {
			// 密钥流生成算法
			x ^= (x >> 29) & 0x5555555555555555ULL;
			x ^= (x << 17) & 0x71D67FFFEDA60000ULL;
			x ^= (x << 37) & 0xFFF7EEE000000000ULL;
			x ^= (x >> 43);
			x ^= i;

			data[i] ^= x;
		}


		return data;
	}

	// 手动百分号解码：解码所有 %XX（含 : / 等保留字符），
	// 不依赖 CefURIDecode 的规则集（UU_NORMAL 不解码保留字符，会留下 %2F/%3A）。
	std::string UrlDecode(const std::string& s) {
		auto HexVal = [](char c) -> int {
			if (c >= '0' && c <= '9') return c - '0';
			if (c >= 'a' && c <= 'f') return c - 'a' + 10;
			if (c >= 'A' && c <= 'F') return c - 'A' + 10;
			return -1;
		};
		std::string out;
		out.reserve(s.size());
		for (size_t i = 0; i < s.size(); ++i) {
			if (s[i] == '%' && i + 2 < s.size()) {
				int h = HexVal(s[i + 1]), l = HexVal(s[i + 2]);
				if (h >= 0 && l >= 0) {
					out += static_cast<char>((h << 4) | l);
					i += 2;
					continue;
				}
			}
			out += s[i];
		}
		return out;
	}

	// 将 app:// 请求映射为本地文件路径；失败返回空字符串。
	std::string MapUrlToFilePath(const CefString& url) {
		CefURLParts parts;
		if (!CefParseURL(url, parts)) return "";

		std::string path = CefString(&parts.path);
		std::string ext;
		size_t pos = path.find_last_of('.');
		if (pos != std::string::npos) {
			ext = path.substr(pos);
			std::transform(ext.begin(), ext.end(), ext.begin(),
				[](unsigned char c) { return (char)::tolower(c); });
		}

		if (path.empty() || path == "/") path = "/index.html";

		// /raw/<URL 编码的绝对路径> -> 任意本地文件
		if (path.compare(0, 5, "/raw/") == 0) {
			std::string abs = UrlDecode(path.substr(5));
			if (abs.empty() || ContainsTraversal(abs)) return "";
			//MessageBoxA(0, abs.c_str(), "Path", 0);
			return abs;
		}

		// 其它 -> <exeDir>/resources 目录
		if (path[0] == '/') path.erase(0, 1);
		std::replace(path.begin(), path.end(), '/', '\\');
		if (ContainsTraversal(path)) return "";

		std::string dir = GetExeDir();
		if (!dir.empty() && dir.back() != '\\') dir += '\\';
		return dir + "resources\\" + path;
	}

	bool IsResourcesPath(const CefString& url) {
		CefURLParts parts;
		if (!CefParseURL(url, parts)) return "";

		std::string path = CefString(&parts.path);
		std::string ext;
		size_t pos = path.find_last_of('.');
		if (pos != std::string::npos) {
			ext = path.substr(pos);
			std::transform(ext.begin(), ext.end(), ext.begin(),
				[](unsigned char c) { return (char)::tolower(c); });
		}

		if (path.empty() || path == "/") path = "/index.html";

		// /raw/<URL 编码的绝对路径> -> 任意本地文件
		if (path.compare(0, 5, "/raw/") == 0) {
			std::string abs = UrlDecode(path.substr(5));
			if (abs.empty() || ContainsTraversal(abs)) return "";
			//MessageBoxA(0, abs.c_str(), "Path", 0);
			return false;
		}
		return true;
	}

}  // namespace

CefRefPtr<CefResourceHandler> AppSchemeHandlerFactory::Create(
	CefRefPtr<CefBrowser> browser,
	CefRefPtr<CefFrame> frame,
	const CefString& scheme_name,
	CefRefPtr<CefRequest> request) {

	std::string filePath = MapUrlToFilePath(request->GetURL());
	if (filePath.empty()) return nullptr;

	CefRefPtr<CefStreamReader> stream;

	// 创建内存流（替代原来的文件流）
	if (IsResourcesPath(request->GetURL())) {
		std::vector<char> data = ReadFileDecrypt(filePath);
		if (data.empty()) return nullptr;

		stream = CefStreamReader::CreateForData(
			static_cast<void*>(data.data()),
			data.size() 
		);
	}
	else {
		stream = CefStreamReader::CreateForFile(filePath);
	}

	if (!stream) return nullptr;

	CefString mimeType(GetMimeType(filePath));

	CefResponse::HeaderMap headers;
	headers.insert(std::make_pair("Access-Control-Allow-Origin", "*"));

	return new CefStreamResourceHandler(200, "OK", mimeType, headers, stream);
}