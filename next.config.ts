import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let Webpack/Turbopack bundle pdf-parse and pdfjs-dist natively
  // which automatically handles their worker imports.
};

export default nextConfig;
