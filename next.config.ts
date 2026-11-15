import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // attachments are uploaded through server actions (max 4 MB per file)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
