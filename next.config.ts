import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "pdf-parse-fixed"],
};

export default nextConfig;
