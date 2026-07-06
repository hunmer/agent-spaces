#!/usr/bin/env bash
# 批量发布 @agent-spaces 的公开包:shared -> sdk -> server
# web 为 private 包,跳过。
# 用法:在交互式终端执行  ./scripts/publish-packages.sh
# OTP:若账号开启 2FA,pnpm 会在发布时提示输入 6 位码,或自动打开浏览器授权。

set -e

# 切到仓库根(脚本所在目录的上一级)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- 1. 登录状态检查 ----
echo "==> 检查 npm 登录状态..."
if ! NPM_USER=$(npm whoami 2>/dev/null); then
  echo "    未登录,开始 web 授权登录(浏览器会自动打开)..."
  npm login --auth-type=web
  NPM_USER=$(npm whoami)
fi
echo "    已登录:$NPM_USER  (registry: $(npm config get registry))"
echo

# ---- 2. 待发布包(按依赖顺序)----
PACKAGES=(shared sdk server)

# ---- 3. 逐个 build + publish ----
for PKG in "${PACKAGES[@]}"; do
  NAME="@agent-spaces/$PKG"
  DIR="packages/$PKG"
  VERSION=$(node -p "require('./$DIR/package.json').version")
  echo "================================================ =="
  echo "==> [$PKG] $NAME@$VERSION"
  echo "================================================ =="
  echo "    [1/2] build..."
  pnpm --filter "$NAME" build
  echo "    [2/2] publish..."
  pnpm --filter "$NAME" publish --no-git-checks --access public
  echo "    ✓ $NAME@$VERSION 发布完成"
  echo
  # 上架校验(可选,失败不阻断)
  if npm view "$NAME@$VERSION" >/dev/null 2>&1; then
    echo "    npm view 确认已上架"
  else
    echo "    ! 警告:npm view 未查到,可能仍在同步,稍后再查"
  fi
  echo
done

echo "======================================== =="
echo "全部完成:"
for PKG in "${PACKAGES[@]}"; do
  VERSION=$(node -p "require('./packages/$PKG/package.json').version")
  echo "  @agent-spaces/$PKG@$VERSION"
done
echo "======================================== =="
