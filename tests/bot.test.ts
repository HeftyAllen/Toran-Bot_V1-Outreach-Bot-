import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calibration,
  csvCell,
  discoveryContinues,
  estimateOpenAICost,
  extractContacts,
  latestFeedback,
  normalizePhone,
  publicUrl,
  searchSources,
  verifyDiscovery,
  digitalServiceProvider, websiteChecks, qualifyOpportunity, opportunityScore,
  officialWebsite, extractListingContacts, businessListingIdentity, officialSourceWebsite,
} from "../lib/bot-core.ts";
import type { Feedback, OpportunityEvidence } from "../lib/bot-core.ts";

const testUrl = "https://restaurant.example.com/";
test("social profiles and directories are not treated as standalone business websites", () => {
  assert.equal(officialWebsite("https://www.facebook.com/restaurant"),null);
  assert.equal(officialWebsite("https://restaurantguru.com/restaurant"),null);
  assert.equal(officialWebsite("https://www.cylex.net.za/company/restaurant.html"),null);
  assert.equal(officialWebsite("https://www.africabizinfo.com/ZA/restaurant"),null);
  assert.equal(officialWebsite("https://wa.me/27112345678"),null);
  assert.equal(officialWebsite("https://restaurant.netlify.app/"),"https://restaurant.netlify.app/");
});
test("an exact brand-domain source retains its branch URL without inventing a homepage", () => {
  const branch='https://locations.merchantbrand.co.za/midrand?utm_source=search';
  assert.equal(officialSourceWebsite('Merchant Brand',[branch]),branch);
  assert.equal(officialSourceWebsite('Merchant Brand',['https://merchantbrand.co.za.attacker.com/midrand']),null);
  assert.equal(officialSourceWebsite('Merchant Brand',['https://merchantbrand.attacker.co.za/']),null);
  assert.equal(officialSourceWebsite('Merchant Brand',['https://directory.example.com/merchantbrand']),null);
  const source='https://directory.example.com/merchantbrand';
  assert.equal(verifyDiscovery({companyName:'Merchant Brand',region:'Midrand',category:'Restaurant',sourceUrl:source,websiteUrl:'https://merchantbrand.co.za/'},[source,branch])?.websiteUrl,branch);
});
test("directory contacts must belong to the exact named business", () => {
  const html='<footer>Call directory support: 011 999 9999</footer><script type="application/ld+json">'+JSON.stringify({'@graph':[
    {'@type':'Restaurant',name:'Other restaurant',telephone:'011 222 2222',email:'other@example.com'},
    {'@type':'Restaurant',name:'Wanted Restaurant',telephone:'011 333 3333',email:'bookings@example.com'},
  ]})+'</script>';
  const contacts=extractListingContacts(html,testUrl,'27','Wanted Restaurant');
  assert.equal(contacts.phone,'+27113333333');assert.equal(contacts.email,'bookings@example.com');
  assert.equal(contacts.sources.length,2);
  assert.equal(extractListingContacts(html,testUrl,'27','Missing restaurant').phone,null);
});
function prospect(html: string, assessment: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  return qualifyOpportunity({ websiteUrl: testUrl, category: "Restaurant", focus: "all_opportunities",
    pages: [{ url: testUrl, text: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }],
    checks: websiteChecks(html, testUrl), officialSearch: null, identityConfirmed: true,
    assessment: { serviceFit: "Launch", websiteStatus: "healthy", targetMatch: true, competitor: false, opportunityReason: "Generic fit", opportunityEvidence: [], ...assessment }, ...options,
  } as Parameters<typeof qualifyOpportunity>[0]);
}
test("good websites and generic service overlap cannot become high-scoring prospects", () => {
  const o = prospect('<meta name="viewport" content="width=device-width"><h1>Restaurant</h1><p>Online ordering, menu and reservations.</p>');
  assert.equal(o.status, "not_fit"); assert.equal(o.service, "No clear fit");
  assert.equal(opportunityScore(95, o, 10), 15, "Feedback cannot override the opportunity gate");
  assert.equal(digitalServiceProvider("Web Design & Digital Marketing"), true);
  assert.equal(digitalServiceProvider("Ecommerce retail merchant"), false);
  assert.equal(prospect('<p>Call to book a table</p>', { serviceFit: "Scale" }, { category: "Web design agency" }).status, "not_fit");
});
test("website gaps require observable signals instead of an AI opinion about design", () => {
  assert.equal(prospect('<h1>Restaurant</h1><p>Our website is under construction.</p>').service, "Launch");
  assert.equal(prospect('<div style="width:1100px"><h1>Restaurant</h1><p>Menu and bookings</p></div>').status, "qualified");
  const merelyNoViewport = prospect('<h1>Restaurant</h1><p>Menu and bookings</p>', { websiteStatus: "weak" });
  assert.equal(merelyNoViewport.status, "review"); assert.equal(merelyNoViewport.websiteStatus, "unknown");
  assert.equal(opportunityScore(92, merelyNoViewport, 10), 39);
});
test("an unsupported competitor flag cannot label a restaurant as a web agency", () => {
  const o=prospect('<title>Wanted Restaurant</title><meta name="viewport"><h1>Wanted Restaurant</h1><p>Order food online.</p>',{competitor:true});
  assert.equal(o.status,'review');assert.equal(o.service,'No clear fit');
  assert.equal(o.reason,'Business classification needs review before outreach.');
  assert.equal(opportunityScore(95,o),39);
});
test("a missing URL needs a business-specific search and confirmed business identity", () => {
  const html='<h1>Restaurant</h1><p>Sandton Restaurant listing</p>';
  assert.equal(prospect(html, {}, { websiteUrl: null }).status, "review");
  const officialSearch={checkedAt:new Date().toISOString(),sources:[testUrl]};
  const qualified=prospect(html, {}, { websiteUrl: null, officialSearch });
  assert.equal(qualified.status, "qualified");assert.equal(qualified.websiteStatus, "not_found");
  assert.match(qualified.reason,/confirm with the owner/);
  assert.equal(prospect(html, {}, { websiteUrl: null, officialSearch, identityConfirmed: false }).status,"review");
  assert.equal(prospect(html, {}, { websiteUrl: null, officialSearch, identityConfirmed: false }).websiteStatus,"unknown");
});
test("a category directory mentioning a business cannot confirm its individual page", () => {
  const collection='<title>Restaurants in Midrand</title><h1>Midrand restaurants</h1><h2>Wanted Restaurant</h2>';
  assert.equal(businessListingIdentity(collection,'Wanted Restaurant'),false);
  const individual='<title>Wanted Restaurant, Midrand | Business Directory</title><h1>Wanted Restaurant</h1>';
  assert.equal(businessListingIdentity(individual,'Wanted Restaurant'),true);
  assert.equal(businessListingIdentity(individual,'Other Restaurant'),false);
});
test("a decent site can qualify for automation only with an exact, relevant workflow quote", () => {
  const quote="To reserve a table, call our bookings team.";
  const html=`<meta name="viewport"><p>${quote}</p>`;
  const evidence: OpportunityEvidence={kind:"manual_workflow",observation:"Phone-based reservations may benefit from a booking workflow.",quote,url:testUrl};
  const assessment={serviceFit:"Scale",opportunityEvidence:[evidence]};
  assert.equal(prospect(html,assessment).service,"Scale");
  assert.equal(prospect(html,assessment,{focus:"website_gaps"}).status,"review");
  assert.equal(prospect(html,{...assessment,opportunityEvidence:[{...evidence,quote:"Their CRM is broken and they lose customers."}]}).status,"not_fit");
  assert.equal(prospect(html,{...assessment,opportunityEvidence:[{...evidence,url:"https://invented.example.com/"}]}).status,"not_fit");
  const generic="Contact us by phone or email for more information.";
  assert.equal(prospect(`<p>${generic}</p>`,{serviceFit:"Scale",opportunityEvidence:[{...evidence,quote:generic}]}).status,"not_fit");
});
test("manual product ordering can qualify for Sell without calling a good site bad", () => {
  const quote="To order our products, send your order by WhatsApp.";
  const o=prospect(`<meta name="viewport"><p>${quote}</p>`,{serviceFit:"Sell",opportunityEvidence:[{kind:"commerce_gap",quote,url:testUrl,observation:"Manual product orders could move to a checkout."}]});
  assert.equal(o.status,"qualified");assert.equal(o.service,"Sell");assert.equal(o.websiteStatus,"healthy");
});

test("directory evidence keeps a business while an unsupported official website stays unconfirmed", () => {
  const candidate = {
    companyName: "Synthetic Sandton restaurant", region: "Sandton, South Africa",
    category: "Restaurant", sourceUrl: "https://directory.example.com/sandton/restaurants/",
    websiteUrl: "https://unconfirmed.example.com/",
  };
  const source = "https://directory.example.com/sandton/restaurants/?utm_source=search";
  const response = { output: [
    { type: "web_search_call", action: { sources: [{ url: source }] } },
    { type: "message", content: [{ annotations: [{ type: "url_citation", url: source }] }] },
  ] };
  const sources = searchSources(response);
  assert.deepEqual(verifyDiscovery(candidate, sources), { sourceUrl: source, websiteUrl: null });
  assert.equal(verifyDiscovery({ ...candidate, sourceUrl: "https://invented.example.com/" }, sources), null);
  assert.equal(verifyDiscovery({ ...candidate, sourceUrl: "https://directory.example.com/sandton/restaurants/?id=other" }, sources), null);
  assert.equal(verifyDiscovery({ ...candidate, sourceUrl: "https://127.0.0.1/" }, sources), null);
  assert.equal(verifyDiscovery({ ...candidate, companyName: "" }, sources), null);
  assert.equal(verifyDiscovery({ ...candidate, region: "" }, sources), null);
  assert.deepEqual(verifyDiscovery(candidate, [...sources, "https://unconfirmed.example.com/contact"]), {
    sourceUrl: source, websiteUrl: "https://unconfirmed.example.com/",
  });
});

test("an empty first batch allows bounded retries without extending the campaign target", () => {
  assert.equal(discoveryContinues(1, 0, 1), true);
  assert.equal(discoveryContinues(1, 0, 2), true);
  assert.equal(discoveryContinues(1, 0, 3), false);
  assert.equal(discoveryContinues(5, 5, 1), false);
  assert.equal(discoveryContinues(100, 20, 22), false);
});
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
