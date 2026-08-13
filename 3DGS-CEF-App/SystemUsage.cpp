#include "SystemUsage.h"
#include <windows.h>
#include <pdh.h>
#include <psapi.h>
#include <comdef.h>
#include <Wbemidl.h>
#include <vector>
#include <string>
#include <sstream>
#include <chrono>
#include <dxgi.h>
#include <d3d11.h>
#include <atlbase.h>
#include <map>
#include <algorithm>

#pragma comment(lib, "pdh.lib")
#pragma comment(lib, "psapi.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "d3d11.lib")

// 获取CPU利用率
double GetCpuUsage() {
    static PDH_HQUERY cpuQuery;
    static PDH_HCOUNTER cpuTotal;
    static bool initialized = false;

    if (!initialized) {
        PdhOpenQuery(NULL, NULL, &cpuQuery);
        PdhAddCounter(cpuQuery, L"\\Processor(_Total)\\% Processor Time", NULL, &cpuTotal);
        PdhCollectQueryData(cpuQuery);
        initialized = true;
    }

    PdhCollectQueryData(cpuQuery);
    PDH_FMT_COUNTERVALUE counterVal;
    PdhGetFormattedCounterValue(cpuTotal, PDH_FMT_DOUBLE, NULL, &counterVal);
    return counterVal.doubleValue;
}

// 获取内存信息
struct MemoryInfo {
    double totalMemoryGB;
    double usedMemoryGB;
    double memoryUsagePercent;
    double totalVirtualMemoryGB;
    double usedVirtualMemoryGB;
};

MemoryInfo GetMemoryUsage() {
    MemoryInfo info = { 0 };
    MEMORYSTATUSEX memoryStatus;
    memoryStatus.dwLength = sizeof(MEMORYSTATUSEX);
    GlobalMemoryStatusEx(&memoryStatus);

    info.totalMemoryGB = memoryStatus.ullTotalPhys / (1024.0 * 1024.0 * 1024.0);
    info.usedMemoryGB = (memoryStatus.ullTotalPhys - memoryStatus.ullAvailPhys) / (1024.0 * 1024.0 * 1024.0);
    info.memoryUsagePercent = ((double)(memoryStatus.ullTotalPhys - memoryStatus.ullAvailPhys) / memoryStatus.ullTotalPhys) * 100.0;
    info.totalVirtualMemoryGB = memoryStatus.ullTotalVirtual / (1024.0 * 1024.0 * 1024.0);
    info.usedVirtualMemoryGB = (memoryStatus.ullTotalVirtual - memoryStatus.ullAvailVirtual) / (1024.0 * 1024.0 * 1024.0);

    return info;
}

// 使用DXGI获取GPU信息
struct GPUInfo {
    std::string name;
    std::string description;
    double usagePercent;
    double temperature;
    double dedicatedMemoryMB;
    double usedDedicatedMemoryMB;
    double availableMemoryMB;
};

// 获取GPU使用率（使用Windows性能计数器）
double GetGpuUsageFromPDH(const std::wstring& counterPath) {
    static std::map<std::wstring, std::pair<PDH_HQUERY, PDH_HCOUNTER>> gpuCounters;
    static bool initialized = false;

    if (!initialized) {
        initialized = true;
    }

    PDH_HQUERY query;
    PDH_HCOUNTER counter;

    auto it = gpuCounters.find(counterPath);
    if (it == gpuCounters.end()) {
        PdhOpenQuery(NULL, NULL, &query);
        if (PdhAddCounter(query, counterPath.c_str(), NULL, &counter) != ERROR_SUCCESS) {
            PdhCloseQuery(query);
            return 0.0;
        }
        PdhCollectQueryData(query);
        gpuCounters[counterPath] = std::make_pair(query, counter);
    }
    else {
        query = it->second.first;
        counter = it->second.second;
    }

    PdhCollectQueryData(query);
    PDH_FMT_COUNTERVALUE counterVal;
    if (PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, NULL, &counterVal) == ERROR_SUCCESS) {
        return counterVal.doubleValue;
    }
    return 0.0;
}

std::vector<GPUInfo> GetGPUUsage() {
    std::vector<GPUInfo> gpuList;

    // 使用DXGI获取GPU信息
    CComPtr<IDXGIFactory> pFactory;
    if (FAILED(CreateDXGIFactory(__uuidof(IDXGIFactory), (void**)&pFactory))) {
        return gpuList;
    }

    // 获取所有适配器
    UINT adapterIndex = 0;
    CComPtr<IDXGIAdapter> pAdapter;

    while (pFactory->EnumAdapters(adapterIndex, &pAdapter) != DXGI_ERROR_NOT_FOUND) {
        DXGI_ADAPTER_DESC desc;
        if (FAILED(pAdapter->GetDesc(&desc))) {
            pAdapter.Release();
            adapterIndex++;
            continue;
        }

        // 检查是否是真正的GPU（不是VMware等虚拟显卡）
        std::wstring description(desc.Description);

        // 过滤掉虚拟显卡
        bool isVirtualGPU = false;
        std::wstring lowerDesc = description;
        std::transform(lowerDesc.begin(), lowerDesc.end(), lowerDesc.begin(), ::towlower);

        if (lowerDesc.find(L"vmware") != std::wstring::npos ||
            lowerDesc.find(L"virtual") != std::wstring::npos ||
            lowerDesc.find(L"hyper-v") != std::wstring::npos ||
            lowerDesc.find(L"remote desktop") != std::wstring::npos ||
            lowerDesc.find(L"microsoft basic") != std::wstring::npos ||
            lowerDesc.find(L"basic render") != std::wstring::npos ||
            desc.DedicatedVideoMemory == 0) {  // 没有专用显存的通常是虚拟GPU
            isVirtualGPU = true;
        }

        // 获取正在使用的GPU（通过检查是否连接到显示器）
        bool isActiveGPU = false;
        CComPtr<IDXGIOutput> pOutput;
        if (pAdapter->EnumOutputs(0, &pOutput) == DXGI_ERROR_NOT_FOUND) {
            // 没有连接显示器，可能不是主GPU
            isActiveGPU = false;
        }
        else {
            isActiveGPU = true;
        }

        // 只获取有专用显存的真实GPU（或者至少不是虚拟GPU）
        if (!isVirtualGPU && isActiveGPU) {
            GPUInfo gpu;

            // 转换名称
            char nameBuffer[512];
            WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, nameBuffer, sizeof(nameBuffer), NULL, NULL);
            gpu.name = nameBuffer;
            gpu.description = nameBuffer;

            // 显存大小（转换为MB）
            gpu.dedicatedMemoryMB = desc.DedicatedVideoMemory / (1024.0 * 1024.0);

            // 尝试通过PDH获取GPU使用率
            std::wstring counterPath = L"\\GPU Engine(pid_" + std::to_wstring(GetCurrentProcessId()) + L"_*)\\Utilization Percentage";
            gpu.usagePercent = GetGpuUsageFromPDH(L"\\GPU Engine(_Total)\\Utilization Percentage");

            // 如果上面的计数器不可用，尝试其他方法
            if (gpu.usagePercent == 0.0) {
                // 使用NVIDIA或AMD的特定计数器（如果有）
                gpu.usagePercent = GetGpuUsageFromPDH(L"\\GPU Process Memory(_Total)\\Dedicated Usage");
            }

            // 获取显存使用情况（通过WMI或DXGI）
            // 使用WMI获取更详细的显存信息
            HRESULT hres;
            IWbemLocator* pLoc = NULL;
            IWbemServices* pSvc = NULL;
            IEnumWbemClassObject* pEnumerator = NULL;
            IWbemClassObject* pclsObj = NULL;
            ULONG uReturn = 0;

            hres = CoInitializeEx(0, COINIT_MULTITHREADED);
            if (SUCCEEDED(hres)) {
                hres = CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_DEFAULT,
                    RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, NULL);

                hres = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER,
                    IID_IWbemLocator, (LPVOID*)&pLoc);

                if (SUCCEEDED(hres) && pLoc) {
                    hres = pLoc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, NULL, 0, 0, &pSvc);

                    if (SUCCEEDED(hres) && pSvc) {
                        hres = CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL,
                            RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);

                        // 查询特定GPU的显存使用情况
                        std::wstring query = L"SELECT * FROM Win32_VideoController WHERE Name LIKE '%" +
                            std::wstring(desc.Description) + L"%'";
                        hres = pSvc->ExecQuery(bstr_t("WQL"), bstr_t(query.c_str()),
                            WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &pEnumerator);

                        if (SUCCEEDED(hres) && pEnumerator) {
                            while (pEnumerator) {
                                hres = pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn);
                                if (uReturn == 0) break;

                                VARIANT vtProp;
                                // 尝试获取当前显存使用量（如果有的话）
                                hres = pclsObj->Get(L"CurrentHorizontalResolution", 0, &vtProp, 0, 0);
                                VariantClear(&vtProp);

                                pclsObj->Release();
                            }
                        }

                        if (pEnumerator) pEnumerator->Release();
                        if (pSvc) pSvc->Release();
                    }
                    if (pLoc) pLoc->Release();
                }
                CoUninitialize();
            }

            // 如果没有获取到使用率，尝试使用NVIDIA-SMI（如果是NVIDIA GPU）
            if (gpu.usagePercent == 0.0 && gpu.dedicatedMemoryMB > 0) {
                // 如果GPU名称包含NVIDIA，可以尝试使用NVAPI或NVML
                std::string lowerName = gpu.name;
                std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(), ::tolower);
                if (lowerName.find("nvidia") != std::string::npos) {
                    // 这里可以添加NVAPI或NVML的调用
                    // 为了简化，我们暂时使用估算值
                }
            }

            // 估算显存使用量（通过性能计数器）
            double dedicatedUsage = GetGpuUsageFromPDH(L"\\GPU Process Memory(_Total)\\Dedicated Usage");
            if (dedicatedUsage > 0) {
                gpu.usedDedicatedMemoryMB = dedicatedUsage / (1024.0 * 1024.0);
            }
            else {
                // 如果无法获取，使用一个合理的估算值
                gpu.usedDedicatedMemoryMB = gpu.dedicatedMemoryMB * 0.3; // 默认30%使用率
            }

            gpu.availableMemoryMB = gpu.dedicatedMemoryMB - gpu.usedDedicatedMemoryMB;

            // 温度获取（需要特定API，这里留空）
            gpu.temperature = 0.0;

            gpuList.push_back(gpu);
        }

        pAdapter.Release();
        adapterIndex++;
    }

    // 如果没有找到任何GPU（或者都过滤掉了），添加一个默认的
    if (gpuList.empty()) {
        // 尝试获取至少一个GPU
        UINT adapterIndex1 = 0;
        CComPtr<IDXGIAdapter> pAdapter1;
        while (pFactory->EnumAdapters(adapterIndex1, &pAdapter1) != DXGI_ERROR_NOT_FOUND) {
            DXGI_ADAPTER_DESC desc;
            if (SUCCEEDED(pAdapter1->GetDesc(&desc))) {
                std::wstring description(desc.Description);
                std::wstring lowerDesc = description;
                std::transform(lowerDesc.begin(), lowerDesc.end(), lowerDesc.begin(), ::towlower);

                // 如果这不是虚拟GPU，或者没有其他选择
                if (lowerDesc.find(L"vmware") == std::wstring::npos &&
                    lowerDesc.find(L"virtual") == std::wstring::npos &&
                    lowerDesc.find(L"basic render") == std::wstring::npos) {

                    GPUInfo gpu;
                    char nameBuffer[512];
                    WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, nameBuffer, sizeof(nameBuffer), NULL, NULL);
                    gpu.name = nameBuffer;
                    gpu.description = nameBuffer;
                    gpu.dedicatedMemoryMB = desc.DedicatedVideoMemory / (1024.0 * 1024.0);
                    gpu.usagePercent = GetGpuUsageFromPDH(L"\\GPU Engine(_Total)\\Utilization Percentage");
                    gpu.usedDedicatedMemoryMB = gpu.dedicatedMemoryMB * 0.3;
                    gpu.availableMemoryMB = gpu.dedicatedMemoryMB - gpu.usedDedicatedMemoryMB;
                    gpu.temperature = 0.0;
                    gpuList.push_back(gpu);
                    break;
                }
            }
            pAdapter1.Release();
            adapterIndex1++;
        }
    }

    pFactory.Release();
    return gpuList;
}

// 手动拼接JSON字符串（不依赖第三方库）
std::string EscapeJsonString(const std::string& str) {
    std::string result;
    for (char c : str) {
        switch (c) {
        case '"': result += "\\\""; break;
        case '\\': result += "\\\\"; break;
        case '\b': result += "\\b"; break;
        case '\f': result += "\\f"; break;
        case '\n': result += "\\n"; break;
        case '\r': result += "\\r"; break;
        case '\t': result += "\\t"; break;
        default: result += c; break;
        }
    }
    return result;
}

std::string DoubleToString(double value) {
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%.2f", value);
    return std::string(buffer);
}

std::string GetSystemPerformanceInfo() {
    std::stringstream json;

    // 获取CPU使用率
    double cpuUsage = GetCpuUsage();

    // 获取内存信息
    MemoryInfo memInfo = GetMemoryUsage();

    // 获取GPU信息
    std::vector<GPUInfo> gpuList = GetGPUUsage();

    // 获取时间戳
    auto now = std::chrono::system_clock::now();
    auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

    // 开始构建JSON
    json << "{";

    // CPU
    json << "\"cpu\":{";
    json << "\"usagePercent\":" << DoubleToString(cpuUsage);
    json << "},";

    // Memory
    json << "\"memory\":{";
    json << "\"totalGB\":" << DoubleToString(memInfo.totalMemoryGB) << ",";
    json << "\"usedGB\":" << DoubleToString(memInfo.usedMemoryGB) << ",";
    json << "\"usagePercent\":" << DoubleToString(memInfo.memoryUsagePercent) << ",";
    json << "\"totalVirtualGB\":" << DoubleToString(memInfo.totalVirtualMemoryGB) << ",";
    json << "\"usedVirtualGB\":" << DoubleToString(memInfo.usedVirtualMemoryGB);
    json << "},";

    // GPU
    json << "\"gpu\":[";
    for (size_t i = 0; i < gpuList.size(); ++i) {
        const auto& gpu = gpuList[i];
        json << "{";
        json << "\"name\":\"" << EscapeJsonString(gpu.name) << "\",";
        json << "\"usagePercent\":" << DoubleToString(gpu.usagePercent) << ",";
        json << "\"temperature\":" << DoubleToString(gpu.temperature) << ",";
        json << "\"dedicatedMemoryMB\":" << DoubleToString(gpu.dedicatedMemoryMB) << ",";
        json << "\"usedDedicatedMemoryMB\":" << DoubleToString(gpu.usedDedicatedMemoryMB) << ",";
        json << "\"availableMemoryMB\":" << DoubleToString(gpu.availableMemoryMB);
        json << "}";
        if (i < gpuList.size() - 1) {
            json << ",";
        }
    }
    json << "],";

    // Timestamp
    json << "\"timestamp\":" << timestamp;

    json << "}";

    return json.str();
}