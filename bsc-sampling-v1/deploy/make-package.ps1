# 巴松措采样系统 V1 部署包打包脚本（在开发机上运行）
# 产物：<workspace>\bsc-deploy-v1.zip
# 内容：bsc-server（源码+生产依赖+文档）+ deploy（部署脚本与手册/AI提示词）
# 注意：不包含本机测试数据库 data\v1\bsc-v1.sqlite 与 config.json。
# 本文件必须保持 UTF-8 BOM 编码：PowerShell 5.1 会把无 BOM 的 UTF-8 按 GBK 解码，
# 中文注释会“吞掉”下一行命令（历史上曾因此漏拷 src 目录）。

$ErrorActionPreference = 'Stop'
$workspace = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # deploy/ 的上级的上级 = 工作区根
$serverRoot = Split-Path $PSScriptRoot -Parent                        # bsc-sampling-v1
$staging = Join-Path $workspace 'deploy-staging'
$zipPath = Join-Path $workspace 'bsc-deploy-v1.zip'

Write-Host "staging: $staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$staging\bsc-server" | Out-Null

# 1. 源码与静态资源（排除 test/、node_modules、data 实测数据、deploy 目录本身）
Copy-Item "$serverRoot\src" "$staging\bsc-server\src" -Recurse
Copy-Item "$serverRoot\public" "$staging\bsc-server\public" -Recurse
Copy-Item "$serverRoot\tools" "$staging\bsc-server\tools" -Recurse
Copy-Item "$serverRoot\docs" "$staging\bsc-server\docs" -Recurse
Copy-Item "$serverRoot\README.md" "$staging\bsc-server\README.md"
Copy-Item "$serverRoot\package.json" "$staging\bsc-server\package.json"
Copy-Item "$serverRoot\package-lock.json" "$staging\bsc-server\package-lock.json"

# 1b. 自检：核心文件必须已拷入，防止再次出现“缺 src”的残缺包。
$must = @('src\server.js','src\schema.js','src\track.js','src\exif.js','public\app.js','public\index.html','package.json')
foreach ($f in $must) {
  if (-not (Test-Path (Join-Path "$staging\bsc-server" $f))) { throw "打包自检失败：缺少 $f，请检查本脚本编码（必须 UTF-8 BOM）" }
}

# 2. 数据目录：只放占位文件，不带任何本机测试数据。
#    配置示例放服务器根目录（config.example.json），data\v1 内只有安装后生成的唯一 config.json，
#    避免“示例配置 + 真实配置”并存造成混淆。
New-Item -ItemType Directory -Force -Path "$staging\bsc-server\data\v1" | Out-Null
New-Item -ItemType File -Force -Path "$staging\bsc-server\data\v1\.gitkeep" | Out-Null
Copy-Item "$serverRoot\deploy\config.example.json" "$staging\bsc-server\config.example.json"

# 3. 生产依赖（本机执行 npm install --omit=dev，与开发机同为 Windows x64 / Node 24）
Write-Host 'installing production dependencies...'
Push-Location "$staging\bsc-server"
npm install --omit=dev --no-audit --no-fund | Out-Null
if ($LASTEXITCODE -ne 0) { throw "生产依赖安装失败（npm exit $LASTEXITCODE），已停止打包，避免生成缺依赖的无效部署包" }
Pop-Location

foreach ($module in @('pdfkit','qrcode','sharp')) {
  if (-not (Test-Path (Join-Path "$staging\bsc-server\node_modules" $module))) { throw "打包自检失败：缺少生产依赖 $module" }
}

# 4. 部署脚本与手册
Copy-Item "$serverRoot\deploy" "$staging\deploy" -Recurse
Remove-Item "$staging\deploy\config.example.json" -ErrorAction SilentlyContinue

# 5. 压缩
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -CompressionLevel Optimal

# 5b. 压缩包内容自检：确认 bsc-server\src\ 的 9 个源文件都在包里。
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$srcEntries = @($zip.Entries | Where-Object { $_.FullName -like 'bsc-server\src\*' } | Select-Object -ExpandProperty FullName)
$zip.Dispose()
if ($srcEntries.Count -lt 9) { throw "压缩包自检失败：bsc-server\src 只有 $($srcEntries.Count) 个文件：$($srcEntries -join ', ')" }
Write-Host "package ready: $zipPath (src files: $($srcEntries.Count))"
