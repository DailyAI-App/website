import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // officeparser (via pdfjs-dist) and tesseract.js dynamically import their own
  // worker/wasm files by relative path — bundling rewrites those paths and
  // breaks the lookup. Resolve them via plain Node require instead.
  serverExternalPackages: ["officeparser", "pdfjs-dist", "tesseract.js"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
