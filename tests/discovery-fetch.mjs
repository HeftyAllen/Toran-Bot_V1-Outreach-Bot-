// Isolated standalone-server fixtures. All website/AI responses are synthetic.
import assert from "node:assert/strict";
import https from "node:https";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
const originalFetch = globalThis.fetch;
const originalRequest = https.request;
const originalLookup = dns.lookup;
const directory = "https://directory.example.com/sandton/restaurant-one/";
const good = "https://restaurant-two.example.com/";
const nice = "https://restaurant-nice.example.com/";
const weak = "https://restaurant-weak.example.com/";
const brand = "https://restaurant-brand.example.com/";
const collection = "https://directory.example.com/sandton/restaurants/";
const brandBranch = "https://locations.syntheticchainrestaurant.co.za/sandton";
const fixtures = new Map([
  [
    directory,
    "<h1>Synthetic directory restaurant</h1><p>Restaurant in Sandton, South Africa.</p>",
  ],
  [
    "https://salon.example.com/",
    '<title>Synthetic Nairobi salon</title><meta name="viewport"><h1>Synthetic Nairobi salon</h1><p>Salon in Nairobi, Kenya. Online appointment booking.</p><a href="tel:0712345678">Phone</a><a href="mailto:hello@salon.example.com">Email</a>',
  ],
  [
    good,
    '<title>Synthetic official restaurant</title><meta name="viewport" content="width=device-width"><h1>Synthetic official restaurant</h1><p>View our menu, order online or use our online reservations.</p>',
  ],
  [
    nice,
    '<title>Synthetic nice restaurant</title><meta name="viewport" content="width=device-width"><h1>Synthetic nice restaurant</h1><p>Online ordering, payments and reservations are available.</p>',
  ],
  [
    weak,
    '<title>Synthetic weak restaurant</title><h1>Synthetic weak restaurant</h1><p>Our website is under construction.</p><a href="tel:+27112345678">Phone</a>',
  ],
  [
    brand,
    '<title>Synthetic chain restaurant</title><meta name="viewport" content="width=device-width"><h1>Synthetic chain restaurant</h1><p>Find your local branch and order online with online payments.</p>',
  ],
  [
    collection,
    "<title>Restaurants in Sandton</title><h1>Sandton restaurants</h1><h2>Synthetic collection restaurant</h2><p>Other restaurant listings</p>",
  ],
  [
    brandBranch,
    '<title>Synthetic chain restaurant Sandton</title><meta name="viewport" content="width=device-width"><h1>Synthetic chain restaurant</h1><p>Order online with online payments at our Sandton branch.</p>',
  ],
]);
function fixture(raw) {
  const url = new URL(raw);
  url.search = "";
  return fixtures.get(url.href);
}
const syntheticHost = (host) =>
  host.endsWith(".example.com") ||
  host === "locations.syntheticchainrestaurant.co.za";
dns.lookup = async (host, options) =>
  syntheticHost(host)
    ? options?.all
      ? [{ address: "93.184.216.34", family: 4 }]
      : { address: "93.184.216.34", family: 4 }
    : originalLookup(host, options);
https.request = (url, options, callback) => {
  if (!syntheticHost(url.hostname))
    return originalRequest(url, options, callback);
  assert.ok(
    fixture(url.href),
    "Unexpected synthetic website request: " + url.href,
  );
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = (error) => request.emit("error", error);
  request.end = () =>
    setImmediate(() => {
      const response = Readable.from([Buffer.from(fixture(url.href))]);
      response.statusCode = 200;
      response.headers = { "content-type": "text/html" };
      callback(response);
    });
  return request;
};
syncBuiltinESMExports();
let searches = 0;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith("https://places.googleapis.com/v1/places:searchText")) {
    const query = JSON.parse(init.body);
    assert.ok(init.headers["X-Goog-Api-Key"]);
    if (init.headers["X-Goog-FieldMask"] === "places.id")
      return Response.json({ places: [{ id: "synthetic-key-check" }] });
    const place = (id, country, websiteUri) => ({
      id,
      displayName: { text: "Synthetic Google " + id },
      formattedAddress: "Nairobi, Kenya",
      addressComponents: [{ types: ["country"], shortText: country }],
      location: { latitude: -1.286, longitude: 36.817 },
      businessStatus: "OPERATIONAL",
      googleMapsUri: "https://www.google.com/maps/place/" + id,
      internationalPhoneNumber: "+254712345678",
      ...(websiteUri ? { websiteUri } : {}),
      attributions: [
        { provider: "Synthetic source", providerUri: "https://example.com/" },
      ],
    });
    return Response.json({
      places: [
        place("missing", "KE"),
        place("website", "KE", "https://merchant.example.com/"),
        place("wrong-country", "ZA"),
        { ...place("closed", "KE"), businessStatus: "CLOSED_PERMANENTLY" },
      ],
      nextPageToken: query.pageToken ? undefined : "synthetic-next-page",
    });
  }
  if (url === "https://api.resend.com/domains")
    return Response.json({
      data: [{ name: "merchant.example.com", status: "verified" }],
    });
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(init.body);
    assert.ok(init.headers["Idempotency-Key"].startsWith("bot1-"));
    assert.match(
      body.text,
      /Unsubscribe: https:\/\/dashboard\.example\.com\/unsubscribe/,
    );
    assert.ok(body.headers["List-Unsubscribe"]);
    if (body.to[0] === "unknown@merchant.example.com")
      return new Response("", { status: 503 });
    return Response.json({ id: "synthetic-email-" + body.to[0] });
  }
  if (
    url.startsWith("https://www.googleapis.com/pagespeedonline/v5/runPagespeed")
  )
    return Response.json({
      lighthouseResult: {
        categories: {
          performance: { score: 0.25 },
          accessibility: { score: 0.8 },
        },
        audits: {
          "largest-contentful-paint": {
            id: "largest-contentful-paint",
            title: "Slow loading in mobile lab",
            score: 0.2,
            numericValue: 5200,
          },
          "cumulative-layout-shift": { numericValue: 0.1 },
        },
      },
    });
  if (url !== "https://api.openai.com/v1/responses") {
    assert.ok(
      url.startsWith("http://127.0.0.1:"),
      "Unexpected external test request: " + url,
    );
    return originalFetch(input, init);
  }
  const body = JSON.parse(init.body);
  const name = body.text.format.name;
  const payload = JSON.parse(body.input.at(-1).content[0].text);
  let result,
    sources = [];
  if (name === "campaign_plan") {
    result = {
      businessTypes: ["Salons", "Plumbers"],
      areas: ["Nairobi", "Mombasa"],
      countryCode: "KE",
      count: 30,
      budgetUsd: 2,
      websiteFilter: "missing",
      includeAutomation: false,
      excludeChains: true,
      exclusions: ["chains"],
      targetMode: "candidates",
      warnings: [],
    };
  } else if (name === "business_discovery") {
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal(body.max_tool_calls, 1);
    assert.equal(body.tools[0].type, "web_search");
    assert.match(body.input[0].content[0].text, /CUSTOMERS for Toran/);
    if (payload.searchCountry === "Kenya") {
      assert.equal(payload.market, "Salons");
      assert.equal(payload.locations, "Nairobi, Kenya");
      assert.equal(payload.excludeChains, true);
      sources = ["https://salon.example.com/"];
      result = {
        businesses: [
          {
            companyName: "Synthetic Nairobi salon",
            websiteUrl: "https://salon.example.com/",
            sourceUrl: "https://salon.example.com/",
            category: "Salon",
            region: "Nairobi, Kenya",
          },
        ],
      };
    } else {
      searches++;
      sources = [directory + "?utm_source=search", good + "about/", nice, weak];
      const make = (
        companyName,
        websiteUrl,
        sourceUrl,
        category = "Restaurant",
      ) => ({
        companyName,
        websiteUrl,
        sourceUrl,
        category,
        region: "Sandton, South Africa",
      });
      result = {
        businesses:
          searches < 3
            ? []
            : searches === 3
              ? [
                  make(
                    "Synthetic vendor",
                    good,
                    good + "about/",
                    "Web design agency",
                  ),
                  make(
                    "Synthetic directory restaurant",
                    "https://unconfirmed.example.com/",
                    directory,
                  ),
                  make("Synthetic official restaurant", good, good + "about/"),
                ]
              : searches === 4
                ? [make("Synthetic nice restaurant", nice, nice)]
                : [make("Synthetic weak restaurant", weak, weak)],
      };
    }
  } else if (name === "official_website_lookup") {
    assert.match(
      body.input[0].content[0].text,
      /parent or franchise brand website/i,
    );
    assert.equal(
      payload.listing,
      undefined,
      "Directory URLs must not bias the official-site query",
    );
    if (payload.name === "Synthetic chain restaurant") {
      sources = [brandBranch];
      result = { websiteUrl: "", sourceUrl: "" };
    } else if (payload.name === "Synthetic collection restaurant") {
      sources = [collection];
      result = { websiteUrl: "", sourceUrl: "" };
    } else {
      assert.equal(payload.name, "Synthetic directory restaurant");
      sources = [directory];
      result = { websiteUrl: "", sourceUrl: "" };
    }
  } else {
    assert.equal(name, "lead_review");
    assert.equal(body.model, "gpt-4.1-mini");
    assert.ok(payload.pages.every((p) => fixture(p.url)));
    result = {
      score: 95,
      confidence: "high",
      serviceFit: "Launch",
      summary: "Synthetic assessment.",
      evidence: [],
      draftSubject: "A potential website opportunity",
      draftBody: "May we share a website proposal? Let us know to opt out.",
      address: "",
      websiteStatus: payload.business.website_url ? "healthy" : "not_found",
      targetMatch: true,
      competitor: false,
      opportunityReason: "Synthetic observation",
      opportunityEvidence: [],
      chainStatus: "independent",
      chainEvidenceQuote: "",
      chainEvidenceUrl: "",
    };
  }
  return Response.json({
    id: "synthetic-" + name + "-" + searches,
    status: "completed",
    usage: { input_tokens: 1000, output_tokens: 300 },
    output: [
      ...(sources.length
        ? [
            {
              type: "web_search_call",
              action: {
                type: "search",
                sources: sources.map((url) => ({ type: "url", url })),
              },
            },
          ]
        : []),
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(result),
            annotations: [],
          },
        ],
      },
    ],
  });
};
