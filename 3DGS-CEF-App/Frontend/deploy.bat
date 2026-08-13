@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============ 配置 ============
set "SCRIPT_DIR=%~dp0"
set "SOURCE_DIR=C:\WKSPC\CPP\CEFApp\3DGS-CEF-App\Frontend"
set "DEST_DIR=C:\WKSPC\CPP\CEFApp\x64\Release\resources"
set "PYTHON_SCRIPT=deploy.py"

REM ============ 检查Python ============
echo 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Python，请安装Python 3.6或更高版本
    pause
    exit /b 1
)

REM ============ 检查源目录 ============
if not exist "%SOURCE_DIR%" (
    echo 错误: 源目录不存在!
    echo %SOURCE_DIR%
    pause
    exit /b 1
)

REM ============ 准备目标目录 ============
if exist "%DEST_DIR%" (
    echo 清理目标目录...
    rmdir /s /q "%DEST_DIR%" 2>nul
)
mkdir "%DEST_DIR%" 2>nul

REM ============ 运行部署脚本 ============
echo.
echo ========================================
echo 开始部署前端资源
echo ========================================
echo 源目录: %SOURCE_DIR%
echo 目标目录: %DEST_DIR%
echo.

cd /d "%SCRIPT_DIR%"

REM 使用Python运行部署脚本
python "%PYTHON_SCRIPT%" "%SOURCE_DIR%" "%DEST_DIR%" --verbose

if errorlevel 1 (
    echo.
    echo 部署失败!
    pause
    exit /b 1
)

echo.
echo ========================================
echo 部署完成!
echo ========================================
echo 目标目录内容:
dir "%DEST_DIR%" /b

echo.
pause