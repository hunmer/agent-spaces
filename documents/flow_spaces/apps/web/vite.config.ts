import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Dev proxy target: agent-spaces server.
 * Override with SERVER_URL env var if needed.
 */
const SERVER_TARGET = process.env.SERVER_URL || "http://127.0.0.1:3110";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // `@` → src (same convention as the original project)
      { find: "@", replacement: r("./src") },
      // `next/*` → compatibility shims (see MIGRATION-NOTES.md)
      // resolver appends the extension (.ts) automatically.
      { find: /^next\/(.*)$/, replacement: r("./src/shims/next") + "/$1" },
      // `next-intl` → pure React provider shim (locale fixed via provider)
      { find: /^next-intl$/, replacement: r("./src/shims/next-intl.tsx") },
    ],
  },
  define: {
    // The only NEXT_PUBLIC_* var used by the original codebase
    // (src/lib/server.ts, src/proxy.ts). Empty string → fall back to
    // window.location.hostname, same as the original default behavior.
    "process.env.NEXT_PUBLIC_SERVER_URL": JSON.stringify(
      process.env.NEXT_PUBLIC_SERVER_URL ?? "",
    ),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: SERVER_TARGET, changeOrigin: true },
      "/ws": { target: SERVER_TARGET, changeOrigin: true, ws: true },
      "/public": { target: SERVER_TARGET, changeOrigin: true },
    },
  },
});
