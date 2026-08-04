import type { NextConfig } from "next";

const config: NextConfig = {
  // better-sqlite3 is a native module. Bundling it breaks the binding lookup,
  // so Next must require it at runtime instead. The dashboard reads the ledger
  // directly in its route handlers, so this is load-bearing, not tidiness.
  serverExternalPackages: ["better-sqlite3"],
  // The workspace packages are plain ESM compiled to dist/, so they need no
  // transpilation. Listed here only to make the dependency explicit to Next's
  // module resolution when running from a pnpm symlinked node_modules.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default config;
