import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  // Keep isolated browser checks and production builds away from the live preview cache.
  distDir: process.env.COT_NEXT_DIST_DIR || ".next",
  // npm scripts run from this checkout; do not infer a parent workspace root.
  turbopack: { root: process.cwd() },
};
export default config;
