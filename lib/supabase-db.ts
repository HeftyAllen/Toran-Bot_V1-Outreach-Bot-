import { env } from "@bot1/runtime";

type RuntimeBindings = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_DB_ACCESS_SECRET?: string;
  SUPABASE_SECRET_KEY?: string;
};

type QueryValue = string | number;
type Query = Record<string, QueryValue>;

export class SupabaseDbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SupabaseDbError";
  }
}

export class SupabaseDb {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly internalToken: string;
  private readonly secretMode: boolean;

  constructor() {
    const bindings = env as typeof env & RuntimeBindings;
    const url = bindings.SUPABASE_URL?.trim();
    const serverKey = bindings.SUPABASE_SECRET_KEY?.trim();
    const publishableKey = serverKey || bindings.SUPABASE_PUBLISHABLE_KEY?.trim();
    const internalToken = bindings.SUPABASE_DB_ACCESS_SECRET?.trim();
    if (!url || !publishableKey || (!serverKey && !internalToken)) {
      throw new Error("Supabase database configuration is incomplete.");
    }
    this.baseUrl = url.replace(/\/$/, "");
    this.publishableKey = publishableKey;
    this.internalToken = internalToken ?? "";
    this.secretMode = Boolean(serverKey);
  }

  async rpc<T>(name: string, args: unknown): Promise<T> {
    return this.request<T>(`rpc/${name}`, "POST", {}, args);
  }

  async select<T>(table: string, query: Query): Promise<T[]> {
    return this.request<T[]>(table, "GET", query);
  }

  async insert<T>(table: string, row: unknown): Promise<T[]> {
    return this.request<T[]>(table, "POST", {}, row, "return=representation");
  }

  async upsert<T>(table: string, row: unknown, conflict: string): Promise<T[]> {
    return this.request<T[]>(
      table,
      "POST",
      { on_conflict: conflict },
      row,
      "resolution=merge-duplicates,return=representation",
    );
  }

  async patch<T>(table: string, filters: Query, row: unknown): Promise<T[]> {
    return this.request<T[]>(
      table,
      "PATCH",
      filters,
      row,
      "return=representation",
    );
  }

  async delete<T>(table: string, filters: Query): Promise<T[]> {
    return this.request<T[]>(
      table,
      "DELETE",
      filters,
      undefined,
      "return=representation",
    );
  }

  private async request<T>(
    table: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    query: Query,
    body?: unknown,
    prefer?: string,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }

    const headers = new Headers({
      apikey: this.publishableKey,
      Accept: "application/json",
      "Cache-Control": "no-store",
    });
    if (!this.secretMode || this.publishableKey.startsWith("eyJ")) headers.set("Authorization", `Bearer ${this.publishableKey}`);
    if (this.internalToken) headers.set("x-bot1-internal-token", this.internalToken);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (prefer) headers.set("Prefer", prefer);

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const responseText = await response.text();
    let payload: unknown = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === "object"
        ? payload as { message?: unknown; code?: unknown }
        : {};
      const message = typeof detail.message === "string"
        ? detail.message.slice(0, 240)
        : `Supabase returned status ${response.status}.`;
      throw new SupabaseDbError(
        message,
        response.status,
        typeof detail.code === "string" ? detail.code : undefined,
      );
    }
    return (payload ?? []) as T;
  }
}

export function getSupabaseDb() {
  return new SupabaseDb();
}
