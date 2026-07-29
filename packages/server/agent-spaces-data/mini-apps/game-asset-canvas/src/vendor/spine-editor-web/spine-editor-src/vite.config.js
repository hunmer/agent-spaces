import { defineConfig } from 'vite';

// base: './' 产出相对路径，让产物可被 mini-app 的 src/file 路由服务（director-desk-web 同款模式）。
// 独立构建后把 dist/ 内容拷到上层 vendor/spine-editor-web/。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 单 chunk，避免动态 import 在 srcdoc/iframe 相对路径重写下出问题。
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // pixi-spine 4.0.6 声明的是 pixi v7 子包 peerDep；vite 构建独立 bundle 时无需外部化。
  optimizeDeps: {
    include: ['pixi.js', '@pixi-spine/all-4.0'],
  },
});
