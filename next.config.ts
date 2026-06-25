import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/**/pdfjs-dist/**/*.mjs",
      "./node_modules/**/pdfjs-dist/**/*.js",
      "./node_modules/**/pdf-parse/**/*.mjs",
      "./node_modules/**/pdf-parse/**/*.js"
    ],
  },
};

export default nextConfig;
