import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(projectRoot, '../..');

const nextConfig: NextConfig = {
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
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3100/api/:path*",
      },
      {
        source: "/ws",
        destination: "http://localhost:3100/ws",
      },
      {
        source: "/static/:path*",
        destination: "http://localhost:3100/public/:path*",
      },
    ];
  },
  transpilePackages: ["flexlayout-react"],
};

export default nextConfig;
