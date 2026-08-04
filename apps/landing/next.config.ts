import type { NextConfig } from "next";

const config: NextConfig = {
  /*
   * Static export. The landing page must deploy to any static host with no
   * database, no server and no runtime: it is a page about a product, not the
   * product. `next build` writes `out/`, which can be dropped on GitHub Pages,
   * Netlify, Cloudflare Pages or an S3 bucket unchanged.
   *
   * The practical consequence: no API routes, no server actions, no dynamic
   * params in this app. If any appear, the build fails rather than silently
   * needing a Node process, which is the failure worth catching early.
   */
  output: "export",
  images: { unoptimized: true },
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default config;
