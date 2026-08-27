# 巴松措采样系统 V1 - 每小时健康检查（部署到服务器）
# 检查：服务存活 /health、磁盘余量、HTTPS 证书剩余天数、每日备份是否有新目录。
# 异常时写入本脚本目录 health-alert.txt，并尝试写 Windows 事件日志（源 BscHealthAlert）。
# 注册计划任务（管理员 PowerShell，每小时）：
#   schtasks /Create /TN BscHealthAlert /SC HOURLY /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\bsc\deploy\health-alert.ps1"

$ErrorActionPreference = 'Continue'
$appRoot = 'C:\bsc\bsc-server'   # 按实际部署路径调整
$out = @()
$ok = $true

# 1. 服务存活（本机 3100）
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/health' -TimeoutSec 10
  if ($h.status -ne 'healthy') { $ok = $false; $out += "health status=$($h.status)" }
} catch { $ok = $false; $out += "服务不可达: $($_.Exception.Message)" }

# 2. 磁盘余量
$freeGb = [math]::Round((Get-PSDrive -Name (Split-Path -Qualifier $appRoot)).Free / 1GB, 1)
if ($freeGb -lt 10) { $ok = $false; $out += "磁盘剩余 $freeGb GB（低于 10GB 告警线）" }

# 3. HTTPS 证书到期（公网域名）
try {
  $req = [Net.HttpWebRequest]::Create('https://bsc.gpsgps.online')
  $req.Timeout = 15000
  $req.GetResponse() | Out-Null
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($req.ServicePoint.Certificate)
  $days = [math]::Round(($cert.NotAfter - (Get-Date)).TotalDays, 1)
  if ($days -lt 30) { $ok = $false; $out += "HTTPS 证书 $days 天后到期（30 天内）" }
} catch { $ok = $false; $out += "证书检查失败: $($_.Exception.Message)" }

# 4. 最近备份是否在 26 小时内（每日 02:30 计划任务应产出新目录）
$latest = Get-ChildItem (Join-Path $appRoot 'data\v1\backups') -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest -or ((Get-Date) - $latest.LastWriteTime).TotalHours -gt 26) { $ok = $false; $out += '最近备份超过 26 小时未更新' }

if ($ok) { exit 0 }

$msg = 'BSC健康检查异常: ' + ($out -join '；')
$log = Join-Path $PSScriptRoot 'health-alert.txt'
Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
New-EventLog -LogName Application -Source 'BscHealthAlert' -ErrorAction SilentlyContinue
Write-EventLog -LogName Application -Source 'BscHealthAlert' -EntryType Error -EventId 2001 -Message $msg -ErrorAction SilentlyContinue
exit 1
