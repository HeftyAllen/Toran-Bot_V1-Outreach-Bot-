"use client";
import { useState } from "react";
import type { GooglePlace, GoogleSearchResult } from "../lib/provider-types";
import { Globe2, Mail, Search, ArrowUpRight, LoaderCircle } from "lucide-react";
import { countries } from "../lib/search-config";
export type ProviderStatus = { id: string; settings: Record<string, unknown> };
async function request<T>(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
export function ProviderSettings({
  canManage,
  providers,
  onSaved,
}: {
  canManage: boolean;
  providers: ProviderStatus[];
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const connected = (id: string) => providers.find((p) => p.id === id);
  async function save(e: React.FormEvent<HTMLFormElement>, provider: string) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const body = {
        provider,
        ...Object.fromEntries(f.entries()),
        dailyLimit: Number(f.get("dailyLimit") ?? 10),
        unitCostUsd: Number(f.get("unitCostUsd")),
      };
      const data = await request<{ message: string }>(
        "/api/integrations/providers",
        body,
      );
      form.reset();
      setMessage(data.message);
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(id: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/integrations/providers?provider=${id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not disconnect.");
      await onSaved();
      setMessage("Disconnected.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel settings-panel provider-settings">
      <h2>Discovery & email connections</h2>
      <p>
        Save credentials here from any device. Keys are encrypted and never
        returned to the dashboard.
      </p>
      {message && (
        <p role="status" className="auth-message">
          {message}
        </p>
      )}
      <form
        className="bot-form integration-form"
        onSubmit={(e) => void save(e, "google_places")}
      >
        <h3>
          <Globe2 size={18} />
          Google Places{" "}
          <span>
            {connected("google_places") ? "Connected" : "Needs setup"}
          </span>
        </h3>
        <p>
          Enable{" "}
          <a
            href="https://console.cloud.google.com/apis/library/places.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Places API (New)
          </a>{" "}
          and billing in Google Cloud. This connection provides live Maps
          lookup; its details stay separate from saved/exported leads.
        </p>
        <fieldset disabled={!canManage || busy}>
          <label>
            Google Places API key
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder="Paste your restricted server key"
              required
            />
          </label>
          <label>
            Conservative estimate per search (USD)
            <input
              name="unitCostUsd"
              type="number"
              min={0.035}
              max={1}
              step={0.001}
              defaultValue={Number(
                connected("google_places")?.settings.unitCostUsd ?? 0.04,
              )}
              required
            />
          </label>
          {canManage && (
            <button className="button button-outline">
              Verify & connect Google
            </button>
          )}
        </fieldset>
        {canManage && connected("google_places") && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void disconnect("google_places")}
          >
            Disconnect Google
          </button>
        )}
      </form>
      <form
        className="bot-form integration-form"
        onSubmit={(e) => void save(e, "resend")}
      >
        <h3>
          <Mail size={18} />
          Email delivery{" "}
          <span>{connected("resend") ? "Connected" : "Needs setup"}</span>
        </h3>
        <p>
          Use{" "}
          <a href="https://resend.com/domains" target="_blank" rel="noreferrer">
            Resend
          </a>{" "}
          with a verified sending domain. Replies go to your reply-to inbox.
          Automatic sending is selected separately for each campaign.
        </p>
        <fieldset disabled={!canManage || busy}>
          <label>
            Resend API key
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder="re_…"
              required
            />
          </label>
          <div className="inline-fields">
            <label>
              Sender name
              <input
                name="fromName"
                defaultValue={String(
                  connected("resend")?.settings.fromName ?? "Toran Digital",
                )}
                maxLength={100}
                required
              />
            </label>
            <label>
              Sender email
              <input
                name="fromAddress"
                type="email"
                defaultValue={String(
                  connected("resend")?.settings.fromAddress ?? "",
                )}
                placeholder="hello@toran.co.za"
                required
              />
            </label>
          </div>
          <label>
            Reply-to email
            <input
              name="replyTo"
              type="email"
              defaultValue={String(connected("resend")?.settings.replyTo ?? "")}
              placeholder="Your monitored inbox"
              required
            />
          </label>
          <label>
            Public dashboard URL
            <input
              name="publicBaseUrl"
              type="url"
              defaultValue={String(
                connected("resend")?.settings.publicBaseUrl ??
                  (typeof window !== "undefined" ? window.location.origin : ""),
              )}
              required
            />
          </label>
          <div className="inline-fields">
            <label>
              Daily email limit (UTC)
              <input
                name="dailyLimit"
                type="number"
                min={1}
                max={100}
                defaultValue={Number(
                  connected("resend")?.settings.dailyLimit ?? 10,
                )}
                required
              />
            </label>
            <label>
              Estimate per email (USD)
              <input
                name="unitCostUsd"
                type="number"
                min={0.0001}
                max={1}
                step={0.0001}
                defaultValue={Number(
                  connected("resend")?.settings.unitCostUsd ?? 0.001,
                )}
                required
              />
            </label>
          </div>
          <label>
            Resend webhook signing secret
            <input
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder="Optional: whsec_… for delivery/bounce tracking"
            />
          </label>
          <p>
            Webhook URL: <code>/api/email/webhook</code>. Subscribe to
            delivered, bounced, complained and failed events. Configure your
            domain and key before sending.
          </p>
          {canManage && (
            <button className="button button-outline">
              Verify & connect email
            </button>
          )}
        </fieldset>
        {canManage && connected("resend") && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void disconnect("resend")}
          >
            Disconnect email
          </button>
        )}
      </form>
    </div>
  );
}
export function GoogleLookup({
  connected,
  canManage,
  countryCode,
  onUsageChanged,
}: {
  connected: boolean;
  canManage: boolean;
  countryCode: string;
  onUsageChanged: () => Promise<void>;
}) {
  const [country, setCountry] = useState(countryCode),
    [query, setQuery] = useState(""),
    [area, setArea] = useState(""),
    [radius, setRadius] = useState(""),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState("");
  const [places, setPlaces] = useState<GooglePlace[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState<string | null>(null),
    [missing, setMissing] = useState(false),
    [last, setLast] = useState<Record<string, unknown> | null>(null);
  async function search(pageToken?: string) {
    setBusy(true);
    setNotice("");
    try {
      const body =
        pageToken && last
          ? { ...last, pageToken }
          : {
              countryCode: country,
              query,
              area,
              ...(radius
                ? { radiusKm: Number(radius), latitude: lat, longitude: lng }
                : {}),
            };
      const data = await request<GoogleSearchResult>("/api/maps/search", body);
      setPlaces(data.places);
      setNext(data.nextPageToken);
      setLast(body);
      setNotice(
        `${data.notice} Estimated request cost $${Number(data.estimatedCostUsd).toFixed(3)}.`,
      );
      await onUsageChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Google lookup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel maps-lookup">
      <summary>
        <Globe2 size={18} />
        Explore live Google Maps listings{" "}
        <span>{connected ? "Connected" : "Connect in Settings"}</span>
      </summary>
      <p>
        Find local businesses and see whether Google lists a website. Results
        are live, attributed to Google Maps, and excluded from saved leads and
        CSV exports. Web research remains useful for online-only stores.{" "}
        <a href="/terms" target="_blank" rel="noreferrer">
          Terms
        </a>{" "}
        ·{" "}
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </p>
      <form
        className="bot-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <fieldset disabled={!connected || !canManage || busy}>
          <div className="campaign-fields">
            <label>
              Business type
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Plumbers"
                maxLength={200}
                required
              />
            </label>
            <label>
              City or area
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Nairobi"
                maxLength={150}
                required
              />
            </label>
            <label>
              Country
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>Optional radius around a specific point</summary>
            <div className="campaign-fields">
              <label>
                Radius (km)
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </label>
              <label>
                Centre latitude
                <input
                  type="number"
                  min={-89}
                  max={89}
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  required={!!radius}
                />
              </label>
              <label>
                Centre longitude
                <input
                  type="number"
                  min={-179}
                  max={179}
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  required={!!radius}
                />
              </label>
            </div>
            <p>
              Use coordinates from a point you choose on a map. The bot does not
              guess a search centre.
            </p>
          </details>
          <button className="button button-outline">
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Search size={15} />
            )}
            Search Google listings
          </button>
        </fieldset>
      </form>
      {notice && <p role="status">{notice}</p>}
      {places.length > 0 && (
        <>
          <div className="maps-attribution" translate="no">
            Google Maps
          </div>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => setMissing(e.target.checked)}
            />
            Show listings with no website listed
          </label>
          <div className="maps-results">
            {places
              .filter((p) => !missing || !p.websiteUri)
              .map((p) => (
                <article key={p.id}>
                  <strong>{p.displayName?.text}</strong>
                  <p>{p.formattedAddress}</p>
                  <span>
                    {p.websiteUri
                      ? "Website listed"
                      : "No website listed on Google"}
                  </span>
                  {p.internationalPhoneNumber && (
                    <p>{p.internationalPhoneNumber}</p>
                  )}
                  {p.googleMapsUri && (
                    <a href={p.googleMapsUri} target="_blank" rel="noreferrer">
                      View on Google Maps <ArrowUpRight size={13} />
                    </a>
                  )}
                  {p.websiteUri && /^https?:\/\//.test(p.websiteUri) && (
                    <a href={p.websiteUri} target="_blank" rel="noreferrer">
                      Listed website <ArrowUpRight size={13} />
                    </a>
                  )}
                  {p.attributions?.map((a, i) => (
                    <small key={i}>
                      {a.providerUri && /^https:\/\//.test(a.providerUri) ? (
                        <a
                          href={a.providerUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.provider}
                        </a>
                      ) : (
                        a.provider
                      )}
                    </small>
                  ))}
                </article>
              ))}
          </div>
          {places.filter((p) => !missing || !p.websiteUri).length === 0 && (
            <p>No listings on this page match that filter.</p>
          )}
        </>
      )}
      {next && (
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => void search(next)}
        >
          Next Google results page
        </button>
      )}
    </details>
  );
}
