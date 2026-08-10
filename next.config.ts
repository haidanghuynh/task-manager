import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  devIndicators: {
    position: "bottom-right",
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.154.1",
    "192.168.147.2",
    "192.168.149.136",
  ],
  serverExternalPackages: ["bcryptjs"],
};

export default nextConfig;
