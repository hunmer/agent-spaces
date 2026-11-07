# 常见问题

## Q: 为什么有些 DELETE 方法命名为 `delete_` 而不是 `delete`？

`delete` 是 JavaScript 保留字，不能用作对象属性名（在不使用引号的情况下）。SDK 约定所有 DELETE 操作的方法名使用 `delete_` 后缀。

## Q: 为什么 chat.ts 的参数类型是 `{ get: Function; ... }` 而不是 `HttpClient`？

这是有意为之的设计。chat 模块接受一个更宽泛的接口类型，降低了对 HttpClient 实现的耦合。其他所有模块都使用 `HttpClient` 类型。

## Q: 如何在运行时切换服务器地址？

```typescript
sdk.updateConfig({ baseUrl: 'http://new-server:3100' });
```

或通过 `setDebug()` 切换调试模式：
```typescript
sdk.setDebug(true);
```

## Q: SDK 如何处理认证过期？

HttpClient 检测到 401/403 状态码后自动调用 `config.onUnauthorized` 回调。web 包通常在此回调中跳转到登录页。

## Q: 如何添加新的 API 模块？

1. 在 `src/modules/` 下创建新文件（如 `new-feature.ts`）
2. 实现 `createNewFeatureApi(http: HttpClient)` 工厂函数
3. 在 `src/index.ts` 中添加导入、导出和注册
4. 在 `SDK` 接口中添加对应属性

## Q: SSE（Server-Sent Events）如何消费？

SDK 的 SSE 方法返回原始 `Response` 对象。调用方需要自行处理流：

```typescript
const response = await sdk.workflow.execute(workflowId);
const reader = response.body?.getReader();
// 逐块读取 SSE 数据...
```

## Q: 为什么有些类型定义在模块内部而不在 shared 包中？

某些类型（如 `PromptTemplate`、`SkillInfo`）仅在 SDK 和 web 之间使用，server 端不直接使用这些类型。将它们放在模块内部可以减少 shared 包的膨胀。如果未来 server 也需要使用，应迁移到 shared 包。

## Q: SDK 有缓存机制吗？

没有。SDK 是纯粹的 HTTP 请求映射层，不做任何缓存。缓存由 web 包的 Zustand store 负责。

## Q: URL 中的参数编码规则是什么？

- 路径参数（如 workspaceId）：直接模板字符串拼接，不需要编码
- 查询参数中的用户输入：必须使用 `encodeURIComponent()` 编码
- 多个查询参数：使用 `URLSearchParams` 构建

## Q: 如何访问底层 HttpClient？

```typescript
const response = await sdk.http.raw('/api/custom-endpoint');
```

通过 `sdk.http` 可以访问底层 HttpClient 的所有方法，用于 SDK 未封装的自定义请求。
