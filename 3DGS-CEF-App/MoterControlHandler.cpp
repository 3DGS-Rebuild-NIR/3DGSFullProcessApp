#include "MotorControlHandler.h"
#include "CefHandler.h"
#include "Utils.h"
#include "ExceptionHandler.h"
#include "MotorController.h"
#include <sstream>
#include <mutex>
#include <memory>

static std::mutex g_motorMutex;
static std::unique_ptr<MotorController> g_motorController = nullptr;
static bool g_motorLock = false;

bool HandleMoterQuery(CefRefPtr<CefBrowser> browser, std::string request,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) {

    // 防止重复调用
    if (g_motorLock) {
        HandleException("MotorControllerException", "HandleMoterQuery was running with thread lock.", true);
        return false;
    }

    //std::lock_guard<std::mutex> lock(g_motorMutex);
    //g_motorLock = true;

    std::istringstream iss(request);
    std::string processorName;
    std::string function;
    iss >> processorName; // moter
    iss >> function; // func

    bool result = false;
    std::string response;

    try {
        // 初始化电机控制器（如果未初始化）
        if (!g_motorController) {
            g_motorController = std::make_unique<MotorController>();

            // 设置状态回调
            g_motorController->setStatusCallback([&](const std::string& status) {
                UpdateMotorStatus(browser, status);
                });

            // 设置限位回调
            g_motorController->setLimitCallback([&](LimitType type, const std::string& info) {
                std::string limitType;
                switch (type) {
                case LimitType::TOP: limitType = "top"; break;
                case LimitType::BOTTOM: limitType = "bottom"; break;
                case LimitType::UNKNOWN: limitType = "unknown"; break;
                default: limitType = "none"; break;
                }
                UpdateMotorLimit(browser, limitType, info);
                });
        }

        // 处理各个功能函数
        if (function == "connect") {
            std::string port;
            int baudrate = 9600;
            iss >> port;
            port = Base64DecodeToString(port);
            if (!(iss >> baudrate)) {
                baudrate = 9600; // 默认波特率
            }

            result = g_motorController->connect(port, baudrate);
            if (result) {
                response = "Connected to " + port + " at " + std::to_string(baudrate) + " baud";
            }
            else {
                response = "Failed to connect to " + port;
            }
        }
        else if (function == "disconnect") {
            g_motorController->disconnect();
            result = true;
            response = "Disconnected";
        }
        else if (function == "isConnected") {
            response = g_motorController->isConnected() ? "true" : "false";
            result = true;
        }
        else if (function == "scanPorts") {
            std::vector<std::string> ports = MotorController::scanPorts();
            // 将端口列表编码为JSON数组
            std::string json = "[";
            for (size_t i = 0; i < ports.size(); ++i) {
                if (i > 0) json += ",";
                json += "\"" + ports[i] + "\"";
            }
            json += "]";
            response = Base64EncodeToString(json);
            result = true;
        }
        //下面的方法如果没有连接都拒绝执行
        else if (!g_motorController->isConnected()) {
            HandleException("MoterControllerException", "Moter cannot be used if isn't connected.", true);
        }
        else if (function == "setStepperRPM") {
            int rpm;
            iss >> rpm;
            result = g_motorController->setStepperRPM(rpm);
            if (result) {
                response = "Stepper RPM set to " + std::to_string(rpm);
            }
        }
        else if (function == "setStepperDirection") {
            int dir;
            iss >> dir;
            Direction direction = (dir == 0) ? Direction::FORWARD : Direction::BACKWARD;
            result = g_motorController->setStepperDirection(direction);
            if (result) {
                response = "Stepper direction set to " + std::string(dir == 0 ? "forward" : "backward");
            }
        }
        else if (function == "startStepper") {
            result = g_motorController->startStepper();
            if (result) {
                response = "Stepper started";
            }
        }
        else if (function == "stopStepper") {
            result = g_motorController->stopStepper();
            if (result) {
                response = "Stepper stopped";
            }
        }
        else if (function == "isStepperRunning") {
            response = g_motorController->isStepperRunning() ? "true" : "false";
            result = true;
        }
        else if (function == "setDCSpeed") {
            int pwm;
            iss >> pwm;
            result = g_motorController->setDCSpeed(pwm);
            if (result) {
                response = "DC speed set to " + std::to_string(pwm);
            }
        }
        else if (function == "setDCDirection") {
            int dir;
            iss >> dir;
            Direction direction = (dir == 0) ? Direction::FORWARD : Direction::BACKWARD;
            result = g_motorController->setDCDirection(direction);
            if (result) {
                response = "DC direction set to " + std::string(dir == 0 ? "forward" : "backward");
            }
        }
        else if (function == "startDC") {
            result = g_motorController->startDC();
            if (result) {
                response = "DC motor started";
            }
        }
        else if (function == "stopDC") {
            result = g_motorController->stopDC();
            if (result) {
                response = "DC motor stopped";
            }
        }
        else if (function == "isDCRunning") {
            response = g_motorController->isDCRunning() ? "true" : "false";
            result = true;
        }
        else if (function == "startAutoTest") {
            int rpm;
            iss >> rpm;
            result = g_motorController->startAutoTest(rpm);
            if (result) {
                response = "Auto test started with RPM: " + std::to_string(rpm);
            }
        }
        else if (function == "stopAutoTest") {
            result = g_motorController->stopAutoTest();
            if (result) {
                response = "Auto test stopped";
            }
        }
        else if (function == "isAutoTestRunning") {
            response = g_motorController->isAutoTestRunning() ? "true" : "false";
            result = true;
        }
        else if (function == "getLastTravelTime") {
            double travelTime = g_motorController->getLastTravelTime();
            response = std::to_string(travelTime);
            result = true;
        }
        else if (function == "startBoth") {
            result = g_motorController->startBoth();
            if (result) {
                response = "Both motors started";
            }
        }
        else if (function == "stopBoth") {
            result = g_motorController->stopBoth();
            if (result) {
                response = "Both motors stopped";
            }
        }
        else if (function == "sendCommand") {
            std::string cmd;
            iss >> cmd;
            cmd = Base64DecodeToString(cmd);
            result = g_motorController->sendCommand(cmd);
            if (result) {
                response = "Command sent: " + cmd;
            }
        }
        else if (function == "getStatus") {
            // 获取当前状态信息
            std::string status = "Connected: " + std::string(g_motorController->isConnected() ? "Yes" : "No") +
                ", Stepper: " + std::string(g_motorController->isStepperRunning() ? "Running" : "Stopped") +
                ", DC: " + std::string(g_motorController->isDCRunning() ? "Running" : "Stopped") +
                ", AutoTest: " + std::string(g_motorController->isAutoTestRunning() ? "Running" : "Stopped");
            response = Base64EncodeToString(status);
            result = true;
        }
        else {
            HandleException("MotorControllerException", "Unknown motor function: " + function, true);
            result = false;
        }
    }
    catch (const std::exception& e) {
        HandleException("MotorControllerException", std::string("Motor controller exception: ") + e.what(), true);
        result = false;
    }


    if (result) {
        callback->Success(CefString(response));
    }
    else {
        callback->Success(CefString(""));
    }
    return true;
}

void UpdateMotorStatus(CefRefPtr<CefBrowser> browser, const std::string& status) {
    std::string encodedStatus = Base64EncodeToString(status);
    CallJSFunction(browser, "updateMotorStatus('" + encodedStatus + "')");
}

void UpdateMotorLimit(CefRefPtr<CefBrowser> browser, const std::string& type, const std::string& info) {
    std::string encodedInfo = Base64EncodeToString(info);
    CallJSFunction(browser, "updateMotorLimit('" + type + "', '" + encodedInfo + "')");
}