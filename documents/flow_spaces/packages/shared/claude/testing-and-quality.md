# 测试与质量

## 测试现状

当前 `@agent-spaces/shared` 包**没有独立的测试文件**。

类型正确性通过以下间接方式验证：

1. **TypeScript 编译**：`pnpm build`（`tsc`）会检查所有类型定义的内部一致性
2. **server 编译**：server 包引用 shared 类型，编译时验证类型兼容性
3. **web 编译**：web 包通过 sdk 间接引用，编译时验证类型兼容性
4. **sdk 编译**：sdk 包直接引用 shared 类型，编译时验证

## 验证命令

```bash
# 编译检查本包类型
pnpm --filter @agent-spaces/shared build

# 全项目类型检查（包含 shared 类型在消费方的验证）
pnpm typecheck
```

## 质量工具

本包未配置独立的 lint 或 format 工具。代码风格通过以下方式保证：

- **TypeScript strict 模式**：`strict: true` 确保类型安全
- **ESNext 模块**：强制使用现代模块语法
- **monorepo 级别工具**：如果根目录配置了 ESLint/Prettier，会覆盖本包

## 类型导出完整性

可以通过以下方式快速验证所有类型是否正确导出：

```bash
# 编译成功即表示所有 export * 链完整
pnpm --filter @agent-spaces/shared build

# 检查 dist/index.d.ts 是否包含所有期望的类型
cat packages/shared/dist/index.d.ts
```

## 潜在改进

- 可考虑添加 `tsc --noEmit` 作为 CI 检查步骤
- 可考虑使用 `attw` (arethetypeswrong) 验证 package.json exports 配置正确性
