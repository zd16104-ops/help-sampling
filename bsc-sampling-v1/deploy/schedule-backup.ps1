# 巴松措采样系统 V1 - 每日备份计划任务注册脚本
# 用法（管理员 PowerShell）：
#   powershell -ExecutionPolicy Bypass -File schedule-backup.ps1
# 每天 02:30 执行：数据库一致快照 + 照片增量拷贝，保留 14 天，
# 备份输出到 bsc-server\data\v1\backups\backup-<时间戳>\

$ErrorActionPreference = 'Stop'
$app = Join-Path (Split-Path $PSScriptRoot -Parent) 'bsc-server'
$node = (Get-Command node -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $node `
  -Argument 'tools\backup.js --photos --mirror D:\bsc-offsite' `
  -WorkingDirectory $app
$trigger = New-ScheduledTaskTrigger -Daily -At '02:30'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName 'BscSamplingBackup' -Action $action -Trigger $trigger `
  -Settings $settings -Description '巴松措采样系统每日备份（数据库快照+照片增量+异机镜像，保留14天）' -Force | Out-Null

Write-Host '[完成] 已注册每日备份计划任务 BscSamplingBackup（每天 02:30）。'
Write-Host '注意：--mirror D:\bsc-offsite 请改成你的异机/云盘同步目录；不需要异机备份则删除该参数。'
Write-Host '手动验证一次：'
Write-Host "  cd $app && node tools\backup.js --photos --mirror D:\bsc-offsite"
Write-Host '恢复演练（每月一次）：'
Write-Host "  node tools\restore.js <backup目录>"
