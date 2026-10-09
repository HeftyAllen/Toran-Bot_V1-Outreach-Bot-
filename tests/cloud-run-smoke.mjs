// Runs the actual standalone server against an isolated in-memory database mock.
// No real credentials, paid requests, live DB writes, or messages are used.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, createHash } from "node:crypto";
import assert from "node:assert/strict";
const sessionSecret =
  "synthetic-smoke-test-session-secret-at-least-32-characters";
const workerSecret = "synthetic-smoke-test-worker-secret";
const inviteToken = "synthetic-invitation-token-for-isolated-tests";
const members = [
  { email: "owner@example.test", role: "owner" },
  { email: "viewer@example.test", role: "viewer" },
  {
    email: "partner@example.test",
    role: "viewer",
    invite_token_hash: createHash("sha256")
      .update(inviteToken)
      .digest("base64url"),
    invite_expires_at: new Date(Date.now() + 60000).toISOString(),
  },
  {
    email: "expired@example.test",
    role: "viewer",
    invite_token_hash: createHash("sha256")
      .update(inviteToken)
      .digest("base64url"),
    invite_expires_at: new Date(Date.now() - 60000).toISOString(),
  },
];
const settings = {
  id: 1,
  brand_name: "Toran test",
  brand_domain: "",
  target_market: "Restaurants",
  target_locations: "Sandton, South Africa",
  services: "Websites",
  automation_enabled: true,
  research_limit: 3,
  run_budget_usd: 1,
  monthly_budget_usd: 5,
  whatsapp_unit_cost_usd: null,
  calling_code: "27",
  search_country: "ZA",
};
const runs = [];
const lead = {
  id: "test-lead",
  company_name: "Test restaurant",
  website_url: "https://example.com",
  region: "Sandton",
  status: "queued",
  evidence: [],
  contact_sources: [],
  do_not_contact: false,
  fit_score: null,
  created_at: new Date().toISOString(),
};
const tables = {
  workspace_settings: [settings],
  leads: [lead],
  runs,
  feedback_events: [],
  usage_events: [],
  outreach_messages: [],
  whatsapp_inbound: [],
  whatsapp_connection: [],
  provider_connections: [],
};
let workerEnabled = false;
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://mock");
  const table = url.pathname.replace("/rest/v1/", "");
  res.setHeader("Content-Type", "application/json");
  let rows;
  if (table === "workspace_members") {
    const email = (url.searchParams.get("email") ?? "").replace("eq.", "");
    const token = (url.searchParams.get("invite_token_hash") ?? "").replace(
      "eq.",
      "",
    );
    const expiry = (url.searchParams.get("invite_expires_at") ?? "").replace(
      "gt.",
      "",
    );
    rows = members.filter(
      (x) =>
        (!email || x.email === email) &&
        (!token || x.invite_token_hash === token) &&
        (!expiry || (x.invite_expires_at && x.invite_expires_at > expiry)),
    );
    if (req.method === "PATCH") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw || "{}");
      rows.forEach((x) => Object.assign(x, input));
    }
  } else if (table.startsWith("rpc/")) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw || "{}");
    if (table === "rpc/bot1_usage_summary")
      rows = {
        monthEstimatedUsd: 0,
        monthActualUsd: 0,
        monthReservedUsd: 0,
        allTimeEstimatedUsd: 0,
        allTimeActualUsd: 0,
        unconfirmedCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        searchCalls: 0,
        trackingSince: null,
      };
    else if (table === "rpc/bot1_run_spend")
      rows = runs
        .slice(-20)
        .reverse()
        .map((r) => ({
          runId: r.id,
          spentUsd: tables.usage_events
            .filter(
              (u) =>
                u.run_id === r.id && ["actual", "estimated"].includes(u.state),
            )
            .reduce((n, u) => n + Number(u.cost_usd ?? 0), 0),
          reservedUsd: 0,
          emailUsd: 0,
          unconfirmedCount: 0,
        }));
    else if (table === "rpc/bot1_claim_smart_run") {
      const job =
        workerEnabled && settings.automation_enabled
          ? runs.find((x) => x.status === "running")
          : undefined;
      if (job) {
        job.lease_token = input.p_token;
        job.search_rounds ??= 0;
      }
      rows = job ? [job] : [];
    } else if (table === "rpc/bot1_reserve_cost") {
      const allocation = (events) =>
        events
          .filter((u) => u.state !== "void")
          .reduce((n, u) => n + Number(u.cost_usd ?? u.reserved_usd), 0);
      const run = runs.find((x) => x.id === input.p_run_id);
      if (
        allocation(tables.usage_events) + input.p_max_usd >
          settings.monthly_budget_usd ||
        (run &&
          allocation(tables.usage_events.filter((u) => u.run_id === run.id)) +
            input.p_max_usd >
            run.config.budgetUsd)
      ) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ message: "Budget reached" }));
      }
      const id = `synthetic-usage-${tables.usage_events.length}`;
      tables.usage_events.push({
        id,
        run_id: input.p_run_id,
        kind: input.p_kind,
        model: input.p_model,
        provider: "openai",
        reserved_usd: input.p_max_usd,
        cost_usd: null,
        state: "reserved",
        created_at: new Date().toISOString(),
      });
      rows = id;
    } else if (table === "rpc/bot1_prepare_email") {
      const lead = tables.leads.find((x) => x.id === input.p_lead_id),
        connection = tables.provider_connections.find((x) => x.id === "resend"),
        job = runs.find((x) => x.id === input.p_run_id);
      const reject = (reason) => {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: reason }));
      };
      if (
        !settings.automation_enabled ||
        (input.p_run_id &&
          (!job ||
            job.status !== "running" ||
            job.config.outreachMode !== "email"))
      )
        return reject("Campaign stopped or paused");
      if (
        !lead ||
        lead.do_not_contact ||
        !lead.email_consent_at ||
        !lead.email_consent_note ||
        lead.opportunity?.status !== "qualified" ||
        lead.opportunity.version !== 2 ||
        !lead.draft_body ||
        !lead.draft_subject
      )
        return reject("Consent and qualified draft required");
      if (
        !lead.contact_sources?.some(
          (s) =>
            s.field === "email" &&
            s.value === lead.contact_email &&
            s.url.startsWith("https://"),
        )
      )
        return reject("Sourced email required");
      if (
        tables.outreach_messages.some(
          (m) =>
            m.lead_id === lead.id &&
            m.channel === "email" &&
            ["pending", "unknown", "sent", "delivered", "read"].includes(
              m.status,
            ),
        )
      )
        return reject("Email already sent or unresolved");
      if (!connection) return reject("Connect email");
      if (
        tables.outreach_messages.filter((m) => m.channel === "email").length >=
        connection.settings.dailyLimit
      )
        return reject("Email daily limit reached");
      const allocation = tables.usage_events
        .filter((u) => u.state !== "void")
        .reduce((n, u) => n + Number(u.cost_usd ?? u.reserved_usd), 0);
      if (
        allocation + connection.settings.unitCostUsd >
        settings.monthly_budget_usd
      )
        return reject("Monthly budget reached");
      const usageId = `synthetic-usage-${tables.usage_events.length}`,
        messageId = `synthetic-message-${tables.outreach_messages.length}`;
      tables.usage_events.push({
        id: usageId,
        run_id: input.p_run_id,
        kind: "email_send",
        provider: "resend",
        state: "reserved",
        reserved_usd: connection.settings.unitCostUsd,
        cost_usd: null,
        created_at: new Date().toISOString(),
      });
      tables.outreach_messages.push({
        id: messageId,
        lead_id: lead.id,
        request_key: input.p_key,
        recipient: lead.contact_email,
        kind: "email",
        channel: "email",
        status: "pending",
        content: lead.draft_body,
        usage_id: usageId,
        created_at: new Date().toISOString(),
      });
      rows = {
        messageId,
        usageId,
        recipient: lead.contact_email,
        subject: lead.draft_subject,
        body: lead.draft_body,
      };
    } else rows = [];
  } else {
    rows = tables[table] ?? [];
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw || "{}");
      const existing = url.searchParams.has("on_conflict")
        ? rows.find((x) => x.id === input.id)
        : undefined;
      if (existing) Object.assign(existing, input);
      else
        rows.push({
          ...input,
          processed: 0,
          failed: 0,
          qualified: 0,
          discovered: 0,
          candidates_seen: 0,
          excluded: 0,
          duplicates: 0,
          sent_count: 0,
          outreach_index: 0,
          created_at: new Date().toISOString(),
        });
      rows = [existing ?? rows.at(-1)];
    } else {
      rows = rows.filter((row) =>
        [...url.searchParams].every(([key, value]) =>
          value.startsWith("eq.")
            ? String(row[key]) === value.slice(3)
            : value.startsWith("in.(")
              ? value.slice(4, -1).split(",").includes(row[key])
              : true,
        ),
      );
      if (req.method === "PATCH") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const input = JSON.parse(raw || "{}");
        rows.forEach((x) => Object.assign(x, input));
      }
      if (req.method === "DELETE")
        tables[table] = tables[table].filter((x) => !rows.includes(x));
    }
  }
  if (req.method === "GET" && Array.isArray(rows)) {
    const order = url.searchParams.get("order");
    if (order) {
      const [column, direction] = order.split(".");
      rows.sort(
        (a, b) =>
          String(a[column] ?? "").localeCompare(String(b[column] ?? "")) *
          (direction === "desc" ? -1 : 1),
      );
    }
    const limit = Number(url.searchParams.get("limit"));
    if (limit > 0) rows = rows.slice(0, limit);
  }
  const select = url.searchParams.get("select");
  if (req.method === "GET" && select && select !== "*" && Array.isArray(rows))
    rows = rows.map((row) =>
      Object.fromEntries(select.split(",").map((key) => [key, row[key]])),
    );
  res.end(JSON.stringify(rows));
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const dbPort = mock.address().port;
const port = 4267;
let output = "";
const child = spawn(process.execPath, ["scripts/start-cloud-run.mjs"], {
  env: {
    ...process.env,
    NODE_OPTIONS: "--import ./tests/discovery-fetch.mjs",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    APP_RUNTIME: "cloud-run",
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`,
    SUPABASE_SECRET_KEY: "sb_secret_SYNTHETIC_TEST",
    APP_SESSION_SECRET: sessionSecret,
    APP_ENCRYPTION_SECRET: sessionSecret,
    WORKER_SECRET: workerSecret,
    OPENAI_API_KEY: "synthetic-never-used",
    OWNER_EMAIL: "owner@example.test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (output += d));
function cookie(email) {
  const payload = Buffer.from(
    JSON.stringify({ email, expiresAt: Math.floor(Date.now() / 1000) + 600 }),
  ).toString("base64url");
  return `bot1_session=${payload}.${createHmac("sha256", sessionSecret).update(payload).digest("base64url")}`;
}
async function call(path, method = "GET", body, auth) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(auth
        ? { Cookie: auth.startsWith("bot1_session=") ? auth : cookie(auth) }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await call("/api/health")).status === 200) break;
    } catch {}
    if (i === 59) throw new Error("Server did not start: " + output);
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal((await call("/api/overview")).status, 401);
  const spoofed = await fetch(`http://127.0.0.1:${port}/api/overview`, {
    headers: {
      "oai-authenticated-user-id": "spoof",
      "oai-authenticated-user-email": "owner@example.test",
    },
  });
  assert.equal(
    spoofed.status,
    401,
    "Cloud Run must not trust identity headers",
  );
  const signin = await call("/signin");
  assert.equal(signin.status, 200);
  const html = await signin.text();
  const css = html.match(/href="([^\"]+\.css[^\"]*)"/);
  assert.ok(css, "Signin stylesheet should exist");
  assert.equal(
    (await call(css[1].replaceAll("&amp;", "&"))).status,
    200,
    "Standalone static assets should be served",
  );
  assert.equal(
    (
      await call(
        "/api/auth/password",
        "POST",
        { password: "short" },
        "owner@example.test",
      )
    ).status,
    400,
  );
  const saved = await call(
    "/api/auth/password",
    "POST",
    { password: "Synthetic first password 🔐" },
    "owner@example.test",
  );
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).ok, true);
  assert.ok(saved.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(members[0].password_hash.startsWith("scrypt$16384$8$5$"));
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "owner@example.test",
        password: "incorrect password",
      })
    ).status,
    401,
  );
  const login = await call("/api/auth/login", "POST", {
    email: "owner@example.test",
    password: "Synthetic first password 🔐",
  });
  assert.equal(login.status, 200);
  const ownerCookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await call("/api/overview", "GET", undefined, ownerCookie)).status,
    200,
    "A real login cookie must work from another browser",
  );
  assert.equal(
    (
      await call(
        "/api/auth/password",
        "POST",
        { password: "Synthetic replacement password" },
        ownerCookie,
      )
    ).status,
    403,
    "Password sessions must supply the current password",
  );
  const changed = await call(
    "/api/auth/password",
    "POST",
    {
      currentPassword: "Synthetic first password 🔐",
      password: "Synthetic replacement password",
    },
    ownerCookie,
  );
  assert.equal(changed.status, 200);
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "owner@example.test",
        password: "Synthetic first password 🔐",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "owner@example.test",
        password: "Synthetic replacement password",
      })
    ).status,
    200,
  );
  const logout = await call("/api/auth/logout", "POST", {}, ownerCookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal(
    (
      await call("/api/auth/invite", "POST", {
        email: "expired@example.test",
        token: inviteToken,
        password: "Synthetic partner password",
      })
    ).status,
    410,
  );
  const activated = await call("/api/auth/invite", "POST", {
    email: "partner@example.test",
    token: inviteToken,
    password: "Synthetic partner password",
  });
  assert.equal(activated.status, 200);
  const partnerCookie = activated.headers.get("set-cookie").split(";")[0];
  assert.equal(members[2].invite_token_hash, null);
  assert.equal(
    (
      await call("/api/auth/invite", "POST", {
        email: "partner@example.test",
        token: inviteToken,
        password: "Synthetic partner password",
      })
    ).status,
    410,
    "Invitation links must be single use",
  );
  assert.equal(
    (await call("/api/overview", "GET", undefined, partnerCookie)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/settings",
        "PATCH",
        { monthlyBudgetUsd: 100 },
        partnerCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "partner@example.test",
        password: "Synthetic partner password",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/overview", "GET", undefined, "viewer@example.test"))
      .status,
    200,
  );
  assert.equal(
    (await call("/api/run", "POST", { count: 2 }, "viewer@example.test"))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/settings",
        "PATCH",
        { monthlyBudgetUsd: 100 },
        "viewer@example.test",
      )
    ).status,
    403,
  );
  const invalid = await call(
    "/api/run",
    "POST",
    { count: 101 },
    "owner@example.test",
  );
  assert.equal(invalid.status, 400);
  const queued = await call(
    "/api/run",
    "POST",
    {
      count: 12,
      market: "Dentists",
      locations: "Midrand, South Africa",
      budgetUsd: 0.5,
      callingCode: "27",
    },
    "owner@example.test",
  );
  assert.equal(queued.status, 202);
  assert.equal(runs[0].config.locations, "Midrand, South Africa");
  assert.equal(runs[0].requested, 12);
  assert.equal(
    (await call("/api/jobs/work", "POST", {}, "viewer@example.test")).status,
    403,
  );
  const worker = await fetch(`http://127.0.0.1:${port}/api/jobs/work`, {
    method: "POST",
    headers: { Authorization: `Bearer ${workerSecret}` },
  });
  assert.equal(worker.status, 200);
  assert.equal(
    (
      await call(
        `/api/run?id=${runs[0].id}`,
        "DELETE",
        undefined,
        "owner@example.test",
      )
    ).status,
    200,
  );
  assert.equal(runs[0].status, "canceled");
  const exportResponse = await call(
    "/api/export",
    "GET",
    undefined,
    "owner@example.test",
  );
  assert.equal(exportResponse.status, 200);
  assert.ok((await exportResponse.text()).includes("Test restaurant"));
  workerEnabled = true;
  const discovery = await call(
    "/api/run",
    "POST",
    {
      count: 2,
      market: "Restaurants",
      locations: "Sandton, South Africa",
      budgetUsd: 0.5,
      callingCode: "27",
    },
    "owner@example.test",
  );
  assert.equal(discovery.status, 202);
  const runId = (await discovery.json()).id;
  const run = runs.find((x) => x.id === runId);
  const tick = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs/work`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.error, undefined);
    return result;
  };
  await tick();
  assert.equal(
    run.status,
    "running",
    "An empty first search must not end the campaign",
  );
  assert.equal(run.search_rounds, 1);
  await tick();
  assert.equal(run.status, "running");
  assert.equal(run.search_rounds, 2);
  await tick();
  assert.equal(run.discovered, 2);
  assert.equal(run.stage, "research");
  assert.equal(run.search_rounds, 3);
  assert.equal(
    tables.leads.find(
      (x) => x.company_name === "Synthetic directory restaurant",
    ).website_url,
    null,
    "Unsupported website must not erase a sourced business",
  );
  assert.equal(
    tables.leads.find((x) => x.company_name === "Synthetic official restaurant")
      .website_url,
    "https://restaurant-two.example.com/",
  );
  assert.equal(tables.usage_events[2].metadata.discovery.saved, 2);
  assert.equal(
    tables.usage_events[2].metadata.discovery.unconfirmedWebsites,
    1,
  );
  assert.equal(
    tables.usage_events[2].metadata.discovery.providersExcluded,
    1,
    "A service vendor is not an ecommerce customer",
  );
  await tick();
  assert.equal(run.qualified, 0);
  assert.ok(
    tables.leads.find(
      (x) => x.company_name === "Synthetic directory restaurant",
    ).opportunity.officialSearch,
    "Website lookup must persist separately from analysis",
  );
  await tick();
  assert.equal(
    run.qualified,
    1,
    "A business-specific search plus listing can establish a missing-site opportunity",
  );
  assert.equal(
    tables.leads.find(
      (x) => x.company_name === "Synthetic directory restaurant",
    ).opportunity.websiteStatus,
    "not_found",
  );
  await tick();
  assert.equal(run.qualified, 1);
  assert.equal(
    run.status,
    "complete",
    "Search bounds may return fewer qualified prospects",
  );
  const rejected = tables.leads.find(
    (x) => x.company_name === "Synthetic official restaurant",
  );
  assert.equal(rejected.opportunity.status, "not_fit");
  assert.equal(rejected.status, "reviewed");
  assert.equal(rejected.draft_body, null);
  assert.ok(rejected.fit_score <= 15);
  const overview = await (
    await call("/api/overview", "GET", undefined, "owner@example.test")
  ).json();
  assert.ok(
    overview.leads.some(
      (x) => x.companyName === "Synthetic directory restaurant",
    ),
    "Saved discoveries must reach the dashboard API",
  );
  assert.equal((await tick()).worked, false);
  const more = await call(
    "/api/run",
    "POST",
    {
      count: 1,
      market: "Restaurants",
      locations: "Sandton, South Africa",
      budgetUsd: 0.5,
      callingCode: "27",
      focus: "website_gaps",
    },
    "owner@example.test",
  );
  assert.equal(more.status, 202);
  const moreId = (await more.json()).id,
    moreRun = runs.find((x) => x.id === moreId);
  await tick();
  await tick();
  assert.equal(moreRun.qualified, 0);
  assert.equal(moreRun.status, "running");
  assert.equal(
    moreRun.stage,
    "discover",
    "Rejecting a good site must resume discovery, not fill the prospect target",
  );
  await tick();
  await tick();
  assert.equal(moreRun.qualified, 1);
  assert.equal(moreRun.status, "complete");
  const qualified = tables.leads.find(
    (x) => x.company_name === "Synthetic weak restaurant",
  );
  assert.equal(qualified.opportunity.service, "Launch");
  assert.equal(qualified.opportunity.websiteStatus, "weak");
  assert.equal(qualified.status, "drafted");
  assert.ok(qualified.phone);
  const exported = await (
    await call("/api/export", "GET", undefined, "owner@example.test")
  ).text();
  assert.ok(exported.includes("opportunity_status"));
  assert.ok(exported.includes("Synthetic weak restaurant"));
  lead.status = "reviewed";
  const chain = {
    id: "synthetic-brand-lead",
    company_name: "Synthetic chain restaurant",
    website_url: null,
    discovery_source_url:
      "https://directory.example.com/sandton/restaurant-one/",
    region: "Sandton, South Africa",
    category: "Restaurant",
    status: "queued",
    opportunity: null,
    contact_sources: [],
  };
  tables.leads.push(chain);
  const brandRunResponse = await call(
    "/api/run",
    "POST",
    { mode: "queue", count: 1, budgetUsd: 0.5, focus: "website_gaps" },
    "owner@example.test",
  );
  assert.equal(brandRunResponse.status, 202);
  const brandRunId = (await brandRunResponse.json()).id;
  const brandRun = runs.find((x) => x.id === brandRunId);
  await tick();
  assert.equal(
    chain.website_url,
    "https://locations.syntheticchainrestaurant.co.za/sandton",
    "A branch must retain its retrieved official URL even when the model leaves its website unconfirmed",
  );
  assert.equal(chain.opportunity.websiteStatus, "unknown");
  await tick();
  assert.equal(brandRun.status, "complete");
  assert.equal(brandRun.qualified, 0);
  assert.equal(chain.opportunity.status, "not_fit");
  assert.equal(chain.draft_body, null);
  const collection = {
    id: "synthetic-collection-lead",
    company_name: "Synthetic collection restaurant",
    website_url: null,
    discovery_source_url: "https://directory.example.com/sandton/restaurants/",
    region: "Sandton, South Africa",
    category: "Restaurant",
    status: "queued",
    opportunity: null,
    contact_sources: [],
  };
  tables.leads.push(collection);
  const collectionResponse = await call(
    "/api/run",
    "POST",
    { mode: "queue", count: 1, budgetUsd: 0.5, focus: "website_gaps" },
    "owner@example.test",
  );
  assert.equal(collectionResponse.status, 202);
  await tick();
  await tick();
  assert.equal(collection.opportunity.status, "review");
  assert.equal(collection.opportunity.websiteStatus, "unknown");
  assert.equal(collection.draft_body, null);
  assert.ok(collection.fit_score <= 39);
  // Natural-language interpretation is a paid preview, never a queued run.
  const beforePlan = runs.length;
  assert.equal(
    (
      await call(
        "/api/campaigns/interpret",
        "POST",
        {
          description:
            "Find 30 salons and plumbers in Nairobi and Mombasa, Kenya. Budget $2.",
        },
        "viewer@example.test",
      )
    ).status,
    403,
  );
  const interpreted = await call(
    "/api/campaigns/interpret",
    "POST",
    {
      description:
        "Find 30 salons and plumbers in Nairobi and Mombasa, Kenya. Budget $2.",
    },
    "owner@example.test",
  );
  assert.equal(interpreted.status, 200);
  const plan = (await interpreted.json()).plan;
  assert.equal(plan.countryCode, "KE");
  assert.deepEqual(plan.businessTypes, ["Salons", "Plumbers"]);
  assert.deepEqual(plan.areas, ["Nairobi", "Mombasa"]);
  assert.equal(plan.count, 30);
  assert.equal(plan.budgetUsd, 2);
  assert.equal(plan.outreachMode, "drafts");
  assert.equal(runs.length, beforePlan);
  assert.equal(
    (
      await call(
        "/api/settings",
        "PATCH",
        {
          searchCountry: "KE",
          targetMarket: "Salons",
          targetLocations: "Nairobi",
        },
        "owner@example.test",
      )
    ).status,
    200,
  );
  assert.equal(settings.calling_code, "254");
  assert.equal(
    (
      await call(
        "/api/run",
        "POST",
        {
          planVersion: 3,
          countryCode: "KE",
          businessTypes: ["Salons"],
          areas: ["Nairobi"],
          count: 1,
          outreachMode: "email",
        },
        "owner@example.test",
      )
    ).status,
    400,
  );
  const candidate = await call(
    "/api/run",
    "POST",
    {
      planVersion: 3,
      countryCode: "KE",
      businessTypes: ["Salons"],
      areas: ["Nairobi"],
      count: 1,
      scanLimit: 1,
      websiteFilter: "missing",
      targetMode: "candidates",
    },
    "owner@example.test",
  );
  assert.equal(candidate.status, 202);
  const candidateId = (await candidate.json()).id,
    smartRun = runs.find((r) => r.id === candidateId);
  await tick();
  await tick();
  assert.equal(smartRun.status, "complete");
  assert.equal(smartRun.discovered, 1);
  assert.equal(smartRun.qualified, 0);
  assert.equal(
    tables.usage_events.some(
      (u) => u.run_id === smartRun.id && u.kind === "analysis",
    ),
    false,
    "Missing-only must skip paid analysis of an existing official site",
  );
  const salon = tables.leads.find(
    (l) => l.company_name === "Synthetic Nairobi salon",
  );
  assert.equal(salon.country_code, "KE");
  assert.equal(salon.phone, "+254712345678");
  assert.equal(salon.opportunity.status, "not_fit");
  // Mobile lab measurements are persisted in their own tick before screening.
  assert.equal(
    (
      await call(
        "/api/leads",
        "PATCH",
        { id: salon.id, retry: true },
        "owner@example.test",
      )
    ).status,
    200,
  );
  const mobile = await call(
    "/api/run",
    "POST",
    {
      planVersion: 3,
      countryCode: "KE",
      businessTypes: ["Salons"],
      areas: ["Nairobi"],
      mode: "queue",
      count: 1,
      scanLimit: 1,
      websiteFilter: "weak",
      targetMode: "candidates",
      auditWebsites: true,
    },
    "owner@example.test",
  );
  assert.equal(mobile.status, 202);
  await tick();
  assert.equal(salon.opportunity.mobileAudit.performance, 25);
  assert.equal(salon.opportunity.mobileAudit.lcpMs, 5200);
  await tick();
  assert.equal(salon.opportunity.status, "qualified");
  assert.equal(salon.opportunity.websiteStatus, "weak");
  assert.ok(salon.draft_body);
  // Integration keys are encrypted and live Google results never enter CRM/CSV.
  const googleKey = "synthetic-google-api-key-never-real";
  assert.equal(
    (
      await call(
        "/api/integrations/providers",
        "POST",
        { provider: "google_places", apiKey: googleKey },
        "viewer@example.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/integrations/providers",
        "POST",
        { provider: "google_places", apiKey: googleKey, unitCostUsd: 0.04 },
        "owner@example.test",
      )
    ).status,
    200,
  );
  const savedGoogle = tables.provider_connections.find(
    (p) => p.id === "google_places",
  );
  assert.ok(
    savedGoogle.secret_ciphertext &&
      !savedGoogle.secret_ciphertext.includes(googleKey),
  );
  const beforeMaps = tables.leads.length;
  assert.equal(
    (
      await call(
        "/api/maps/search",
        "POST",
        { query: "Salons", area: "Nairobi", countryCode: "KE" },
        "viewer@example.test",
      )
    ).status,
    403,
  );
  const maps = await call(
    "/api/maps/search",
    "POST",
    {
      query: "Salons",
      area: "Nairobi",
      countryCode: "KE",
      radiusKm: 2,
      latitude: -1.286,
      longitude: 36.817,
    },
    "owner@example.test",
  );
  assert.equal(maps.status, 200);
  const live = await maps.json();
  assert.equal(live.places.length, 2);
  assert.ok(live.places.some((p) => !p.websiteUri));
  assert.equal(live.nextPageToken, "synthetic-next-page");
  assert.equal(tables.leads.length, beforeMaps);
  assert.equal(
    (
      await (
        await call("/api/export", "GET", undefined, "owner@example.test")
      ).text()
    ).includes("Synthetic Google"),
    false,
  );
  const resendKey = "synthetic-resend-api-key-never-real",
    webhookBytes = Buffer.from("synthetic-webhook-32-character-secret"),
    webhookSecret = "whsec_" + webhookBytes.toString("base64");
  const connection = {
    provider: "resend",
    apiKey: resendKey,
    fromAddress: "hello@merchant.example.com",
    fromName: "Toran test",
    replyTo: "replies@merchant.example.com",
    publicBaseUrl: "https://dashboard.example.com",
    dailyLimit: 10,
    unitCostUsd: 0.001,
    webhookSecret,
  };
  assert.equal(
    (
      await call(
        "/api/integrations/providers",
        "POST",
        connection,
        "owner@example.test",
      )
    ).status,
    200,
  );
  const safeOverview = await (
    await call("/api/overview", "GET", undefined, "owner@example.test")
  ).text();
  assert.equal(safeOverview.includes(resendKey), false);
  assert.equal(safeOverview.includes(webhookSecret), false);
  assert.equal(safeOverview.includes("secret_ciphertext"), false);
  assert.ok(safeOverview.includes("runSpending"));
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: salon.id, confirm: true },
        "owner@example.test",
      )
    ).status,
    409,
    "Email cannot be sent merely because an email was scraped",
  );
  assert.equal(
    (
      await call(
        "/api/leads",
        "PATCH",
        {
          id: salon.id,
          recordEmailConsent: true,
          note: "Recipient explicitly agreed to a website proposal by email.",
        },
        "owner@example.test",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: salon.id, confirm: true },
        "viewer@example.test",
      )
    ).status,
    403,
  );
  const accepted = await call(
    "/api/email/send",
    "POST",
    { leadId: salon.id, confirm: true },
    "owner@example.test",
  );
  assert.equal(accepted.status, 200);
  const email = tables.outreach_messages.find(
    (m) => m.lead_id === salon.id && m.channel === "email",
  );
  assert.equal(email.status, "sent");
  assert.ok(email.provider_message_id);
  assert.match(email.content, /Unsubscribe:/);
  const beforeDuplicate = tables.outreach_messages.length;
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: salon.id, confirm: true },
        "owner@example.test",
      )
    ).status,
    409,
  );
  assert.equal(
    tables.outreach_messages.length,
    beforeDuplicate,
    "A duplicate request must not create another send",
  );
  // Signed webhooks track delivery, suppress bounces, and resist tampering.
  async function hook(type) {
    const raw = JSON.stringify({
        type,
        data: { email_id: email.provider_message_id },
      }),
      time = String(Math.floor(Date.now() / 1000)),
      id = "synthetic-event";
    const signature = createHmac("sha256", webhookBytes)
      .update(`${id}.${time}.${raw}`)
      .digest("base64");
    return fetch(`http://127.0.0.1:${port}/api/email/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": id,
        "svix-timestamp": time,
        "svix-signature": "v1," + signature,
      },
      body: raw,
    });
  }
  assert.equal(
    (
      await call("/api/email/webhook", "POST", {
        type: "email.bounced",
        data: { email_id: email.provider_message_id },
      })
    ).status,
    401,
  );
  assert.equal((await hook("email.delivered")).status, 200);
  assert.equal(email.status, "delivered");
  const link = email.content.match(/Unsubscribe: (https:\/\/[^\s]+)/)[1],
    unsubscribe = new URL(link);
  assert.equal(
    (await call(unsubscribe.pathname + unsubscribe.search)).status,
    200,
  );
  assert.equal(
    salon.do_not_contact,
    false,
    "Opening an unsubscribe link must not mutate consent",
  );
  assert.equal(
    (await call(unsubscribe.pathname + unsubscribe.search, "POST")).status,
    200,
  );
  assert.equal(salon.do_not_contact, true);
  assert.equal(salon.email_consent_at, null);
  assert.equal((await hook("email.bounced")).status, 200);
  assert.equal(email.status, "failed");
  assert.equal(salon.do_not_contact, true);
  assert.equal((await hook("email.delivered")).status, 200);
  assert.equal(
    email.status,
    "failed",
    "Delivery must not undo a later failure",
  );
  // Automatic sending is explicit, durable, capped, and limited to consented leads.
  const autoLead = {
    ...salon,
    id: "synthetic-auto-email",
    company_name: "Synthetic consented salon",
    status: "queued",
    opportunity: null,
    do_not_contact: false,
    email_consent_at: new Date().toISOString(),
    email_consent_note: "Agreed to receive this proposal.",
  };
  tables.leads.push(autoLead);
  const automatic = await call(
    "/api/run",
    "POST",
    {
      planVersion: 3,
      countryCode: "KE",
      businessTypes: ["Salons"],
      areas: ["Nairobi"],
      mode: "queue",
      count: 1,
      scanLimit: 1,
      websiteFilter: "weak",
      auditWebsites: true,
      outreachMode: "email",
      confirmSending: true,
      sendLimit: 1,
    },
    "owner@example.test",
  );
  assert.equal(automatic.status, 202);
  const autoId = (await automatic.json()).id,
    autoRun = runs.find((r) => r.id === autoId);
  await tick();
  await tick();
  assert.equal(autoRun.stage, "outreach");
  await tick();
  assert.equal(autoRun.sent_count, 1);
  await tick();
  assert.equal(autoRun.status, "complete");
  // Ambiguous provider responses remain blocked until a human reconciles them.
  const uncertain = {
    ...autoLead,
    id: "synthetic-uncertain-email",
    contact_email: "unknown@merchant.example.com",
    contact_sources: [
      {
        field: "email",
        value: "unknown@merchant.example.com",
        url: "https://merchant.example.com/",
      },
    ],
  };
  tables.leads.push(uncertain);
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: uncertain.id, confirm: true },
        "owner@example.test",
      )
    ).status,
    409,
  );
  assert.equal(
    tables.outreach_messages.find((m) => m.lead_id === uncertain.id).status,
    "unknown",
  );
  const unresolvedCount = tables.outreach_messages.length;
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: uncertain.id, confirm: true },
        "owner@example.test",
      )
    ).status,
    409,
  );
  assert.equal(tables.outreach_messages.length, unresolvedCount);
  const limited = { ...autoLead, id: "synthetic-limited-email" };
  tables.leads.push(limited);
  tables.provider_connections.find(
    (p) => p.id === "resend",
  ).settings.dailyLimit = 1;
  assert.equal(
    (
      await call(
        "/api/email/send",
        "POST",
        { leadId: limited.id, confirm: true },
        "owner@example.test",
      )
    ).status,
    409,
  );
  assert.equal(
    tables.outreach_messages.length,
    unresolvedCount,
    "Daily limits block new sends before provider submission",
  );
  assert.equal((await call("/terms")).status, 200);
  assert.equal((await call("/privacy")).status, 200);
  if (process.env.BOT1_UI_MANUAL === "1") {
    workerEnabled = false;
    settings.automation_enabled = true;
    // Test-only proxy injects a synthetic session into an isolated mock. It
    // never connects to Supabase or the live dashboard and is not production code.
    const proxy = createServer(async (req, res) => {
      if (req.url === "/__mobile") {
        res.setHeader("Content-Type", "text/html");
        return res.end(
          '<html><body style="margin:20px;background:#ddd"><iframe title="Mobile dashboard preview" src="/" width="390" height="844" style="border:0"></iframe></body></html>',
        );
      }
      const target = new URL(req.url, `http://127.0.0.1:${port}`);
      const headers = { Cookie: cookie("owner@example.test") };
      if (req.headers["content-type"])
        headers["Content-Type"] = req.headers["content-type"];
      let body = "";
      for await (const chunk of req) body += chunk;
      const response = await fetch(target, {
        method: req.method,
        headers,
        redirect: "manual",
        ...(body ? { body } : {}),
      });
      res.statusCode = response.status;
      for (const [key, value] of response.headers)
        if (
          !["content-encoding", "content-length", "transfer-encoding"].includes(
            key,
          )
        )
          res.setHeader(key, value);
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise((resolve) => proxy.listen(4268, "0.0.0.0", resolve));
    console.log(
      "Isolated synthetic dashboard UI: http://127.0.0.1:4268/ ; mobile frame: /__mobile",
    );
    await new Promise((resolve) => process.once("SIGTERM", resolve));
    await new Promise((resolve) => proxy.close(resolve));
  }
  console.log(
    "Cloud Run smoke passed: auth/access, saved campaign results, natural-language preview, country/phone controls, candidate target, mobile lab, encrypted integrations, live Maps isolation, email consent/daily limits/deduplication, automatic campaign sending, signed delivery/unsubscribe handling and ambiguous-send blocking. All providers and recipients were synthetic.",
  );
} finally {
  child.kill("SIGTERM");
  mock.close();
  await new Promise((resolve) => child.once("exit", resolve));
}
