declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ENCRYPTION_SECRET?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_DB_ACCESS_SECRET?: string;
    OWNER_EMAIL?: string;
    OPENAI_API_KEY?: string;
    APP_SESSION_SECRET?: string;
  }
}
