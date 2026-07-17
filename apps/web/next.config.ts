import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@platform/db", "@platform/ai"],
};

export default nextConfig;
