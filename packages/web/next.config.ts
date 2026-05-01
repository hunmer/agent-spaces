import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
