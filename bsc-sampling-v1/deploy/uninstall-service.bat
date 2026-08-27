@echo off
rem ============================================================
rem  巴松措采样系统 V1 - 卸载 Windows 服务（保留数据目录）
rem ============================================================
set "ROOT=%~dp0.."
set "NSSM="
where nssm >nul 2>nul && for /f "delims=" %%i in ('where nssm') do if not defined NSSM set "NSSM=%%i"
if not defined NSSM (
  if exist "%ROOT%\tools\nssm-2.24\win64\nssm.exe" set "NSSM=%ROOT%\tools\nssm-2.24\win64\nssm.exe"
)
if not defined NSSM (
  echo [错误] 未找到 nssm，请确认安装时下载的 nssm 位置。
  exit /b 1
)
"%NSSM%" stop BscSampling
"%NSSM%" remove BscSampling confirm
echo [完成] 服务已卸载。数据目录 bsc-server\data\v1 已保留，可随时重新安装。
