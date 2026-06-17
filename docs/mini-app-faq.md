# Mini-app 常见坑（FAQ）

记录 mini-app 开发中容易踩到的、非显而易见的问题与解法。每条尽量讲清「现象 → 根因 → 解法」。

---

## Tailwind 任意值 / 不常见 class 在 mini-app 里不生效

### 现象

在 mini-app 源码（`src/**/*.jsx`）里写的 Tailwind class，表现不一致：

- **常见 class 正常**：`mt-4`、`mb-3`、`flex`、`gap-3`、`grid grid-cols-2` 等能用。
- **任意值 class 失效**：`max-h-[calc(100vh-125px)]`、`w-[320px]`、`text-[13px]` 等带方括号的任意值不生效。任意值是按**精确字符串**撞名的——即便 web 项目用过 `max-h-[60vh]`，只要 `max-h-[calc(100vh-125px)]` 这个确切字符串没在 `packages/web/src` 出现过，就不会生成对应 CSS。
- **冷门 / 响应式组合 class 失效**：`columns-2`、`sm:columns-2`、`xl:columns-3` 等 web 项目里没怎么用过的 class 不生效。

典型表现：滚动容器加 `max-h-[calc(100vh-125px)] overflow-y-auto` 没有高度限制也不滚动；瀑布流 `sm:columns-2` 永远是单列。

### 根因

mini-app 的 className **不经过 Tailwind JIT 即时编译**，而是依赖**宿主 web 项目预编译好的那份 Tailwind CSS**。

- 宿主用 TailwindCSS 4，其内容扫描（content detection）只覆盖 `packages/web/src/**`。
- mini-app 的 `src/` 在 `packages/server/agent-spaces-data/mini-apps/<id>/src/`，**不在扫描范围**内。
- 渲染器（`mini-app-renderer.tsx`）是 `@babel/standalone` + `new Function()` 沙箱，只编译 JSX / 模块，**不跑 Tailwind 构建**。无论编辑器内嵌预览还是独立预览页（iframe），DOM 都挂在这份宿主 CSS 之下。

因此 mini-app 写的 class，**只有恰好和 `packages/web/src` 源码里出现过的 class 撞名时**才会命中已编译的 CSS 规则：

- 高频 utility（spacing / flex / 基础 grid / 基础 text-border）几乎一定被编译 → 能用。
- 任意值 `[...]` 几乎不可能撞名 → 不生效。
- 冷门 class（`columns-*` 等）撞名概率低 → 多半不生效。

### 解法（按优先级）

1. **关键样式用内联 `style`**。`max-height` / `overflow` / `width` / `grid-template-columns` 等直接写内联 style，完全绕开 Tailwind：

   ```jsx
   <div style={{ maxHeight: 'calc(100vh - 125px)', overflowY: 'auto' }}>
   ```

2. **响应式 / 复杂样式用注入 `<style>` + 自定义 class**。内联 style 写不了 `@media`，需要响应式时注入一段 `<style>`：

   ```jsx
   <>
     {/* 类名加项目前缀（如 cw-）避免与宿主 class 冲突 */}
     <style>{`
       .cw-scroll{max-height:calc(100vh - 125px);overflow-y:auto;padding-right:.25rem}
       .cw-grid{column-count:1;column-gap:.75rem}
       @media(min-width:640px){.cw-grid{column-count:2}}
     `}</style>
     <div className="mt-4 cw-scroll">
       <div className="cw-grid">{/* cards */}</div>
     </div>
   </>
   ```

   注意：注入的 `<style>` 是宿主 document 的全局样式，**自定义 class 一定要带项目前缀**（`cw-` / `ma-` / `<projectId>-`），否则可能命中或覆盖宿主样式。

3. **优先复用宿主组件**。`window.AgentSpacesUI` 暴露的 shadcn 组件自带样式，不依赖你的 className 是否被编译。

### 实际案例：copywriting 文案库两列瀑布流 + 滚动

`packages/server/agent-spaces-data/mini-apps/copywriting/src/index.jsx` 一开始用：

```jsx
<div className="mt-4 max-h-[calc(100vh-125px)] overflow-y-auto pr-1">
  <div className="columns-1 sm:columns-2 xl:columns-3 gap-3">
```

`max-h-[...]` 任意值 + `sm:columns-2` 冷门 class 都没被宿主编译 → 高度限制和两列都不生效。改成注入 `<style>`（见上例）后正常。

**还要注意**：卡片 className 里的 `break-inside-avoid`（防卡片被列分割）**同样没被编译**——经 grep 验证，`packages/web/src` 里 `columns-*` / `break-inside` **零使用**。单靠卡片上的 class，column-count 瀑布流会把一个卡片的内容劈到两列。因此注入 CSS 里必须显式补一条 `.cw-grid>*{break-inside:avoid}`，不要依赖 className。

### 判断准则

某个 class 在 mini-app 里安不安全：

- web 项目高频使用的**基础 utility**（`mt-*` / `mb-*` / `flex` / `gap-*` / `grid` / `grid-cols-2` / `text-*` / `rounded-*` / `border` 等）→ **通常安全**。
- **任意值** `[...]` → **一律不安全**，改内联 style。
- **冷门或首次使用的 class**（`columns-*` / `aspect-*` / 某些 `sm:`/`xl:` 组合）→ **默认不安全**，改注入 `<style>` 或内联 style。
- 不确定时，最稳的就是内联 style / 注入 `<style>`，不要赌它撞名。

> 渲染机制详见 [mini-app-renderer.md](mini-app-renderer.md)（Babel 沙箱、宿主 CSS、`window.AgentSpacesUI` 注入）。
