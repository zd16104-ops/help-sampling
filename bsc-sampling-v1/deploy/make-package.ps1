# 巴松措采样系统 V1 部署包打包脚本（在开发机上运行）
# 产物：<workspace>\bsc-deploy-v1.zip
# 内容：bsc-server（源码+生产依赖+文档）+ deploy（部署脚本与手册/AI提示词）
# 注意：不包含本机测试数据库 data\v1\bsc-v1.sqlite 与 config.json。

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
Pop-Location

# 4. 部署脚本与手册
Copy-Item "$serverRoot\deploy" "$staging\deploy" -Recurse
Remove-Item "$staging\deploy\config.example.json" -ErrorAction SilentlyContinue

# 5. 压缩
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$staging\*" -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "package ready: $zipPath"
