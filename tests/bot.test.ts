import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calibration,
  csvCell,
  estimateOpenAICost,
  extractContacts,
  latestFeedback,
  normalizePhone,
  publicUrl,
} from "../lib/bot-core.ts";
import type { Feedback } from "../lib/bot-core.ts";
test("public website validation rejects credentials, metadata and private/IP addresses", () => {
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://user:pass@example.com",
    "https://metadata.google.internal",
    "https://example.local",
    "https://example.com:8443",
  ])
    assert.equal(publicUrl(url), null);
  assert.equal(
    publicUrl("https://example.com/contact#top"),
    "https://example.com/contact",
  );
});
test("public contact extraction keeps footer contacts and records exact source", () => {
  const source = "https://example.com/contact";
  const c = extractContacts(
    '<footer><a href="tel:011 234 5678">Call</a><a href="mailto:info@example.com?subject=Hi">Email</a><a href="https://wa.me/27112345678">WhatsApp</a></footer>',
    source,
    "27",
  );
  assert.equal(c.phone, "+27112345678");
  assert.equal(c.email, "info@example.com");
  assert.equal(c.whatsappUrl, "https://wa.me/27112345678");
  assert.ok(c.sources.every((x) => x.url === source));
  assert.equal(extractContacts("<p>No contacts</p>", source, "27").phone, null);
});
test("normalization requires valid international digit lengths", () => {
  assert.equal(normalizePhone("+44 20 7946 0958", "27"), "+442079460958");
  assert.equal(normalizePhone("00 27 11 234 5678"), "+27112345678");
  assert.equal(normalizePhone("123"), null);
});
const feedback = (id: string, outcome: string): Feedback => ({
  lead_id: id,
  company_name: id,
  outcome,
  service_fit: "Launch",
  region: "Sandton",
  category: "Restaurant",
  note: null,
  created_at: "2026-10-08T00:00:00Z",
});
test("one business contributes one learning example and sparse feedback does not boost scores", () => {
  const events = [
    feedback("same", "poor_fit"),
    ...Array.from({ length: 20 }, () => feedback("same", "won")),
  ];
  assert.equal(latestFeedback(events).length, 1);
  assert.equal(calibration(events, "Launch", "Sandton", "Restaurant").delta, 0);
  const positive = Array.from({ length: 10 }, (_, i) =>
    feedback(String(i), "won"),
  );
  assert.ok(calibration(positive, "Launch", "Sandton", "Restaurant").delta > 0);
  assert.equal(
    calibration(positive, "Scale", "Sandton", "Restaurant").delta,
    0,
  );
  assert.ok(
    Math.abs(calibration(positive, "Launch", "Sandton", "Restaurant").delta) <=
      10,
  );
});
test("search estimates include tool fee and conservative search-content block", () => {
  assert.equal(estimateOpenAICost("gpt-4.1-mini", 1000, 1000, 0, 1), 0.0152);
  assert.equal(estimateOpenAICost("gpt-4o-mini", 1000, 1000, 500, 0), 0.000713);
});
test("CSV export neutralises spreadsheet formulas and quotes values", () => {
  assert.equal(csvCell('=IMPORTXML("secret")'), '"\'=IMPORTXML(""secret"")"');
  assert.equal(csvCell("Normal, business"), '"Normal, business"');
});
import { optOut, verifyWebhook, withinServiceWindow } from "../lib/bot-core.ts";
test("WhatsApp signatures reject changed payloads and missing signatures", async () => {
  const body = '{"entry":[]}';
  const secret = "test-app-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const signature = "sha256=" + Buffer.from(signed).toString("hex");
  assert.equal(await verifyWebhook(body, signature, secret), true);
  assert.equal(await verifyWebhook(body + " ", signature, secret), false);
  assert.equal(await verifyWebhook(body, "", secret), false);
});
test("WhatsApp text replies expire after 24 hours and STOP is recognised", () => {
  assert.equal(
    withinServiceWindow(new Date(Date.now() - 3600000).toISOString()),
    true,
  );
  assert.equal(
    withinServiceWindow(new Date(Date.now() - 25 * 3600000).toISOString()),
    false,
  );
  assert.equal(withinServiceWindow(null), false);
  assert.equal(optOut("STOP!"), true);
  assert.equal(optOut("unsubscribe"), true);
  assert.equal(optOut("Hello"), false);
});
test("plain-text contacts are captured without telephone/email links", () => {
  const c = extractContacts(
    "<footer>Phone: +27 (0)11 234 5678<br>Email: bookings@example.com</footer>",
    "https://example.com",
    "27",
  );
  assert.equal(c.phone, "+27112345678");
  assert.equal(c.email, "bookings@example.com");
});
