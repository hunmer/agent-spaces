import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
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
