import type { NextConfig } from "next";

const config: NextConfig = {
  /*
   * The ledger uses Node's built-in `node:sqlite`, not `better-sqlite3`: a
   * `serverExternalPackages` entry for the latter was left over from the phase
   * 02 plan and externalised a package this repo does not depend on.
   *
   * Nothing replaces it. `node:` builtins are external to the bundler by
   * definition, and a deployed snapshot instance never reaches them at all:
   * every path to SQLite is behind a dynamic import that only the live source
   * takes.
   */
  // The workspace packages are plain ESM compiled to dist/, so they need no
  // transpilation. Listed here only to make the dependency explicit to Next's
  // module resolution when running from a pnpm symlinked node_modules.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default config;
