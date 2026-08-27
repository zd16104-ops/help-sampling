@echo off
setlocal enabledelayedexpansion
rem ============================================================
rem  巴松措采样系统 V1 - Windows 服务安装（NSSM）
rem  用法：以管理员身份运行本文件。服务名 BscSampling，
rem        开机自启、异常退出 5 秒后自动拉起、日志轮转。
rem ============================================================
set "ROOT=%~dp0.."
set "APP=%ROOT%\bsc-server"
set "LOGS=%APP%\logs"
if not exist "%APP%\src\server.js" (
  echo [错误] 未找到 %APP%\src\server.js，请确认部署包解压结构。
  exit /b 1
)
if not exist "%LOGS%" mkdir "%LOGS%"

rem --- 定位 node.exe ---
set "NODE="
where node >nul 2>nul && for /f "delims=" %%i in ('where node') do if not defined NODE set "NODE=%%i"
if not defined NODE (
  echo [错误] 未找到 node。请先安装便携版 Node.js 24 并加入 PATH。
  exit /b 1
)
echo 使用 Node: %NODE%

rem --- 定位 nssm，没有则自动下载 ---
set "NSSM="
where nssm >nul 2>nul && for /f "delims=" %%i in ('where nssm') do if not defined NSSM set "NSSM=%%i"
if not defined NSSM (
  echo 未找到 nssm，正在自动下载 nssm 2.24 ...
  if not exist "%ROOT%\tools" mkdir "%ROOT%\tools"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm-2.24.zip' -UseBasicParsing; Expand-Archive -Path '%TEMP%\nssm-2.24.zip' -DestinationPath '%ROOT%\tools' -Force"
  set "NSSM=%ROOT%\tools\nssm-2.24\win64\nssm.exe"
)
if not exist "%NSSM%" (
  echo [错误] nssm 下载失败，请手工下载 nssm-2.24.zip 解压后重试。
  exit /b 1
)

rem --- 安装/更新服务 ---
"%NSSM%" install BscSampling "%NODE%" "src\server.js" 2>nul
"%NSSM%" set BscSampling AppDirectory "%APP%"
"%NSSM%" set BscSampling AppStdout "%LOGS%\service.out.log"
"%NSSM%" set BscSampling AppStderr "%LOGS%\service.err.log"
"%NSSM%" set BscSampling AppRotateFiles 1
"%NSSM%" set BscSampling AppRotateOnline 1
"%NSSM%" set BscSampling AppRotateBytes 10485760
"%NSSM%" set BscSampling AppExit Default Restart
"%NSSM%" set BscSampling AppRestartDelay 5000
"%NSSM%" set BscSampling Start SERVICE_AUTO_START
"%NSSM%" start BscSampling

echo.
echo [完成] 服务 BscSampling 已安装并启动：
echo   - 工作目录：%APP%
echo   - 监听地址：127.0.0.1:3100（仅本机，勿对外开放）
echo   - 开机自启、异常自动重启
echo   - 服务日志：%LOGS%
echo 验证：浏览器打开 http://127.0.0.1:3100 应显示管理站登录页。
echo 卸载：运行 uninstall-service.bat
