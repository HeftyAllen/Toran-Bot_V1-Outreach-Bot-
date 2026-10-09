import { env } from "@bot1/runtime";
import { getSupabaseDb } from "./supabase-db";
import { decryptSecret, encryptSecret } from "./secret-box";
export type ProviderName = "google_places" | "resend";
export type ProviderRow = {
  id: ProviderName;
  settings: Record<string, unknown>;
  secret_ciphertext: string;
};
export async function providerRow(id: ProviderName) {
  return (
    (
      await getSupabaseDb().select<ProviderRow>("provider_connections", {
        select: "*",
        id: `eq.${id}`,
        limit: 1,
      })
    )[0] ?? null
  );
}
export async function providerCredentials(id: ProviderName) {
  const row = await providerRow(id);
  if (!row)
    throw new Error(
      `Connect ${id === "resend" ? "email delivery" : "Google Places"} in Settings.`,
    );
  if (!env.APP_ENCRYPTION_SECRET || env.APP_ENCRYPTION_SECRET.length < 32)
    throw new Error("Server encryption is not configured.");
  return {
    settings: row.settings,
    ...JSON.parse(
      await decryptSecret(row.secret_ciphertext, env.APP_ENCRYPTION_SECRET),
    ),
  } as {
    settings: Record<string, unknown>;
    apiKey: string;
    webhookSecret?: string;
  };
}
export async function saveProvider(
  id: ProviderName,
  settings: Record<string, unknown>,
  secrets: Record<string, string>,
) {
  if (!env.APP_ENCRYPTION_SECRET || env.APP_ENCRYPTION_SECRET.length < 32)
    throw new Error("Server encryption is not configured.");
  await getSupabaseDb().upsert(
    "provider_connections",
    {
      id,
      settings,
      secret_ciphertext: await encryptSecret(
        JSON.stringify(secrets),
        env.APP_ENCRYPTION_SECRET,
      ),
      updated_at: new Date().toISOString(),
    },
    "id",
  );
}
export function validEmail(raw: unknown) {
  return (
    typeof raw === "string" &&
    raw.length < 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(
      raw,
    )
  );
}
