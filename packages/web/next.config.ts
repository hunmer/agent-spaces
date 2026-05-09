import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(projectRoot, '../..');

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport && { output: "export" }),
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
  ],
  turbopack: {
    root: monorepoRoot,
  },
  webpack(config, { dev }) {
    if (dev) {
      config.module.rules.push({
        test: /\.[jt]sx?$/,
        include: path.join(projectRoot, "src"),
        enforce: "pre",
        use: [
          {
            loader: path.join(projectRoot, "inspect-source-loader.cjs"),
          },
        ],
      });

      // Fix pnpm monorepo symlink path mismatch for react-dev-inspector
      config.snapshot ??= {};
      config.snapshot.managedPaths = [];
    }

    return config;
  },
  ...(!isStaticExport && {
    async rewrites() {
      const serverUrl = process.env.SERVER_URL || "http://localhost:3100";
      return [
        {
          source: "/api/:path*",
          destination: `${serverUrl}/api/:path*`,
        },
        {
          source: "/ws",
          destination: `${serverUrl}/ws`,
        },
        {
          source: "/public/:path*",
          destination: `${serverUrl}/public/:path*`,
        },
        {
          source: "/static/:path*",
          destination: `${serverUrl}/public/:path*`,
        },
      ];
    },
  }),
  transpilePackages: ["flexlayout-react"],
};

export default withNextIntl(nextConfig);
