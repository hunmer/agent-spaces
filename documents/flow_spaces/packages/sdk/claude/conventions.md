# 开发约定

## 模块工厂模式

每个 API 模块必须遵循统一的工厂函数模式：

```typescript
export function createXxxApi(http: HttpClient) {
  return {
    method: (): Promise<Type> => http.get('/api/xxx'),
    methodWithBody: (data: Type): Promise<Type> => http.post('/api/xxx', data),
  };
}
```

**规则：**
- 函数名必须是 `create{ModuleName}Api`
- 参数类型必须声明为 `HttpClient`（不可用更宽泛的类型，除 `chat.ts` 有意使用 `{ get: Function; ... }`）
- 返回一个普通对象，方法名为 camelCase
- DELETE 方法命名使用 `delete_`（避免与 JS 保留字冲突）

## HTTP 方法选择

| 场景 | HttpClient 方法 |
|------|-----------------|
| 获取资源，需要解析 JSON | `http.get<T>()` |
| 创建资源，需要解析 JSON | `http.post<T>()` |
| 创建资源，不需要响应 | `http.postVoid()` |
| 更新资源，需要解析 JSON | `http.put<T>()` |
| 更新资源，不需要响应 | `http.putVoid()` |
| 部分更新 | `http.patch<T>()` |
| 删除资源，无响应 | `http.delete()` |
| 删除资源，需要解析 JSON | `http.deleteOf<T>()` |
| 文件上传（FormData） | `http.upload<T>()` |
| SSE 流式响应 | `http.sse()` |
| 原始 Response | `http.raw()` |

## 命名约定

- 文件名：kebab-case（`code-favorites.ts`、`agent-store.ts`）
- 工厂函数：`create{PascalCase}Api`
- API 路径：与后端 REST 路由一一对应，`/api/` 前缀
- TypeScript strict 模式，ESNext 模块

## 路径参数编码

URL 中的动态参数（如 workspaceId、channelId）使用模板字符串拼接。查询参数中的用户输入值必须用 `encodeURIComponent()` 编码。

```typescript
// 正确
http.get(`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`)

// 错误 — path 中的特殊字符会破坏 URL
http.get(`/api/workspaces/${workspaceId}/files/content?path=${path}`)
```

## 认证选项

部分 API 需要跳过认证（如 `auth.login`、`version.current`、`inspector.track`），使用 `noAuth: true` 选项：

```typescript
http.post('/api/auth/login', { secretKey }, { noAuth: true })
http.get('/api/version', { noAuth: true })
```

外部 URL 访问（如 `agentStore.fetchIndex`）使用 `absoluteUrl: true, noAuth: true`。

## 类型来源

- 优先从 `@agent-spaces/shared` 导入类型（如 `Workspace`、`AgentConfig`、`Channel`）
- 如果 shared 包中没有对应类型，可以在模块内部定义接口（如 `PromptTemplate`、`SkillInfo`）
- 内部定义的类型需要同时通过 `index.ts` 的 `export type` 导出

## 禁止事项

- 不要在 SDK 中引入任何状态管理逻辑
- 不要在 SDK 中缓存 API 响应
- 不要在 SDK 中做错误重试（由消费方处理）
- 不要在 SDK 中做请求节流/防抖
- 不要引入除 `@agent-spaces/shared` 之外的运行时依赖
