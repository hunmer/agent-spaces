import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  webpack(config, { dev, isServer }) {
    if (dev && !isServer) {
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
    ];
  },
  transpilePackages: ["flexlayout-react"],
};

export default nextConfig;
