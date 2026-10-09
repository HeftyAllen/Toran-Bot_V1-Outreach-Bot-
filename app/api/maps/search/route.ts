import { requireApiUser } from "../../../../lib/server-auth";
import { providerCredentials } from "../../../../lib/providers";
import { getSupabaseDb } from "../../../../lib/supabase-db";
import { countryInfo } from "../../../../lib/search-config";
import type { GooglePlace } from "../../../../lib/provider-types";
export async function POST(request: Request) {
  const { user, member, response } = await requireApiUser();
  if (!user || !member) return response;
  if (member.role !== "owner")
    return Response.json(
      { error: "Owner access required for paid searches." },
      { status: 403 },
    );
  const db = getSupabaseDb();
  let usageId: string | undefined;
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const country = countryInfo(input.countryCode),
      query = String(input.query ?? "").trim(),
      area = String(input.area ?? "").trim();
    if (
      !country ||
      query.length < 2 ||
      query.length > 200 ||
      area.length < 2 ||
      area.length > 150
    )
      throw new Error("Choose a country, one business type and one city/area.");
    const credentials = await providerCredentials("google_places");
    const cost = Number(credentials.settings.unitCostUsd);
    const body: Record<string, unknown> = {
      textQuery: `${query} in ${area}, ${country.name}`,
      regionCode: country.code,
      pageSize: 20,
      includePureServiceAreaBusinesses: true,
    };
    if (input.pageToken) {
      const token = String(input.pageToken);
      if (token.length > 2000) throw new Error("Invalid page token.");
      body.pageToken = token;
    }
    if (input.radiusKm !== undefined && input.radiusKm !== "") {
      const radius = Number(input.radiusKm),
        lat = Number(input.latitude),
        lng = Number(input.longitude);
      if (
        !Number.isFinite(radius) ||
        radius < 1 ||
        radius > 50 ||
        input.latitude === "" ||
        input.longitude === "" ||
        !Number.isFinite(lat) ||
        Math.abs(lat) > 90 ||
        !Number.isFinite(lng) ||
        Math.abs(lng) > 180
      )
        throw new Error(
          "For a radius, provide a centre latitude/longitude and 1–50 km.",
        );
      // A rectangular restriction covers the circle; results are then checked
      // against the exact user-supplied radius before display.
      const dLat = radius / 111.32,
        dLng =
          radius / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      if (Math.abs(lat) + dLat >= 90 || Math.abs(lng) + dLng >= 180)
        throw new Error("Choose an area away from the poles or date line.");
      body.locationRestriction = {
        rectangle: {
          low: { latitude: lat - dLat, longitude: lng - dLng },
          high: { latitude: lat + dLat, longitude: lng + dLng },
        },
      };
    }
    usageId = await db.rpc<string>("bot1_reserve_cost", {
      p_run_id: null,
      p_kind: "maps_lookup",
      p_model: "Places Text Search Enterprise",
      p_max_usd: cost,
      p_metadata: {
        estimate: true,
        source: "Configured conservative Google request estimate",
      },
    });
    await db.patch(
      "usage_events",
      { id: `eq.${usageId}` },
      { provider: "google_places" },
    );
    const result = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": credentials.apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.businessStatus,places.websiteUri,places.internationalPhoneNumber,places.googleMapsUri,places.attributions,nextPageToken",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!result.ok) {
      await db.patch(
        "usage_events",
        { id: `eq.${usageId}` },
        {
          state: result.status >= 500 ? "unconfirmed" : "void",
          cost_usd: result.status >= 500 ? null : 0,
        },
      );
      throw new Error(
        `Google search failed (${result.status}). Check the connection in Settings.`,
      );
    }
    const data = (await result.json()) as {
      places?: GooglePlace[];
      nextPageToken?: string;
    };
    await db.patch(
      "usage_events",
      { id: `eq.${usageId}` },
      {
        state: "estimated",
        cost_usd: cost,
        metadata: {
          source:
            "Configured estimate; free allowances and invoices may differ",
          priceDate: "2026-10-09",
        },
      },
    );
    const places = (Array.isArray(data.places) ? data.places : []).filter(
      (p) =>
        p.businessStatus !== "CLOSED_PERMANENTLY" &&
        p.addressComponents?.some(
          (c) => c.types?.includes("country") && c.shortText === country.code,
        ),
    );
    const filtered = places.filter((p) => {
      if (!body.locationRestriction) return true;
      if (!p.location) return false;
      const lat = Number(input.latitude),
        lng = Number(input.longitude);
      const r = Math.PI / 180,
        a =
          Math.sin(((p.location.latitude - lat) * r) / 2) ** 2 +
          Math.cos(lat * r) *
            Math.cos(p.location.latitude * r) *
            Math.sin(((p.location.longitude - lng) * r) / 2) ** 2;
      return (
        6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) <=
        Number(input.radiusKm)
      );
    });
    // No place names, addresses, phones, websites or results are persisted or
    // sent to the AI model. The client displays live Google data with attribution.
    return Response.json(
      {
        places: filtered,
        nextPageToken: data.nextPageToken ?? null,
        estimatedCostUsd: cost,
        notice:
          "Live Google results. No website listed is not proof no site exists. Google details are not saved or exported as CRM leads.",
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (e) {
    if (usageId)
      await db.patch(
        "usage_events",
        { id: `eq.${usageId}`, state: "eq.reserved" },
        { state: "unconfirmed" },
      );
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not search Google." },
      { status: 400 },
    );
  }
}
