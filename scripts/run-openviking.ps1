# 启动 openviking-server（带 bot），并将 OPENVIKING_CONFIG_FILE 指向脚本所在目录下的 .openviking/ov.conf
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BuildArgs
)

$ErrorActionPreference = 'Stop'

# 定位脚本所在目录（兼容符号链接与任意调用位置）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Resolve-Path (Join-Path $ScriptDir '..') | Select-Object -ExpandProperty Path

$ConfDir = Join-Path $ProjectDir '.openviking'
$ConfFile = Join-Path $ConfDir 'ov.conf'

# 配置目录缺失则创建（ov.conf 文件需自行准备）
if (-not (Test-Path $ConfDir)) {
    New-Item -ItemType Directory -Path $ConfDir -Force | Out-Null
}

$env:OPENVIKING_CONFIG_FILE = $ConfFile

Write-Host "[openviking] PROJECT_DIR=$ProjectDir"
Write-Host "[openviking] OPENVIKING_CONFIG_FILE=$($env:OPENVIKING_CONFIG_FILE)"

if ($BuildArgs) {
    & openviking-server --with-bot @BuildArgs
} else {
    & openviking-server --with-bot
}
