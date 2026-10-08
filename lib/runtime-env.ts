/** Server-only runtime bindings. The Sites build aliases this module to worker-env. */
export const env: Record<string, string | undefined> = {
  ...process.env,
  APP_RUNTIME: process.env.APP_RUNTIME ?? "cloud-run",
};
