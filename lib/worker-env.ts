import { env as bindings } from "cloudflare:workers";
export const env = bindings as unknown as Record<string, string | undefined>;
