# 批量发布 pnpm/npm workspace 的公开包 (PowerShell 版)
# 默认发布 shared -> sdk -> server (按依赖顺序);web 为 private 自动跳过。
#
# 用法:
#   ./scripts/publish-packages.ps1                      # 发布默认三个包
#   ./scripts/publish-packages.ps1 -Packages shared,sdk # 只发布指定包
#   ./scripts/publish-packages.ps1 -DryRun              # 只打印不实际发布
#
# OTP: 若账号开启 2FA, pnpm 会在发布时提示输入 6 位码, 或自动打开浏览器授权。

param(
    [string[]]$Packages = @("shared", "sdk", "server"),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# 切到仓库根。优先 git rev-parse,失败则按脚本路径回溯。
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
try {
    $Root = (git -C $ScriptDir rev-parse --show-toplevel).Trim()
} catch {
    # 回退: scripts -> skill -> skills -> .agents -> root (4 层)
    $Root = Resolve-Path (Join-Path $ScriptDir "../../../..")
}
if (-not (Test-Path (Join-Path $Root "package.json"))) {
    throw "无法定位仓库根 (缺少 package.json): $Root"
}
Set-Location $Root
Write-Host "仓库根: $Root"

# ---- 1. 登录状态检查 ----
Write-Host "==> 检查 npm 登录状态..."
$registry = (npm config get registry).Trim()
if ($registry -ne "https://registry.npmjs.org/") {
    Write-Host "    ! 当前 registry 不是官方: $registry"
    $ans = Read-Host "    是否切换到 https://registry.npmjs.org/ 并继续? (y/N)"
    if ($ans -ne "y") { exit 1 }
    npm config set registry https://registry.npmjs.org/
}

$NPM_USER = $null
try {
    $NPM_USER = (npm whoami 2>$null).Trim()
} catch {}

if ([string]::IsNullOrWhiteSpace($NPM_USER)) {
    Write-Host "    未登录, 开始 web 授权登录 (浏览器会自动打开)..."
    npm login --auth-type=web
    $NPM_USER = (npm whoami).Trim()
}
Write-Host "    已登录: $NPM_USER  (registry: $registry)"
Write-Host ""

# ---- 2. 逐个 build + publish ----
foreach ($pkg in $Packages) {
    $name = "@agent-spaces/$pkg"
    $dir  = Join-Path $Root "packages/$pkg"
    $pkgJsonPath = Join-Path $dir "package.json"
    if (-not (Test-Path $pkgJsonPath)) {
        Write-Host "    ! 跳过 $name: 找不到 $pkgJsonPath" -ForegroundColor Yellow
        continue
    }
    $version = (node -p "require('$pkgJsonPath').version").Trim()
    $isPrivate = (node -p "!!require('$pkgJsonPath').private").Trim()

    Write-Host "================================================ =="
    Write-Host "==> [$pkg] $name@$version"
    Write-Host "================================================ =="

    if ($isPrivate -eq "true") {
        Write-Host "    跳过: private 包不可发布" -ForegroundColor Yellow
        continue
    }

    Write-Host "    [1/2] build..."
    if ($DryRun) { Write-Host "    (dry-run) 跳过 build" } else {
        pnpm --filter $name build
        if ($LASTEXITCODE -ne 0) { Write-Host "    build 失败" -ForegroundColor Red; exit 1 }
    }

    Write-Host "    [2/2] publish..."
    if ($DryRun) {
        Write-Host "    (dry-run) 跳过 publish"
    } else {
        pnpm --filter $name publish --no-git-checks --access public
        if ($LASTEXITCODE -ne 0) { Write-Host "    publish 失败" -ForegroundColor Red; exit 1 }
    }
    Write-Host "    done $name@$version" -ForegroundColor Green
    Write-Host ""

    # 上架校验 (失败不阻断)
    if (-not $DryRun) {
        Start-Sleep -Seconds 2
        npm view "$name@$version" *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    npm view 确认已上架"
        } else {
            Write-Host "    ! 警告: npm view 未查到, 可能仍在同步, 稍后再查" -ForegroundColor Yellow
        }
        Write-Host ""
    }
}

Write-Host "======================================== =="
Write-Host "完成:" -ForegroundColor Green
foreach ($pkg in $Packages) {
    $pkgJsonPath = Join-Path $Root "packages/$pkg/package.json"
    if (Test-Path $pkgJsonPath) {
        $version = (node -p "require('$pkgJsonPath').version").Trim()
        Write-Host "  @agent-spaces/$pkg@$version"
    }
}
Write-Host "======================================== =="
