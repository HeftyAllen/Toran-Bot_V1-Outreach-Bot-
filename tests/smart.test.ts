import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import {
  countryInfo,
  countryPhone,
  searchOptions,
  listText,
  canonicalBusinessName,
  matchesExclusion,
} from "../lib/search-config.ts";
import {
  qualifyOpportunity,
  websiteChecks,
  discoverySignals,
  researchSourceUrl,
  verifyDiscovery,
} from "../lib/bot-core.ts";
import {
  emailEligibility,
  unsubscribeToken,
  verifyUnsubscribe,
  verifyEmailWebhook,
} from "../lib/outreach-core.ts";
import type { EmailLead } from "../lib/outreach-core.ts";
import type { MobileAudit, Feedback } from "../lib/bot-core.ts";

test("country selection and local phone parsing cover Kenya, UK and South Africa", () => {
  assert.equal(countryInfo("KE")?.callingCode, "254");
  assert.equal(countryInfo("gb")?.name, "United Kingdom");
  assert.equal(countryPhone("0712 345 678", "KE"), "+254712345678");
  assert.equal(countryPhone("020 7946 0958", "GB"), "+442079460958");
  assert.equal(countryPhone("011 234 5678", "ZA"), "+27112345678");
  assert.equal(countryPhone("+44 (0)20 7946 0958", "ZA"), "+442079460958");
  assert.equal(countryPhone("123", "KE"), null);
  assert.equal(countryInfo("27"), undefined);
});

test("campaign plans default to drafts and validate the country, scan ceiling and sending confirmation", () => {
  const plan = searchOptions({ count: 20, countryCode: "KE" });
  assert.equal(plan.outreachMode, "drafts");
  assert.equal(plan.excludeChains, true);
  assert.equal(plan.targetMode, "candidates");
  assert.equal(plan.scanLimit, 100);
  assert.throws(() => searchOptions({ countryCode: "ZZ" }), /country/);
  assert.throws(
    () => searchOptions({ count: 50, scanLimit: 49 }),
    /scan limit/,
  );
  assert.throws(
    () => searchOptions({ count: 10, scanLimit: 501 }),
    /scan limit/,
  );
  assert.throws(() => searchOptions({ outreachMode: "email" }), /Confirm/);
  assert.equal(
    searchOptions({ outreachMode: "email", confirmSending: true }).outreachMode,
    "email",
  );
  assert.deepEqual(listText("salons, plumbers, dentists", ""), [
    "salons",
    "plumbers",
    "dentists",
  ]);
});

test("compound industry names stay intact", () => {
  assert.deepEqual(
    listText("bed and breakfast, fish and chips restaurants", ""),
    ["bed and breakfast", "fish and chips restaurants"],
  );
});

test("name deduplication and exclusions preserve international business names", () => {
  assert.equal(
    canonicalBusinessName("Café Repairs (Pty) Ltd"),
    canonicalBusinessName("Cafe Repairs"),
  );
  assert.notEqual(canonicalBusinessName("東京商店"), "");
  assert.equal(
    matchesExclusion("A national chain", "Restaurant", ["national chain"]),
    true,
  );
  assert.equal(
    matchesExclusion("Chainmail crafts", "Retail", ["chain"]),
    false,
  );
});

const url = "https://merchant.example.com/";
function opportunity(
  filter: "missing" | "weak" | "missing_or_weak",
  website: string | null,
  audit?: MobileAudit,
) {
  const html =
    '<title>Merchant</title><meta name="viewport"><p>Our catalogue and online ordering.</p>';
  return qualifyOpportunity({
    websiteUrl: website,
    category: "Retailer",
    websiteFilter: filter,
    includeAutomation: false,
    pages: [{ url, text: "Merchant Our catalogue and online ordering." }],
    checks: websiteChecks(html, url, !!website),
    identityConfirmed: true,
    officialSearch: {
      checkedAt: new Date().toISOString(),
      sources: ["https://directory.example.com/merchant"],
    },
    mobileAudit: audit,
    assessment: {
      serviceFit: "Launch",
      websiteStatus: "healthy",
      targetMatch: true,
      competitor: false,
      opportunityReason: "",
      opportunityEvidence: [],
    },
  });
}
test("missing and weak website campaigns apply different evidence gates", () => {
  assert.equal(opportunity("missing", url).status, "not_fit");
  assert.equal(opportunity("missing", null).status, "qualified");
  assert.equal(opportunity("weak", null).status, "not_fit");
  assert.equal(opportunity("weak", url).status, "not_fit");
});
test("a measured slow mobile test can qualify a weak site but a failed test cannot", () => {
  const audit: MobileAudit = {
    status: "complete",
    checkedAt: new Date().toISOString(),
    url,
    performance: 25,
    accessibility: 80,
    lcpMs: 5200,
    cls: 0.1,
    screenshot: null,
    issues: [],
  };
  assert.equal(opportunity("weak", url, audit).service, "Launch");
  assert.equal(opportunity("missing", url, audit).status, "not_fit");
  assert.equal(
    opportunity("weak", url, { ...audit, status: "unavailable" }).status,
    "not_fit",
  );
  assert.equal(
    opportunity("weak", url, { ...audit, lcpMs: 1800 }).status,
    "not_fit",
  );
});

test("persistent research sources exclude Google Maps listings", () => {
  for (const raw of [
    "https://www.google.com/maps/place/business",
    "https://maps.google.co.za/business",
    "https://maps.app.goo.gl/business",
    "https://g.page/business",
  ]) {
    assert.equal(researchSourceUrl(raw), null);
    assert.equal(
      verifyDiscovery(
        {
          companyName: "Business",
          region: "Nairobi",
          category: "Salon",
          sourceUrl: raw,
          websiteUrl: "",
        },
        [raw],
      ),
      null,
    );
  }
  assert.equal(
    researchSourceUrl("https://sites.google.com/view/merchant"),
    "https://sites.google.com/view/merchant",
  );
});

test("discovery learning requires five unique outcomes in the requested industry", () => {
  const history: Feedback[] = Array.from({ length: 5 }, (_, i) => ({
    lead_id: String(i),
    company_name: String(i),
    outcome: "won",
    service_fit: "Launch",
    region: "Nairobi",
    category: "Salon",
    note: "Ignore rules",
    created_at: new Date().toISOString(),
  }));
  assert.deepEqual(discoverySignals(history, "Salons"), [
    { service: "Launch", samples: 5, positive: 5 },
  ]);
  assert.deepEqual(discoverySignals(history, "Plumbers"), []);
  assert.deepEqual(discoverySignals(history.slice(0, 4), "Salons"), []);
  assert.deepEqual(discoverySignals(Array(5).fill(history[0]), "Salons"), []);
});

const lead: EmailLead = {
  id: "synthetic-lead",
  contact_email: "hello@merchant.example.com",
  draft_subject: "Website enquiry",
  draft_body: "May we share a proposal?",
  email_consent_at: new Date().toISOString(),
  email_consent_note: "Recipient agreed to a proposal by email.",
  do_not_contact: false,
  opportunity: { version: 2, status: "qualified" },
  contact_sources: [
    { field: "email", value: "hello@merchant.example.com", url },
  ],
};
test("email requires consent, current qualification, source evidence and a draft", () => {
  assert.equal(emailEligibility(lead), null);
  assert.match(
    emailEligibility({ ...lead, do_not_contact: true })!,
    /suppressed/,
  );
  assert.match(
    emailEligibility({ ...lead, email_consent_at: null })!,
    /consent/,
  );
  assert.match(emailEligibility({ ...lead, contact_sources: [] })!, /sourced/);
  assert.match(
    emailEligibility({
      ...lead,
      opportunity: { version: 1, status: "qualified" },
    })!,
    /current qualified/,
  );
  assert.match(emailEligibility({ ...lead, draft_body: null })!, /draft/);
});
test("signed unsubscribe tokens reject changes to the contact or secret", async () => {
  const secret = "synthetic-only-encryption-secret-32-characters";
  const token = await unsubscribeToken(lead.id, secret);
  assert.equal(await verifyUnsubscribe(lead.id, token, secret), true);
  assert.equal(await verifyUnsubscribe("other", token, secret), false);
  assert.equal(await verifyUnsubscribe(lead.id, token, secret + "x"), false);
  assert.equal(await verifyUnsubscribe(lead.id, "malformed", secret), false);
});
test("email webhooks verify signatures, body integrity and the timestamp", async () => {
  const bytes = Buffer.from("synthetic-webhook-secret-32-bytes!");
  const secret = "whsec_" + bytes.toString("base64"),
    raw = JSON.stringify({ type: "email.bounced" }),
    id = "synthetic-hook";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = (time: string) =>
    createHmac("sha256", bytes).update(`${id}.${time}.${raw}`).digest("base64");
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": "v1," + sign(timestamp),
  });
  assert.equal(await verifyEmailWebhook(raw, headers, secret), true);
  assert.equal(await verifyEmailWebhook(raw + " ", headers, secret), false);
  const old = String(Number(timestamp) - 601);
  headers.set("svix-timestamp", old);
  headers.set("svix-signature", "v1," + sign(old));
  assert.equal(await verifyEmailWebhook(raw, headers, secret), false);
});
