import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(projectRoot, '../..');

const nextConfig: NextConfig = {
  output: "export",
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
        source: "/static/:path*",
        destination: `${serverUrl}/public/:path*`,
      },
    ];
  },
  transpilePackages: ["flexlayout-react"],
};

export default nextConfig;
