import { env } from "@bot1/runtime";
import { decryptSecret } from "./secret-box";
import { getSupabaseDb } from "./supabase-db";
export type WhatsAppConnection = {
  phone_number_id: string;
  api_version: string;
  token_cipher: string;
  app_secret_cipher: string;
  verify_token_cipher: string;
  label: string;
};
export function encryptionKey() {
  const key = env.APP_ENCRYPTION_SECRET;
  if (typeof key !== "string" || key.length < 32)
    throw new Error("Integration encryption is not configured.");
  return key;
}
export async function connection() {
  const rows = await getSupabaseDb().select<WhatsAppConnection>(
    "whatsapp_connection",
    { select: "*", id: "eq.1", limit: 1 },
  );
  return rows[0] ?? null;
}
export async function credentials(row: WhatsAppConnection) {
  const key = encryptionKey();
  return {
    token: await decryptSecret(row.token_cipher, key),
    appSecret: await decryptSecret(row.app_secret_cipher, key),
    verifyToken: await decryptSecret(row.verify_token_cipher, key),
  };
}
export { verifyWebhook, withinServiceWindow, optOut } from "./bot-core";
