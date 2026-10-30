import type { NextConfig } from "next";

// Project Zephyr is a client-driven demo app: all interactive state lives in a
// shared React provider, so Cache Components / Partial Prefetching are
// intentionally left off (they add prerender restrictions we don't need here).
const nextConfig: NextConfig = {
  reactStrictMode: true,
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
