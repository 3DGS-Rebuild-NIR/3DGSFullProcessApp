// MotorController.cpp
#include "MotorController.h"
#include <iostream>
#include <sstream>
#include <algorithm>
#include <cstring>

#ifdef _WIN32
#include <windows.h>
#include <setupapi.h>
#include <devguid.h>
#pragma comment(lib, "setupapi.lib")
#else
#include <dirent.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <termios.h>
#endif

// 构造函数
MotorController::MotorController()
    : hSerial(INVALID_HANDLE_VALUE)
    , connected(false)
    , stepperRunning(false)
    , dcRunning(false)
    , stepperRPM(100)
    , dcSpeed(100)
    , stepperDirection(Direction::FORWARD)
    , dcDirection(Direction::FORWARD)
    , autoTestRunning(false)
    , autoDirection(Direction::FORWARD)
    , lastTravelTime(0.0)
    , stopListener(false)
{
}

// 析构函数
MotorController::~MotorController() {
    stopAutoTest();
    stopBoth();
    disconnect();
}

// ---- 串口操作 ----
bool MotorController::connect(const std::string& port, int baudrate) {
#ifdef _WIN32
    hSerial = CreateFileA(port.c_str(), GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hSerial == INVALID_HANDLE_VALUE) {
        std::cerr << "Failed to open port: " << port << std::endl;
        return false;
    }

    DCB dcbSerialParams = { 0 };
    dcbSerialParams.DCBlength = sizeof(dcbSerialParams);
    if (!GetCommState(hSerial, &dcbSerialParams)) {
        std::cerr << "Failed to get serial params" << std::endl;
        CloseHandle(hSerial);
        hSerial = INVALID_HANDLE_VALUE;
        return false;
    }

    dcbSerialParams.BaudRate = baudrate;
    dcbSerialParams.ByteSize = 8;
    dcbSerialParams.StopBits = ONESTOPBIT;
    dcbSerialParams.Parity = NOPARITY;

    if (!SetCommState(hSerial, &dcbSerialParams)) {
        std::cerr << "Failed to set serial params" << std::endl;
        CloseHandle(hSerial);
        hSerial = INVALID_HANDLE_VALUE;
        return false;
    }

    COMMTIMEOUTS timeouts = { 0 };
    timeouts.ReadIntervalTimeout = 50;
    timeouts.ReadTotalTimeoutConstant = 50;
    timeouts.ReadTotalTimeoutMultiplier = 10;
    timeouts.WriteTotalTimeoutConstant = 50;
    timeouts.WriteTotalTimeoutMultiplier = 10;
    SetCommTimeouts(hSerial, &timeouts);

    connected = true;
#else
    fd = open(port.c_str(), O_RDWR | O_NOCTTY | O_SYNC);
    if (fd < 0) {
        std::cerr << "Failed to open port: " << port << std::endl;
        return false;
    }

    struct termios tty;
    if (tcgetattr(fd, &tty) != 0) {
        std::cerr << "Failed to get terminal attributes" << std::endl;
        close(fd);
        fd = -1;
        return false;
    }

    // 设置波特率
    speed_t speed;
    switch (baudrate) {
    case 9600: speed = B9600; break;
    case 19200: speed = B19200; break;
    case 38400: speed = B38400; break;
    case 57600: speed = B57600; break;
    case 115200: speed = B115200; break;
    default: speed = B9600; break;
    }
    cfsetospeed(&tty, speed);
    cfsetispeed(&tty, speed);

    tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;
    tty.c_iflag &= ~IGNBRK;
    tty.c_lflag = 0;
    tty.c_oflag = 0;
    tty.c_cc[VMIN] = 0;
    tty.c_cc[VTIME] = 1;

    tty.c_iflag &= ~(IXON | IXOFF | IXANY);
    tty.c_cflag |= (CLOCAL | CREAD);
    tty.c_cflag &= ~(PARENB | PARODD);
    tty.c_cflag &= ~CSTOPB;
    tty.c_cflag &= ~CRTSCTS;

    if (tcsetattr(fd, TCSANOW, &tty) != 0) {
        std::cerr << "Failed to set terminal attributes" << std::endl;
        close(fd);
        fd = -1;
        return false;
    }

    connected = true;
#endif

    if (connected) {
        // 启动监听线程
        stopListener = false;
        listenerThread = std::thread(&MotorController::listenThread, this);
        // 等待串口稳定
        std::this_thread::sleep_for(std::chrono::milliseconds(2000));
        updateStatus("Connected to " + port);
    }

    return connected;
}

void MotorController::disconnect() {
    // 停止监听线程
    stopListener = true;
    if (listenerThread.joinable()) {
        listenerThread.join();
    }

#ifdef _WIN32
    if (hSerial != INVALID_HANDLE_VALUE) {
        CloseHandle(hSerial);
        hSerial = INVALID_HANDLE_VALUE;
    }
#else
    if (fd >= 0) {
        close(fd);
        fd = -1;
    }
#endif
    connected = false;
    updateStatus("Disconnected");
}

bool MotorController::isConnected() const {
    return connected;
}

// ---- 扫描可用串口 ----
std::vector<std::string> MotorController::scanPorts() {
#ifdef _WIN32
    return scanWindowsPorts();
#else
    return scanLinuxPorts();
#endif
}

#ifdef _WIN32
std::vector<std::string> MotorController::scanWindowsPorts() {
    std::vector<std::string> ports;
    HDEVINFO deviceInfoSet = SetupDiGetClassDevs(
        &GUID_DEVCLASS_PORTS,
        NULL,
        NULL,
        DIGCF_PRESENT
    );

    if (deviceInfoSet == INVALID_HANDLE_VALUE) {
        return ports;
    }

    SP_DEVINFO_DATA deviceInfoData;
    deviceInfoData.cbSize = sizeof(SP_DEVINFO_DATA);

    for (DWORD i = 0; SetupDiEnumDeviceInfo(deviceInfoSet, i, &deviceInfoData); i++) {
        HKEY hKey = SetupDiOpenDevRegKey(deviceInfoSet, &deviceInfoData,
            DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
        if (hKey != INVALID_HANDLE_VALUE) {
            char portName[256];
            DWORD size = sizeof(portName);
            DWORD type = 0;
            if (RegQueryValueExA(hKey, "PortName", NULL, &type,
                (LPBYTE)portName, &size) == ERROR_SUCCESS && type == REG_SZ) {
                ports.push_back(std::string(portName));
            }
            RegCloseKey(hKey);
        }
    }

    SetupDiDestroyDeviceInfoList(deviceInfoSet);
    return ports;
}
#else
std::vector<std::string> MotorController::scanLinuxPorts() {
    std::vector<std::string> ports;
    const std::string dirPath = "/dev/";
    DIR* dir = opendir(dirPath.c_str());

    if (!dir) {
        return ports;
    }

    struct dirent* entry;
    while ((entry = readdir(dir)) != NULL) {
        std::string name = entry->d_name;
        // 常见的串口命名：ttyUSB*, ttyACM*, ttyS*
        if (name.find("ttyUSB") == 0 ||
            name.find("ttyACM") == 0 ||
            name.find("ttyS") == 0) {
            std::string fullPath = dirPath + name;
            // 检查是否为字符设备
            struct stat st;
            if (stat(fullPath.c_str(), &st) == 0 && S_ISCHR(st.st_mode)) {
                ports.push_back(fullPath);
            }
        }
    }

    closedir(dir);
    return ports;
}
#endif

// ---- 其他方法保持不变 ----
bool MotorController::writeData(const std::string& data) {
    if (!connected) return false;
    std::lock_guard<std::mutex> lock(serialMutex);

#ifdef _WIN32
    DWORD bytesWritten;
    if (!WriteFile(hSerial, data.c_str(), (DWORD)data.length(), &bytesWritten, NULL)) {
        return false;
    }
    return bytesWritten == data.length();
#else
    ssize_t bytesWritten = write(fd, data.c_str(), data.length());
    return bytesWritten == static_cast<ssize_t>(data.length());
#endif
}

std::string MotorController::readData() {
    if (!connected) return "";

    char buffer[256];
#ifdef _WIN32
    DWORD bytesRead;
    if (ReadFile(hSerial, buffer, sizeof(buffer) - 1, &bytesRead, NULL)) {
        if (bytesRead > 0) {
            buffer[bytesRead] = '\0';
            return std::string(buffer);
        }
    }
#else
    ssize_t bytesRead = read(fd, buffer, sizeof(buffer) - 1);
    if (bytesRead > 0) {
        buffer[bytesRead] = '\0';
        return std::string(buffer);
    }
#endif
    return "";
}

bool MotorController::sendCommand(const std::string& cmd) {
    std::string fullCmd = cmd + "\n";
    return writeData(fullCmd);
}

// ---- 步进电机控制 ----
bool MotorController::setStepperRPM(int rpm) {
    rpm = std::max(0, std::min(rpm, 1200));
    stepperRPM = rpm;
    std::ostringstream cmd;
    cmd << "RPM" << rpm;
    return sendCommand(cmd.str());
}

bool MotorController::setStepperDirection(Direction dir) {
    stepperDirection = dir;
    if (dir == Direction::FORWARD) {
        return sendCommand("DIRF1");
    }
    else {
        return sendCommand("DIRB1");
    }
}

bool MotorController::startStepper() {
    if (!setStepperDirection(stepperDirection)) return false;
    if (!sendCommand("START1")) return false;
    stepperRunning = true;
    updateStatus("步进电机启动");
    return true;
}

bool MotorController::stopStepper() {
    if (!sendCommand("STOP1")) return false;
    stepperRunning = false;
    updateStatus("步进电机停止");
    return true;
}

bool MotorController::isStepperRunning() const {
    return stepperRunning;
}

// ---- 直流电机控制 ----
bool MotorController::setDCSpeed(int pwm) {
    pwm = std::max(0, std::min(pwm, 255));
    dcSpeed = pwm;
    std::ostringstream cmd;
    cmd << "SPD2" << pwm;
    return sendCommand(cmd.str());
}

bool MotorController::setDCDirection(Direction dir) {
    dcDirection = dir;
    if (dir == Direction::FORWARD) {
        return sendCommand("DIRF2");
    }
    else {
        return sendCommand("DIRB2");
    }
}

bool MotorController::startDC() {
    if (!setDCDirection(dcDirection)) return false;
    if (!sendCommand("START2")) return false;
    dcRunning = true;
    updateStatus("直流电机启动");
    return true;
}

bool MotorController::stopDC() {
    if (!sendCommand("STOP2")) return false;
    dcRunning = false;
    updateStatus("直流电机停止");
    return true;
}

bool MotorController::isDCRunning() const {
    return dcRunning;
}

// ---- 自动测试 ----
bool MotorController::startAutoTest(int rpm) {
    std::lock_guard<std::mutex> lock(testMutex);

    if (autoTestRunning) return false;

    if (!setStepperRPM(rpm)) return false;
    if (!setStepperDirection(Direction::BACKWARD)) return false;
    if (!sendCommand("START1")) return false;

    autoTestRunning = true;
    autoDirection = Direction::BACKWARD;
    autoTestStartTime = std::chrono::steady_clock::now();
    lastTravelTime = 0.0;

    updateStatus("自动测试：向上运行中");
    return true;
}

bool MotorController::stopAutoTest() {
    std::lock_guard<std::mutex> lock(testMutex);

    if (!autoTestRunning) return true;

    autoTestRunning = false;
    stopStepper();
    updateStatus("自动测试停止");
    return true;
}

bool MotorController::isAutoTestRunning() const {
    return autoTestRunning;
}

double MotorController::getLastTravelTime() const {
    return lastTravelTime;
}

// ---- 整体控制 ----
bool MotorController::startBoth() {
    bool result = startStepper() && startDC();
    if (result) {
        updateStatus("两个电机均已启动");
    }
    return result;
}

bool MotorController::stopBoth() {
    bool result = stopStepper() && stopDC();
    if (result) {
        updateStatus("两个电机均已停止");
    }
    return result;
}

// ---- 回调设置 ----
void MotorController::setLimitCallback(LimitCallback callback) {
    std::lock_guard<std::mutex> lock(callbackMutex);
    limitCallback = callback;
}

void MotorController::setStatusCallback(StatusCallback callback) {
    std::lock_guard<std::mutex> lock(callbackMutex);
    statusCallback = callback;
}

// ---- 内部方法 ----
void MotorController::processLimitTrigger(const std::string& line) {
    LimitType type = LimitType::NONE;
    std::string info;

    if (line.find("LIMIT_TOP") != std::string::npos) {
        type = LimitType::TOP;
        info = "触发上限位器";
        handleLimitTriggered(type);
    }
    else if (line.find("LIMIT_BOTTOM") != std::string::npos) {
        type = LimitType::BOTTOM;
        info = "触发下限位器";
        handleLimitTriggered(type);
    }
    else if (line.find("LIMIT HIT") != std::string::npos) {
        type = LimitType::UNKNOWN;
        info = "限位器触发（未知）";
        stopStepper();
    }

    if (type != LimitType::NONE) {
        // 触发回调
        std::lock_guard<std::mutex> lock(callbackMutex);
        if (limitCallback) {
            limitCallback(type, info);
        }
        updateStatus(info);
    }
}

void MotorController::handleLimitTriggered(LimitType type) {
    if (!autoTestRunning) return;

    std::lock_guard<std::mutex> lock(testMutex);
    stopStepper();

    if (type == LimitType::TOP) {
        autoDirection = Direction::FORWARD;
        autoTestStartTime = std::chrono::steady_clock::now();
        setStepperDirection(Direction::FORWARD);
        sendCommand("START1");
        updateStatus("自动测试：向下运行中");
    }
    else if (type == LimitType::BOTTOM) {
        autoDirection = Direction::BACKWARD;
        auto elapsed = std::chrono::duration<double>(
            std::chrono::steady_clock::now() - autoTestStartTime
        ).count();
        lastTravelTime = elapsed;
        setStepperDirection(Direction::BACKWARD);
        sendCommand("START1");
        updateStatus("自动测试：向上运行中");
    }
}

void MotorController::updateStatus(const std::string& status) {
    std::lock_guard<std::mutex> lock(callbackMutex);
    if (statusCallback) {
        //statusCallback(status);
    }
}

// ---- 串口监听线程 ----
void MotorController::listenThread() {
    while (!stopListener) {
        std::string data = readData();
        if (!data.empty()) {
            std::istringstream iss(data);
            std::string line;
            while (std::getline(iss, line, '\n')) {
                if (!line.empty()) {
                    if (!line.empty() && line.back() == '\r') {
                        line.pop_back();
                    }
                    std::cout << ">> " << line << std::endl;
                    processLimitTrigger(line);
                }
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
}