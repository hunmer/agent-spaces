# 测试与质量

## 测试现状

SDK 当前**没有测试文件**。所有 `src/modules/` 目录下均为纯 API 适配器实现，不含 `.spec.ts` 或 `.test.ts` 文件。

## 验证命令

```bash
# 类型检查
pnpm build    # tsc 编译，隐含类型检查

# 开发监听
pnpm dev      # tsc --watch
```

由于 SDK 依赖 `@agent-spaces/shared` 的类型，构建前需确保 shared 包已构建：

```bash
# 从 monorepo 根目录
pnpm build    # 按依赖顺序构建所有包
```

## 质量保障方式

1. **TypeScript strict 模式**：`tsconfig.json` 中 `strict: true`，确保类型安全
2. **编译时验证**：所有 API 方法签名和返回类型在编译时检查
3. **shared 包类型同步**：API 返回类型与 shared 包中定义严格一致
4. **手动验证**：SDK 的正确性主要依赖 web 包集成测试验证

## 潜在改进方向

- 可考虑添加 mock HttpClient 的单元测试，验证各模块的 URL 拼接和参数传递
- 可考虑添加集成测试，通过 mock server 验证完整请求流程
