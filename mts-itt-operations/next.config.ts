import type { NextConfig } from "next";

// Unique id per server start. The app compares it with the id stored in the browser and resets the demo data on a mismatch,
// so restarting the server (npm run dev / npm start) always begins from the clean, empty system.
const SERVER_RUN_ID = String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SERVER_RUN_ID: SERVER_RUN_ID },
  // a separate build folder can be used for checks while the dev server runs: NEXT_DIST_DIR=.next-check npx next build
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
