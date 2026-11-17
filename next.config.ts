import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdf-parse (pdfjs-dist) dynamically imports its own worker file by relative
  // path — bundling it rewrites that path and breaks the lookup. Resolve it
  // via plain Node require instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
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
