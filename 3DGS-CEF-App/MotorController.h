// MotorController.h
#pragma once

#include <string>
#include <thread>
#include <mutex>
#include <functional>
#include <chrono>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <termios.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#endif

enum class Direction {
    FORWARD,
    BACKWARD
};

enum class LimitType {
    NONE,
    TOP,
    BOTTOM,
    UNKNOWN
};

using LimitCallback = std::function<void(LimitType, const std::string&)>;
using StatusCallback = std::function<void(const std::string&)>;

class MotorController {
public:
    MotorController();
    ~MotorController();

    // 串口操作
    bool connect(const std::string& port, int baudrate = 9600);
    void disconnect();
    bool isConnected() const;

    // 扫描可用串口
    static std::vector<std::string> scanPorts();

    // 步进电机控制
    bool setStepperRPM(int rpm);
    bool setStepperDirection(Direction dir);
    bool startStepper();
    bool stopStepper();
    bool isStepperRunning() const;

    // 直流电机控制
    bool setDCSpeed(int pwm);
    bool setDCDirection(Direction dir);
    bool startDC();
    bool stopDC();
    bool isDCRunning() const;

    // 自动测试
    bool startAutoTest(int rpm);
    bool stopAutoTest();
    bool isAutoTestRunning() const;
    double getLastTravelTime() const;

    // 整体控制
    bool startBoth();
    bool stopBoth();

    // 直接发送命令
    bool sendCommand(const std::string& cmd);

    // 回调设置
    void setLimitCallback(LimitCallback callback);
    void setStatusCallback(StatusCallback callback);

private:
#ifdef _WIN32
    HANDLE hSerial;
#else
    int fd;
#endif
    bool connected;
    mutable std::mutex serialMutex;
    std::thread listenerThread;
    bool stopListener;

    // 状态变量
    bool stepperRunning;
    bool dcRunning;
    int stepperRPM;
    int dcSpeed;
    Direction stepperDirection;
    Direction dcDirection;

    // 自动测试
    bool autoTestRunning;
    Direction autoDirection;
    std::chrono::steady_clock::time_point autoTestStartTime;
    double lastTravelTime;
    mutable std::mutex testMutex;

    // 回调
    LimitCallback limitCallback;
    StatusCallback statusCallback;
    mutable std::mutex callbackMutex;

    // 内部方法
    bool writeData(const std::string& data);
    std::string readData();
    void processLimitTrigger(const std::string& line);
    void handleLimitTriggered(LimitType type);
    void updateStatus(const std::string& status);
    void listenThread();

    // 扫描端口辅助方法
#ifdef _WIN32
    static std::vector<std::string> scanWindowsPorts();
#else
    static std::vector<std::string> scanLinuxPorts();
#endif
};