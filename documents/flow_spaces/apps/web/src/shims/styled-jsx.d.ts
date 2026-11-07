// styled-jsx 类型补齐：Next.js 内置 styled-jsx（next-env.d.ts 的
// `/// <reference types="next" />` 环境里自带），Vite 下无 next，
// 业务组件（如 components/ui/morphing-spinner.tsx）的 <style jsx> 需要
// 这里的声明合并才能通过 typecheck。零业务改动，仅补环境。
import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    /** styled-jsx 标记：作用域样式（对应 styled-jsx 的 jsx 属性） */
    jsx?: boolean;
    /** styled-jsx 全局样式标记 */
    global?: boolean;
  }
}
