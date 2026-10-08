import type { NextConfig } from "next";
const nodeBuild = process.env.BOT1_NODE_BUILD === "1";
const config: NextConfig = {
  output: nodeBuild ? "standalone" : undefined,
  poweredByHeader: false,
  typescript: {
    tsconfigPath: nodeBuild ? "tsconfig.cloud-run.json" : "tsconfig.json",
  },
};
export default config;
