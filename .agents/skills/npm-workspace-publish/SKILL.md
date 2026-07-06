---
name: npm-workspace-publish
description: "批量发布 pnpm/npm workspace 内的公开包到 npm 官方 registry。包含 macOS/Linux 用的 bash 脚本和 Windows 用的 PowerShell 脚本,按依赖顺序逐包 build + publish,自动检查登录状态与官方 registry,跳过 private 包。Use whenever the user wants to publish monorepo packages to npm, says 发布包/发包/npm publish/publish packages/workspace 发布, or wants a reusable publish script for @agent-spaces or any workspace repo."
---

# npm-workspace-publish

批量发布 workspace 内的公开包到 npm 官方 registry。提供两个平台脚本,用户在交互终端自行执行(自己处理登录/OTP)。

## 何时触发

用户说以下任意一种时加载本 skill:
- "发布包到 npm" / "发包" / "把这几个包发上去"
- "写个发布脚本" / "批量 publish"
- 在 monorepo/workspace 语境下提到 `npm publish` / `pnpm publish`
- 想给 `@agent-spaces` 或任意 workspace 做可复用发布流程

## 核心流程

所有脚本逻辑一致,顺序固定:

1. **切到仓库根** — 脚本自带定位逻辑(支持 git rev-parse 兜底)
2. **检查 registry** — 非官方(`https://registry.npmjs.org/`)时提示并询问是否切换
3. **检查登录态** — `npm whoami`;未登录则 `npm login --auth-type=web`(浏览器授权)
4. **按依赖顺序逐包**:
   - 读 `package.json`,`private: true` → 跳过并提示
   - `pnpm --filter <name> build`
   - `pnpm --filter <name> publish --no-git-checks --access public`
   - `npm view <name>@<version>` 校验是否上架(失败不阻断)
5. **任一步失败立即退出**(`set -e` / `$ErrorActionPreference = "Stop"`)

**依赖顺序**:被依赖的包先发。`@agent-spaces` 默认 `shared → sdk → server`,`web` 是 private 跳过。workspace 依赖写为 `workspace:*`,pnpm publish 时会自动替换为实际版本号。

## 脚本位置与使用

本 skill 自带两个脚本,位于 `scripts/`:

| 平台 | 脚本 | 命令 |
|---|---|---|
| macOS / Linux | `publish-packages.sh` | `./publish-packages.sh` |
| Windows PowerShell | `publish-packages.ps1` | `./publish-packages.ps1` |

脚本路径(相对仓库根):`.agents/skills/npm-workspace-publish/scripts/`

### 复用到其他仓库

两个脚本不绑定 `@agent-spaces`,改脚本顶部的默认包列表即可:
- bash: `PACKAGES=(shared sdk server)`
- ps1:  `-Packages @("shared", "sdk", "server")`

PowerShell 还支持参数化: `./publish-packages.ps1 -Packages shared,sdk -DryRun`

## OTP / 2FA 说明

npm 账号开启 2FA 时:
- **交互终端**(推荐):`pnpm publish` 会提示输入 6 位码,或自动打开浏览器授权。脚本在交互终端跑就能正常弹。
- **非交互终端**(如 agent 自动化):npm 出于安全把 OTP 授权 URL 截断成 `***`,自动弹浏览器会失败。此时必须由用户在交互终端运行,或改用 **automation granular token**(见下方)。

若要在 CI/agent 环境免 OTP 自动发布:在 npmjs.com 创建 **Automation Granular Access Token**(限定到具体包+发布权限),设为环境变量 `NODE_AUTH_TOKEN`,然后把 publish 命令里的认证方式改为 token。

## 关键约束

- **不自动改版本号**:发版前版本号由用户自行决定(`pnpm version patch` 或手动改 `package.json`)。脚本只读 `version` 字段做展示和校验。
- **不跳过 private 检查**:npm 不允许发布名为 `<scope>/xxx` 的 private 包到公共 registry,脚本遇到 `private: true` 会跳过并提示,不要试图绕过。
- **registry 必须官方**:避免误发到私有/镜像源。脚本会校验并在非官方时询问。
- **失败即停**:某个包 build 或 publish 失败,脚本立即退出,已成功发布的包不受影响,失败包可修后重跑。

## 常见异常

| 现象 | 原因 | 处理 |
|---|---|---|
| `EOTP` / requires one-time password | 账号开了 2FA | 在交互终端运行脚本,按提示输 6 位码 |
| `E403 You cannot publish over` | 该版本号已发布过 | 先 bump 版本号再跑 |
| OTP URL 显示成 `***` 打不开 | 非交互终端,npm 截断敏感链接 | 改在用户自己的终端跑脚本 |
| `EPERM` / operation not permitted | registry 非官方或权限不足 | 确认 `npm config get registry` 为官方,且登录账号对该 scope 有权限 |
| 脚本找不到仓库根 | 层级不匹配 | bash/ps1 脚本均有 `git rev-parse --show-toplevel` 兜底 |

## 示例输出

```
==> 检查 npm 登录状态...
    已登录:hunmer  (registry: https://registry.npmjs.org/)

================================================ = =
==> [shared] @agent-spaces/shared@0.2.3
================================================ = =
    [1/2] build...
    [2/2] publish...
    ✓ @agent-spaces/shared@0.2.3 发布完成
    npm view 确认已上架
...
全部完成:
  @agent-spaces/shared@0.2.3
  @agent-spaces/sdk@0.1.1
  @agent-spaces/server@0.4.6
```
