# 插件本地测试环境

本文说明如何用本地 TypeScript runner 测试 server 插件的 `actions.js` 方法返回值。

## 适用范围

- 适用于 `type: "server"` 插件。
- 不需要先安装插件。
- 不需要启动 Web 或 Electron。
- 支持传插件路径、自定义测试文件、内联执行代码、插件配置、mock 宿主 API。

## 入口文件

```text
packages/server/src/dev/plugin-test-runner.ts
packages/server/src/dev/plugin-test-harness.ts
```

runner 通过 `plugin-test-harness.ts` 加载插件目录下的 `actions.js`，并默认注入 `createBuiltinPluginApi()`。

## 基本命令

从仓库根目录运行 fetch demo：

```bash
pnpm test:plugin:fetch
```

等价于：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --test src/dev/plugin-tests/fetch-text.test.ts
```

## 参数

- `--plugin <dir>`：插件目录，必填。
- `--test <file>`：自定义测试文件。测试文件必须导出 `default(plugin)` 或 `run(plugin)`。
- `--code <code>`：内联异步测试代码。代码里可以直接使用 `plugin` 变量。
- `--config <json>`：模拟插件配置，必须是 JSON object。
- `--config @<file>`：从 JSON 文件读取插件配置，Windows/PowerShell 下推荐这种方式。
- `--mock-api <file>`：mock 宿主 API 文件，导出 object 或返回 object 的函数。

`--test` 和 `--code` 至少传一个。

## 自定义测试文件

示例：

```typescript
import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

export default async function run(plugin: LoadedPlugin) {
  const result = await plugin.runAction('fetch_text', {
    url: 'https://example.com',
    timeout: 10000,
  });

  const payload = result as {
    success?: boolean;
    data?: { text?: string; url?: string };
  };

  assert.equal(payload.success, true);
  assert.equal(payload.data?.url, 'https://example.com');
  assert.match(payload.data?.text || '', /Example Domain/);

  return {
    success: true,
    textLength: payload.data?.text?.length || 0,
  };
}
```

测试文件可使用：

- `plugin.listActions()`：查看可执行 action。
- `plugin.runAction(name, args)`：执行指定 action。
- `plugin.config`：读取通过 `--config` 传入的配置。
- `plugin.api`：读取内置 API 和 `--mock-api` 覆盖后的 API。
- Node `assert`：校验返回值，不通过时直接抛错并让命令失败。

## 内联代码

简单校验可以直接传 `--code`：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --code "const r = await plugin.runAction('fetch_text', { url: 'https://example.com' }); if (!r.success) throw new Error('failed'); return r;"
```

## 传插件配置

通过 `--config` 传 JSON object：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --test src/dev/plugin-tests/fetch-text.test.ts --config "{\"defaultTimeout\":30000,\"userAgent\":\"workflow/1.0\"}"
```

PowerShell 或复杂配置推荐写入 JSON 文件：

```json
{
  "defaultTimeout": 1234,
  "userAgent": "workflow-test/1.0"
}
```

然后用 `@file` 传入：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --test src/dev/plugin-tests/fetch-text.test.ts --config @src/dev/plugin-tests/fetch-config.json
```

传入的配置会同时出现在：

- `plugin.config`
- action 执行时的 `ctx.config`
- action 入参合并结果中

## Mock 宿主 API

mock API 文件示例：

```typescript
export default {
  async fetchText(url: string) {
    return `mock text from ${url}`;
  },
};
```

运行：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --test src/dev/plugin-tests/fetch-mock.test.ts --config "{\"defaultTimeout\":1234}" --mock-api src/dev/plugin-tests/fetch-mock-api.ts
```

Windows/PowerShell 推荐：

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/fetch --test src/dev/plugin-tests/fetch-mock.test.ts --config @src/dev/plugin-tests/fetch-config.json --mock-api src/dev/plugin-tests/fetch-mock-api.ts
```

`--mock-api` 会覆盖默认 `createBuiltinPluginApi()` 中的同名方法，适合测试外部 HTTP、云服务、文件写入等行为。

## Fetch Demo 文件

当前 fetch 插件 demo：

```text
packages/server/src/dev/plugin-tests/fetch-text.test.ts
packages/server/src/dev/plugin-tests/fetch-mock.test.ts
packages/server/src/dev/plugin-tests/fetch-mock-api.ts
packages/server/src/dev/plugin-tests/fetch-config.json
```

fetch 插件本体仍保持在：

```text
packages/templates/plugins/fetch
```

不要把测试文件移动到插件目录。测试代码应独立放置，通过 `--plugin` 指定要测试的插件路径。
