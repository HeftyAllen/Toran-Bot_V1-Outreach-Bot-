"use client";
import CampaignBuilder from "../components/campaign-builder";
import { ProviderSettings, GoogleLookup } from "../components/provider-panels";
import type { ProviderStatus } from "../components/provider-panels";
import { countries } from "../lib/search-config";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Command,
  Copy,
  Download,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { calibration, latestFeedback } from "../lib/bot-core";
import type { ContactSource, Feedback, Opportunity } from "../lib/bot-core";
type Section =
  | "Overview"
  | "Leads"
  | "Outreach"
  | "Spending"
  | "Learning"
  | "Settings";
type Lead = {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  region: string | null;
  category: string | null;
  status: string;
  fitScore: number | null;
  baseScore: number | null;
  calibrationDelta: number;
  learningVersion: number;
  confidence: string | null;
  serviceFit: string | null;
  summary: string | null;
  evidence: string[];
  draftSubject: string | null;
  draftBody: string | null;
  outcome: string | null;
  phone: string | null;
  contactEmail: string | null;
  whatsappUrl: string | null;
  address: string | null;
  contactSources: ContactSource[];
  contactsVerifiedAt: string | null;
  emailConsentAt?: string | null;
  emailConsentNote?: string | null;
  consentAt: string | null;
  consentNote: string | null;
  doNotContact: boolean;
  lastInboundAt: string | null;
  discoverySourceUrl: string | null;
  researchError: string | null;
  opportunity: Opportunity | null;
  createdAt: string;
};
type Run = {
  id: string;
  status: string;
  processed: number;
  failed: number;
  requested: number;
  discovered: number;
  qualified: number;
  message: string | null;
  stage: string;
  leadIds: string[];
  createdAt: string;
  candidatesSeen?: number;
  excluded?: number;
  duplicates?: number;
  sentCount?: number;
  config: {
    locations?: string;
    market?: string;
    budgetUsd?: number;
    qualificationVersion?: number;
    targetMode?: string;
    planVersion?: number;
  };
};
type Settings = {
  searchCountry?: string;
  brandName: string;
  brandDomain: string;
  targetMarket: string;
  targetLocations: string;
  services: string;
  researchLimit: number;
  runBudgetUsd: number;
  monthlyBudgetUsd: number;
  whatsappUnitCostUsd: number | null;
  callingCode: string;
  automationEnabled: boolean;
  apiConfigured: boolean;
  workerConfigured: boolean;
};
type Usage = {
  monthEstimatedUsd: number;
  monthActualUsd: number;
  monthReservedUsd: number;
  allTimeEstimatedUsd: number;
  allTimeActualUsd: number;
  unconfirmedCount: number;
  inputTokens: number;
  outputTokens: number;
  searchCalls: number;
  trackingSince: string | null;
};
type RunSpend = {
  runId: string;
  spentUsd: number;
  reservedUsd: number;
  emailUsd: number;
  unconfirmedCount: number;
};
type UsageEvent = {
  id: string;
  run_id: string | null;
  provider: string;
  kind: string;
  model: string | null;
  state: string;
  cost_usd: number | null;
  reserved_usd: number;
  created_at: string;
};
type Message = {
  channel?: string;
  id: string;
  lead_id: string | null;
  kind: string;
  template_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
};
type Inbound = {
  id: string;
  lead_id: string | null;
  sender: string;
  text_body: string;
  received_at: string;
};
type Overview = {
  runSpending?: RunSpend[];
  providers?: ProviderStatus[];
  settings: Settings;
  leads: Lead[];
  runs: Run[];
  usage: Usage;
  usageEvents: UsageEvent[];
  feedback: Feedback[];
  messages: Message[];
  inbound: Inbound[];
  whatsapp: {
    label: string;
    phone_number_id: string;
    api_version: string;
  } | null;
};
const defaults: Settings = {
  brandName: "New business",
  brandDomain: "",
  targetMarket: "Restaurants and ecommerce businesses",
  targetLocations: "Midrand, Sandton, Johannesburg",
  services: "Websites, ecommerce, business automation",
  researchLimit: 10,
  runBudgetUsd: 1,
  monthlyBudgetUsd: 5,
  whatsappUnitCostUsd: null,
  callingCode: "27",
  automationEnabled: true,
  apiConfigured: false,
  workerConfigured: false,
};
const emptyUsage: Usage = {
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
const nav: { name: Section; icon: typeof Bot }[] = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Leads", icon: Target },
  { name: "Outreach", icon: MessageCircle },
  { name: "Spending", icon: Wallet },
  { name: "Learning", icon: Activity },
  { name: "Settings", icon: Settings2 },
];
const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value ?? 0));
const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const outcomeNames: Record<string, string> = {
  good_fit: "Good fit",
  poor_fit: "Poor fit",
  replied: "Replied",
  not_interested: "Not interested",
  booked: "Call booked",
  won: "Won",
  lost: "Lost",
};
type ApiData = {
  error?: string;
  message?: string;
  role?: string;
  inviteUrl?: string;
  members?: Array<{ email: string; role: string; created_at: string }>;
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json()) as ApiData;
  if (!response.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}
export default function Dashboard({
  displayName,
  email,
  role,
  authSource,
}: {
  displayName: string;
  email: string;
  role: "owner" | "viewer";
  authSource: "password" | "chatgpt";
}) {
  const canManage = role === "owner";
  const [section, setSection] = useState<Section>("Overview");
  const [data, setData] = useState<Overview>({
    settings: defaults,
    leads: [],
    runs: [],
    usage: emptyUsage,
    usageEvents: [],
    feedback: [],
    messages: [],
    inbound: [],
    whatsapp: null,
  });
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("qualified"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [showAdd, setShowAdd] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [dark, setDark] = useState(false);
  const [members, setMembers] = useState<
      Array<{ email: string; role: string; created_at: string }>
    >([]),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [inviteBusy, setInviteBusy] = useState(false);
  const {
    settings,
    leads,
    runs,
    usage,
    usageEvents,
    feedback,
    messages,
    inbound,
    whatsapp,
  } = data;
  const active = runs.find((x) => x.status === "running");
  const selected = leads.find((x) => x.id === selectedId);
  async function refresh() {
    try {
      const fresh = await api("/api/overview");
      if (fresh.role && fresh.role !== role) {
        window.location.reload();
        return;
      }
      setData(fresh as unknown as Overview);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }
  async function refreshMembers() {
    if (!canManage) return;
    try {
      const result = await api("/api/members");
      setMembers(result.members ?? []);
    } catch {
      /* Keep dashboard data available. */
    }
  }
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
      void refreshMembers();
    }, 0);
    const timer = window.setInterval(
      () => {
        void refresh();
        if (canManage && active)
          void api("/api/jobs/work", "POST").catch(() => undefined);
      },
      active ? 8000 : 30000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!active, canManage]);
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setStatus("");
    try {
      const result = await api(path, method, body);
      await refresh();
      setStatus(result.message ?? "Saved.");
      return result;
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Could not complete the request.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function start(config: Record<string, unknown>) {
    try {
      await act("/api/run", "POST", config);
      void api("/api/jobs/work", "POST")
        .then(() => refresh())
        .catch(() => undefined);
    } catch {
      /* Error is displayed above. */
    }
  }
  async function saveSettings(patch: Partial<Settings>) {
    await act("/api/settings", "PATCH", patch);
  }
  async function changeLead(id: string, patch: Record<string, unknown>) {
    await act("/api/leads", "PATCH", { id, ...patch });
  }
  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteUrl("");
    try {
      const result = await api("/api/members", "POST", { email: inviteEmail });
      setInviteUrl(result.inviteUrl ?? "");
      setInviteEmail("");
      await refreshMembers();
      setStatus(
        "Invite created. Copy and send the one-time link to your partner.",
      );
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Could not create the invite.",
      );
    } finally {
      setInviteBusy(false);
    }
  }
  async function removeMember(memberEmail: string) {
    try {
      await api(
        `/api/members?email=${encodeURIComponent(memberEmail)}`,
        "DELETE",
      );
      await refreshMembers();
      setInviteUrl("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not remove member.");
    }
  }
  const visible = useMemo(
    () =>
      leads.filter(
        (l) =>
          `${l.companyName} ${l.region ?? ""} ${l.category ?? ""} ${l.phone ?? ""} ${l.contactEmail ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === "all" ||
            (filter === "latest" && runs[0]?.leadIds.includes(l.id)) ||
            (filter === "qualified" && l.opportunity?.status === "qualified") ||
            (filter === "review" &&
              (!l.opportunity || l.opportunity.status === "review")) ||
            (filter === "not_fit" && l.opportunity?.status === "not_fit") ||
            (filter === "contacts"
              ? !!(l.phone || l.contactEmail)
              : filter === "suppressed"
                ? l.doNotContact
                : filter === "ready"
                  ? l.status === "drafted"
                  : l.status === filter)),
      ),
    [leads, query, filter, runs],
  );
  const positives = leads.filter((l) =>
    ["replied", "booked", "won"].includes(l.outcome ?? ""),
  ).length;
  const researched = leads.filter((l) => l.fitScore !== null).length;
  const prospects = leads.filter((l) => l.opportunity?.status === "qualified");
  const latestRun = runs[0];
  const latestResults = latestRun
    ? leads.filter((l) => latestRun.leadIds.includes(l.id))
    : prospects;
  function navigate(next: Section) {
    setSection(next);
    setMobileMenu(false);
  }
  return (
    <div className={`app-shell ${dark ? "dark" : ""}`}>
      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Command size={17} />
          </div>
          <div>
            <strong>BOT STUDIO</strong>
            <span>PROSPECTING</span>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-card">
          <div className="workspace-orb">
            <Bot size={19} />
          </div>
          <div className="workspace-copy">
            <span>WORKSPACE</span>
            <strong>{settings.brandName}</strong>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-caption">CONTROL ROOM</p>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={`nav-item ${section === name ? "active" : ""}`}
            >
              <Icon size={17} />
              <span>{name}</span>
              {name === "Leads" && leads.length > 0 && (
                <span className="nav-count">{leads.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="helper-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Saved in the cloud</strong>
              <span>Runs keep going when you leave.</span>
            </div>
          </div>
          <div className="profile-row">
            <div className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-copy">
              <strong>{displayName}</strong>
              <span>
                {email} · {role}
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-trigger"
            aria-label="Open menu"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>Bot 01</span>
            <span>/</span>
            <strong>{section}</strong>
          </div>
          <div className="top-actions">
            <div className="connection-pill">
              <span
                className={`connection-dot ${connected ? "is-connected" : ""}`}
              />
              {connected ? `${role} · connected` : "Reconnecting…"}
            </div>
            <button
              className="icon-button"
              aria-label="Refresh dashboard"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle dark mode"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {authSource === "password" && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  void api("/api/auth/logout", "POST").then(() =>
                    window.location.assign("/signin"),
                  )
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>
        <main className="content-area">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                {section === "Overview"
                  ? "YOUR PROSPECTING WORKSPACE"
                  : section.toUpperCase()}
              </div>
              <h1>
                {section === "Overview"
                  ? `Let’s find your next customer.`
                  : section}
                <span className="heading-period">
                  {section === "Overview" ? "" : "."}
                </span>
              </h1>
              <p>
                {
                  (
                    {
                      Overview:
                        "Choose your area, set a limit, and let Bot 1 do the research.",
                      Leads:
                        "Business details, contact sources, and the next step in one place.",
                      Outreach:
                        "WhatsApp templates, reviewed drafts, and delivery updates.",
                      Spending:
                        "Track costs and control how much each campaign can spend.",
                      Learning:
                        "Your decisions shape the next round of recommendations.",
                      Settings:
                        "Business focus, integrations, browser access, and your partner.",
                    } as Record<Section, string>
                  )[section]
                }
              </p>
            </div>
            {section === "Leads" && (
              <div className="button-row">
                <a className="button button-outline" href="/api/export">
                  <Download size={15} /> Export CSV
                </a>
                {canManage && (
                  <button
                    className="button button-primary"
                    onClick={() => setShowAdd(true)}
                  >
                    <Plus size={15} /> Add business
                  </button>
                )}
              </div>
            )}
          </div>
          {status && (
            <div className="toast-message" role="status">
              <span>{status}</span>
              <button aria-label="Dismiss status" onClick={() => setStatus("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {!connected && (
            <div className="setup-notice">
              <p>
                Connecting to your saved workspace. If this persists, refresh
                the dashboard.
              </p>
              <button className="text-button" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}
          {section === "Overview" && (
            <>
              <div className="bot-banner">
                <div className="bot-banner-main">
                  <div className="bot-symbol">
                    <Bot size={25} />
                  </div>
                  <div className="bot-banner-copy">
                    <div className="bot-label-row">
                      <span className="bot-label">BOT 01</span>
                      <span
                        className={`run-state ${settings.automationEnabled ? "run-state-on" : ""}`}
                      >
                        <span />
                        {settings.automationEnabled
                          ? active
                            ? "WORKING"
                            : "READY"
                          : "PAUSED"}
                      </span>
                    </div>
                    <h2>Find businesses Toran can help</h2>
                    <p>
                      Prioritizes weak or missing websites, then checks for
                      ecommerce and automation opportunities with public
                      evidence.
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() =>
                      void saveSettings({
                        automationEnabled: !settings.automationEnabled,
                      }).catch(() => undefined)
                    }
                  >
                    {settings.automationEnabled ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {settings.automationEnabled ? "Pause bot" : "Resume bot"}
                  </button>
                )}
              </div>
              <CampaignBuilder
                key={`${settings.targetLocations}|${settings.targetMarket}|${settings.researchLimit}|${settings.runBudgetUsd}|${settings.searchCountry}`}
                settings={settings}
                onStart={start}
                emailConnected={
                  !!data.providers?.some((p) => p.id === "resend")
                }
                disabled={
                  !canManage ||
                  busy ||
                  !connected ||
                  !!active ||
                  !settings.automationEnabled
                }
              />
              <GoogleLookup
                connected={
                  !!data.providers?.some((p) => p.id === "google_places")
                }
                canManage={canManage}
                countryCode={settings.searchCountry ?? "ZA"}
                onUsageChanged={refresh}
              />
              {active && (
                <RunProgress
                  run={active}
                  paused={!settings.automationEnabled}
                  canManage={canManage}
                  onCancel={() =>
                    void act(
                      `/api/run?id=${encodeURIComponent(active.id)}`,
                      "DELETE",
                    ).catch(() => undefined)
                  }
                />
              )}
              <div className="metrics-grid">
                <Stat
                  label="Qualified Toran prospects"
                  value={String(prospects.length)}
                  detail={`${researched} businesses screened · specific opportunity required`}
                  icon={Globe2}
                />
                <Stat
                  label="Contact details found"
                  value={String(
                    leads.filter((l) => l.phone || l.contactEmail).length,
                  )}
                  detail="Public phone or business email"
                  icon={MessageCircle}
                />
                <Stat
                  label="Replies, bookings & wins"
                  value={String(positives)}
                  detail="Outcomes you recorded"
                  icon={Target}
                />
                <Stat
                  label="This month’s tracked cost"
                  value={money(
                    Number(usage.monthEstimatedUsd) +
                      Number(usage.monthActualUsd),
                  )}
                  detail={`${money(usage.monthReservedUsd)} reserved · ${money(settings.monthlyBudgetUsd)} limit`}
                  icon={Wallet}
                />
              </div>
              <div className="content-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {latestRun
                          ? "Latest campaign results"
                          : "Fresh prospects"}
                      </h2>
                      <p>
                        {latestRun
                          ? `${latestRun.discovered} collected · ${latestRun.qualified ?? 0} qualified. Open a business to see its screening result and contacts.`
                          : "Qualified opportunities with contacts, evidence, and a draft."}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFilter(latestRun ? "latest" : "qualified");
                        navigate("Leads");
                      }}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <LeadList
                    leads={latestResults.slice(0, 5)}
                    onSelect={setSelectedId}
                  />
                  {latestRun && !latestResults.length && (
                    <p className="panel-empty-note">
                      This campaign has no saved businesses yet. Check Campaign
                      activity for its status.
                    </p>
                  )}
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Campaign activity</h2>
                      <p>Progress is saved after each step.</p>
                    </div>
                  </div>
                  <Runs runs={runs.slice(0, 5)} />
                </div>
              </div>
            </>
          )}
          {section === "Leads" && (
            <>
              <div className="filter-bar">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search businesses"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Business, location, phone, or email"
                  />
                </div>
                <select
                  aria-label="Filter businesses"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="qualified">Qualified prospects</option>
                  <option value="latest">Latest campaign results</option>
                  <option value="review">Needs opportunity review</option>
                  <option value="not_fit">Ruled out</option>
                  <option value="all">All businesses</option>
                  <option value="contacts">With contacts</option>
                  <option value="ready">Researched</option>
                  <option value="queued">Queued</option>
                  <option value="error">Needs retry</option>
                  <option value="suppressed">Do not contact</option>
                </select>
                <span>{visible.length} shown · latest 1,000</span>
              </div>
              <div className="panel">
                <LeadList leads={visible} onSelect={setSelectedId} />
              </div>
            </>
          )}
          {section === "Outreach" && (
            <>
              <div className="setup-notice">
                <MessageCircle size={22} />
                <div>
                  <strong>
                    {whatsapp
                      ? `${whatsapp.label} connected`
                      : "Connect WhatsApp Business to send from here"}
                  </strong>
                  <p>
                    {whatsapp
                      ? "Use an approved template to start a conversation. Reply text is available for 24 hours after an inbound message."
                      : "You can open a reviewed draft in WhatsApp on your phone. Direct dashboard sends need a Meta Cloud API connection."}
                  </p>
                </div>
                <button
                  className="button button-outline"
                  onClick={() => navigate("Settings")}
                >
                  WhatsApp setup
                </button>
              </div>
              <div className="outreach-grid">
                {leads
                  .filter(
                    (l) => l.draftBody && l.opportunity?.status === "qualified",
                  )
                  .slice(0, 60)
                  .map((l) => (
                    <article className="panel draft-card" key={l.id}>
                      <div className="draft-card-head">
                        <div>
                          <span className="draft-label">
                            {l.serviceFit} · {l.region}
                          </span>
                          <h3>{l.companyName}</h3>
                          <span>{l.phone ?? "No verified phone"}</span>
                        </div>
                        <Score lead={l} />
                      </div>
                      <p className="draft-subject">{l.draftSubject}</p>
                      <p className="draft-body">{l.draftBody}</p>
                      <div className="draft-footer">
                        <span>
                          {l.doNotContact
                            ? "Do not contact"
                            : l.consentAt
                              ? "Consent recorded"
                              : "Consent needed"}
                        </span>
                        <button
                          className="button button-primary"
                          onClick={() => setSelectedId(l.id)}
                        >
                          Review & outreach <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {!leads.some(
                (l) => l.draftBody && l.opportunity?.status === "qualified",
              ) && (
                <Empty>
                  Start a campaign to prepare tailored outreach drafts.
                </Empty>
              )}
              <div className="panel ledger-panel">
                <h2>Message activity</h2>
                {messages.length ? (
                  messages.map((m) => (
                    <div className="ledger-row" key={m.id}>
                      <div>
                        <strong>
                          {leads.find((l) => l.id === m.lead_id)?.companyName ??
                            "Saved contact"}
                        </strong>
                        <span>
                          {m.channel === "email"
                            ? "Email"
                            : (m.template_name ?? "WhatsApp reply")}{" "}
                          · {date(m.created_at)}
                        </span>
                        {m.error && <span>{m.error}</span>}
                      </div>
                      <div>
                        <span className={`message-status ${m.status}`}>
                          {m.status}
                        </span>
                        {canManage &&
                          ["pending", "unknown"].includes(m.status) && (
                            <button
                              className="text-button"
                              onClick={() => {
                                const result = window.prompt(
                                  "After checking the sending provider: type sent or failed.",
                                );
                                if (!["sent", "failed"].includes(result ?? ""))
                                  return;
                                const note = window.prompt(
                                  "Provider evidence for this result:",
                                );
                                if (!note || note.length < 8) return;
                                void act("/api/outreach", "PATCH", {
                                  id: m.id,
                                  status: result,
                                  note,
                                }).catch(() => undefined);
                              }}
                            >
                              Resolve result
                            </button>
                          )}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty>No messages sent from the dashboard yet.</Empty>
                )}
              </div>
              {inbound.length > 0 && (
                <div className="panel ledger-panel">
                  <h2>Recent inbound messages</h2>
                  {inbound.map((m) => (
                    <div className="ledger-row" key={m.id}>
                      <div>
                        <strong>
                          {leads.find((l) => l.id === m.lead_id)?.companyName ??
                            m.sender}
                        </strong>
                        <span>{date(m.received_at)}</span>
                        <p>{m.text_body || "Non-text message"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {section === "Spending" && (
            <Spending
              settings={settings}
              usage={usage}
              events={usageEvents}
              runs={runs}
              runSpending={data.runSpending ?? []}
              canManage={canManage}
              onSave={saveSettings}
              onReconcile={async (id, cost, note) => {
                await act("/api/usage", "PATCH", { id, costUsd: cost, note });
              }}
            />
          )}
          {section === "Learning" && (
            <Learning feedback={feedback} leads={leads} />
          )}
          {section === "Settings" && (
            <>
              <div className="settings-grid">
                <FocusSettings
                  settings={settings}
                  canManage={canManage}
                  onSave={saveSettings}
                />
                <WhatsAppSetup
                  canManage={canManage}
                  whatsapp={whatsapp}
                  onSaved={refresh}
                />
                <ProviderSettings
                  canManage={canManage}
                  providers={data.providers ?? []}
                  onSaved={refresh}
                />
                <BrowserAccessPanel email={email} />
                {canManage && (
                  <TeamAccessPanel
                    members={members}
                    inviteEmail={inviteEmail}
                    setInviteEmail={setInviteEmail}
                    inviteUrl={inviteUrl}
                    onInvite={inviteMember}
                    inviteBusy={inviteBusy}
                    onRemoveMember={removeMember}
                  />
                )}
                <div className="panel settings-panel">
                  <h2>Run from any device</h2>
                  <p>
                    Your database and job queue live in Supabase. The worker
                    processes one saved step at a time. A cloud scheduler keeps
                    it moving when this page is closed.
                  </p>
                  <p>
                    To move this app to Google Cloud Run, follow the deployment
                    guide in your repository. Set your browser password here
                    before moving.
                  </p>
                  <a
                    className="button button-outline"
                    href="https://github.com/HeftyAllen/Toran-Bot_V1-Outreach-Bot-/blob/main/docs/CLOUD_RUN.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cloud Run guide <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      {selected && (
        <Modal title={selected.companyName} onClose={() => setSelectedId(null)}>
          <BusinessDetail
            key={selected.id}
            lead={selected}
            canManage={canManage}
            connectedWhatsApp={!!whatsapp}
            connectedEmail={!!data.providers?.some((p) => p.id === "resend")}
            busy={busy}
            onChange={(patch) => changeLead(selected.id, patch)}
            onSend={async (payload) => {
              await act("/api/whatsapp/send", "POST", {
                leadId: selected.id,
                ...payload,
              });
            }}
            onEmail={async () => {
              await act("/api/email/send", "POST", {
                leadId: selected.id,
                confirm: true,
              });
            }}
            onDelete={async () => {
              await act(
                `/api/leads?id=${encodeURIComponent(selected.id)}`,
                "DELETE",
              );
              setSelectedId(null);
            }}
          />
        </Modal>
      )}
      {showAdd && (
        <Modal title="Add a business" onClose={() => setShowAdd(false)}>
          <form
            className="bot-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                await act("/api/leads", "POST", {
                  companyName: form.get("company"),
                  websiteUrl: form.get("website"),
                  discoverySourceUrl: form.get("source"),
                  countryCode: form.get("country"),
                  region: form.get("region"),
                });
                setShowAdd(false);
              } catch {
                /* Status displayed. */
              }
            }}
          >
            <label>
              Business name
              <input name="company" required maxLength={120} />
            </label>
            <label>
              Public website
              <input
                name="website"
                type="url"
                placeholder="https://example.com"
              />
            </label>
            <label>
              Individual business listing (if no website is known)
              <input
                name="source"
                type="url"
                placeholder="https://directory.example/business-profile"
              />
              <small>
                Provide a website or an individual listing. A broad category
                page cannot confirm a business.
              </small>
            </label>
            <label>
              Location
              <input
                name="region"
                maxLength={120}
                placeholder="City, country"
              />
            </label>
            <label>
              Business country
              <select
                name="country"
                defaultValue={settings.searchCountry ?? "ZA"}
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" disabled={busy}>
              Save to research queue
            </button>
            <p>
              Choose “Research saved queue” on Overview to process manually
              added businesses.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Bot;
}) {
  return (
    <div className="panel bot-stat">
      <div>
        <Icon size={18} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="bot-empty">
      <Globe2 size={25} />
      <p>{children}</p>
    </div>
  );
}
function Score({ lead }: { lead: Lead }) {
  const score = lead.opportunity?.version === 2 ? lead.fitScore : null;
  return (
    <span
      className={`score-chip ${score === null ? "score-unknown" : score >= 75 ? "score-high" : score >= 50 ? "score-mid" : "score-low"}`}
    >
      {score ?? "—"}
      <small>/100</small>
    </span>
  );
}
function LeadList({
  leads,
  onSelect,
}: {
  leads: Lead[];
  onSelect: (id: string) => void;
}) {
  return leads.length ? (
    <div className="business-list">
      {leads.map((l) => (
        <button
          className="business-row"
          key={l.id}
          onClick={() => onSelect(l.id)}
        >
          <div className="business-letter">{l.companyName[0]}</div>
          <div className="business-copy">
            <strong>{l.companyName}</strong>
            <span>
              {l.region ?? "Location unconfirmed"} ·{" "}
              {l.category ?? l.serviceFit ?? "Research pending"}
            </span>
            <span>
              {l.opportunity?.status === "qualified"
                ? `${l.opportunity.service} opportunity · `
                : l.opportunity?.status === "not_fit"
                  ? "Ruled out · "
                  : "Needs review · "}
              {l.opportunity?.websiteStatus === "not_found"
                ? "Official site not found"
                : l.opportunity?.websiteStatus === "weak"
                  ? "Website improvement signals"
                  : l.opportunity?.websiteStatus === "healthy"
                    ? "Established website"
                    : "Website not assessed"}
            </span>
            <span>
              {l.phone ?? ""}
              {l.phone && l.contactEmail ? " · " : ""}
              {l.contactEmail ??
                (!l.phone ? "Contact details not found yet" : "")}
            </span>
          </div>
          <div className="business-result">
            <Score lead={l} />
            <span>
              {l.doNotContact
                ? "Do not contact"
                : l.outcome
                  ? outcomeNames[l.outcome]
                  : l.status}
            </span>
          </div>
          <ArrowUpRight size={15} />
        </button>
      ))}
    </div>
  ) : (
    <Empty>
      No prospects in this view yet. Start a campaign, or switch the filter to
      review screened candidates.
    </Empty>
  );
}
function Runs({ runs }: { runs: Run[] }) {
  return runs.length ? (
    <div className="bot-runs">
      {runs.map((r) => (
        <div className="bot-run" key={r.id}>
          <span
            className={`connection-dot ${r.status === "complete" ? "is-connected" : ""}`}
          />
          <div>
            <strong>{r.message ?? r.status}</strong>
            <span>
              {r.config.locations ?? ""} · {date(r.createdAt)} · {r.status}
            </span>
            {r.requested > 0 && (
              <span>
                {r.config.qualificationVersion === 2
                  ? `${r.config.targetMode === "candidates" ? `${r.discovered}/${r.requested} candidates found` : `${r.qualified ?? 0}/${r.requested} qualified prospects`} · ${r.qualified ?? 0} qualified · ${r.processed} screened · ${r.excluded ?? 0} excluded · ${r.duplicates ?? 0} duplicates`
                  : `${r.discovered}/${r.requested} businesses saved · ${r.processed} researched`}{" "}
                · {r.failed} failed
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>No campaigns yet. Choose a location and start one above.</Empty>
  );
}
function RunProgress({
  run,
  paused,
  canManage,
  onCancel,
}: {
  run: Run;
  paused: boolean;
  canManage: boolean;
  onCancel: () => void;
}) {
  const done =
    run.config.targetMode === "candidates"
      ? run.processed + run.failed
      : run.config.qualificationVersion === 2
        ? (run.qualified ?? 0)
        : run.processed + run.failed;
  return (
    <div className="panel campaign-progress" role="status">
      <div>
        <span className="eyebrow">
          {paused ? "PAUSED" : "RUNNING IN THE CLOUD"}
        </span>
        <h3>{run.message}</h3>
        <p>
          {run.config.targetMode === "candidates"
            ? `${run.discovered}/${run.requested} candidates collected`
            : `${run.qualified ?? 0}/${run.requested} qualified prospects`}{" "}
          · {run.processed} screened · {run.failed} failed
          <br />
          {run.candidatesSeen ?? run.discovered} search candidates ·{" "}
          {run.excluded ?? 0} excluded · {run.duplicates ?? 0} duplicates ·{" "}
          {run.sentCount ?? 0} emails accepted
        </p>
        <progress
          aria-label="Research progress"
          value={done}
          max={Math.max(run.requested, 1)}
        />
        <span>
          {paused
            ? "Resume the bot to continue."
            : "This run continues when you close the page. Larger runs can take several minutes."}
        </span>
      </div>
      {canManage && (
        <button className="button button-outline" onClick={onCancel}>
          Cancel run
        </button>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="bot-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function BusinessDetail({
  lead: l,
  canManage,
  connectedWhatsApp,
  connectedEmail,
  busy,
  onChange,
  onSend,
  onEmail,
  onDelete,
}: {
  lead: Lead;
  canManage: boolean;
  connectedWhatsApp: boolean;
  connectedEmail: boolean;
  busy: boolean;
  onChange: (patch: Record<string, unknown>) => Promise<void>;
  onSend: (payload: Record<string, unknown>) => Promise<void>;
  onEmail: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [notice, setNotice] = useState(""),
    [kind, setKind] = useState("template");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const recent =
    l.lastInboundAt && now - new Date(l.lastInboundAt).getTime() < 86400000;
  const eligible = canManage && !l.doNotContact && !!l.consentAt && !!l.phone;
  async function perform(action: () => Promise<void>) {
    setNotice("");
    try {
      await action();
      setNotice("Saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save this change.");
    }
  }
  return (
    <div className="business-detail">
      <div className="detail-summary">
        <div>
          <span className="draft-label">
            {l.region} · {l.category ?? l.serviceFit}
          </span>
          <p>{l.summary ?? "Research has not finished yet."}</p>
        </div>
        <Score lead={l} />
      </div>
      <div className="detail-block">
        <h3>
          {l.opportunity?.status === "qualified"
            ? `${l.opportunity.service} opportunity`
            : l.opportunity?.status === "not_fit"
              ? "Ruled out"
              : "Opportunity needs review"}
        </h3>
        <p>
          {l.opportunity?.reason ??
            "This business has not been assessed under Toran’s opportunity rules."}
        </p>
        {l.opportunity?.evidence.map((e, i) => (
          <div key={`${e.url}-${i}`}>
            <p>{e.observation}</p>
            <blockquote>{e.quote}</blockquote>
            <a href={e.url} target="_blank" rel="noreferrer">
              Checked source <ArrowUpRight size={12} />
            </a>
          </div>
        ))}
        {l.opportunity?.officialSearch && (
          <p>
            Official website search checked{" "}
            {date(l.opportunity.officialSearch.checkedAt)}. A missing result is
            an opportunity to verify with the owner.
          </p>
        )}
        <p>
          Website screening uses public pages and optional mobile lab tests. Lab
          results are a snapshot; hidden systems and buying intent still need
          confirmation.
        </p>
        {canManage &&
          l.opportunity?.status !== "qualified" &&
          l.status !== "queued" &&
          l.status !== "researching" && (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void perform(() => onChange({ retry: true }))}
            >
              Queue fresh opportunity assessment
            </button>
          )}
      </div>
      {l.opportunity?.mobileAudit && (
        <div className="detail-block mobile-audit">
          <h3>Mobile website lab test</h3>
          <p>
            Checked {date(l.opportunity.mobileAudit.checkedAt)} ·{" "}
            {l.opportunity.mobileAudit.status}
          </p>
          {l.opportunity.mobileAudit.status === "complete" ? (
            <>
              <div className="audit-scores">
                <span>
                  Performance{" "}
                  <strong>
                    {l.opportunity.mobileAudit.performance ?? "—"}/100
                  </strong>
                </span>
                <span>
                  Accessibility{" "}
                  <strong>
                    {l.opportunity.mobileAudit.accessibility ?? "—"}/100
                  </strong>
                </span>
                <span>
                  Largest contentful paint{" "}
                  <strong>
                    {l.opportunity.mobileAudit.lcpMs === null
                      ? "—"
                      : `${(l.opportunity.mobileAudit.lcpMs / 1000).toFixed(1)}s`}
                  </strong>
                </span>
              </div>
              {l.opportunity.mobileAudit.screenshot && (
                <img
                  src={l.opportunity.mobileAudit.screenshot}
                  alt="Mobile screenshot captured by the website lab test"
                />
              )}
              {l.opportunity.mobileAudit.issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
              <p>
                One simulated mobile lab test. Scores do not establish
                subjective design quality or how every visitor experiences the
                site.
              </p>
            </>
          ) : (
            <p>{l.opportunity.mobileAudit.error}</p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="auth-message">
          {notice}
        </p>
      )}
      {l.researchError && (
        <div className="setup-notice">
          <p>{l.researchError}</p>
          {canManage && (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void perform(() => onChange({ retry: true }))}
            >
              Queue retry
            </button>
          )}
        </div>
      )}
      <div className="detail-contact-grid">
        <div>
          <span>Phone</span>
          {l.phone ? (
            <a href={`tel:${l.phone}`}>{l.phone}</a>
          ) : (
            <strong>Not found</strong>
          )}
        </div>
        <div>
          <span>Business email</span>
          {l.contactEmail ? (
            <a href={`mailto:${l.contactEmail}`}>{l.contactEmail}</a>
          ) : (
            <strong>Not found</strong>
          )}
        </div>
        <div>
          <span>Address</span>
          <strong>{l.address ?? l.region ?? "Not verified"}</strong>
        </div>
        <div>
          <span>Website</span>
          {l.websiteUrl ? (
            <a href={l.websiteUrl} target="_blank" rel="noreferrer">
              Open business website <ArrowUpRight size={12} />
            </a>
          ) : (
            <strong>Not established</strong>
          )}
        </div>
      </div>
      <details className="detail-block">
        <summary>Contact evidence & research sources</summary>
        <p>
          Checked {date(l.contactsVerifiedAt)}. Numbers are normalised using the
          campaign’s country code. A public number does not establish WhatsApp
          availability.
        </p>
        {l.contactSources?.map((s, i) => (
          <a
            className="contact-source"
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
          >
            {s.field}: {s.value}
            <small>{s.url}</small>
          </a>
        ))}
        {l.discoverySourceUrl && (
          <a href={l.discoverySourceUrl} target="_blank" rel="noreferrer">
            Discovery source <ArrowUpRight size={12} />
          </a>
        )}
      </details>
      {l.evidence?.length > 0 && (
        <div className="detail-block">
          <h3>Research observations</h3>
          <ul>
            {l.evidence.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p>
            {l.confidence ?? "Low"} confidence · Base score{" "}
            {l.baseScore ?? l.fitScore ?? "—"} · Feedback adjustment{" "}
            {l.calibrationDelta > 0 ? "+" : ""}
            {l.calibrationDelta ?? 0} · Learning version{" "}
            {l.learningVersion ?? 0}
          </p>
        </div>
      )}
      {canManage && (
        <form
          className="detail-block bot-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void perform(() =>
              onChange({ outcome: f.get("outcome"), note: f.get("note") }),
            );
          }}
        >
          <h3>Teach Bot 1 from the outcome</h3>
          <div className="inline-fields">
            <label>
              What happened?
              <select name="outcome" defaultValue={l.outcome ?? "good_fit"}>
                {Object.entries(outcomeNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What should it learn?
              <input
                name="note"
                maxLength={1200}
                placeholder="e.g. good location, service mismatch, reply context"
              />
            </label>
          </div>
          <button className="button button-outline" disabled={busy}>
            Save outcome & feedback
          </button>
        </form>
      )}
      <div className="detail-block">
        <h3>WhatsApp consent</h3>
        <p>
          {l.doNotContact
            ? "This contact is suppressed."
            : l.consentAt
              ? `Consent recorded ${date(l.consentAt)}: ${l.consentNote}`
              : "Record the recipient’s explicit agreement to WhatsApp messages before sending."}
        </p>
        {canManage && (
          <>
            <form
              className="bot-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void perform(() =>
                  onChange({ recordConsent: true, note: f.get("consent") }),
                );
              }}
            >
              <label>
                Consent evidence
                <input
                  name="consent"
                  minLength={8}
                  maxLength={1200}
                  required
                  placeholder="When, where, and what they agreed to"
                />
              </label>
              <button disabled={busy} className="button button-outline">
                Record consent
              </button>
            </form>
            <button
              className="text-button danger-text"
              disabled={busy}
              onClick={() =>
                void perform(() => onChange({ doNotContact: !l.doNotContact }))
              }
            >
              {l.doNotContact
                ? "Clear suppression (consent still required)"
                : "Mark do not contact"}
            </button>
          </>
        )}
      </div>
      <div className="detail-block bot-form">
        <h3>Email outreach</h3>
        <p>
          {connectedEmail
            ? "Email delivery is connected. Accepted messages are tracked in Outreach; replies go to your reply-to inbox."
            : "Connect a verified sender in Settings to enable email delivery."}
        </p>
        <p>
          {l.emailConsentAt
            ? `Email consent recorded ${date(l.emailConsentAt)}: ${l.emailConsentNote}`
            : "Record the recipient's agreement to email outreach before sending."}
        </p>
        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void perform(() =>
                onChange({
                  recordEmailConsent: true,
                  note: f.get("emailConsent"),
                }),
              );
            }}
          >
            <label>
              Email consent evidence
              <input
                name="emailConsent"
                minLength={8}
                maxLength={1200}
                required
                placeholder="When and how this contact agreed to email outreach"
              />
            </label>
            <button className="button button-outline" disabled={busy}>
              Record email consent
            </button>
          </form>
        )}
        {canManage && l.opportunity?.status === "qualified" && l.draftBody && (
          <button
            className="button button-primary"
            disabled={
              busy ||
              !connectedEmail ||
              !l.emailConsentAt ||
              !l.contactEmail ||
              l.doNotContact
            }
            onClick={() => {
              if (
                window.confirm(
                  `Send the displayed outreach draft to ${l.contactEmail}?`,
                )
              )
                void perform(onEmail);
            }}
          >
            Send email draft
          </button>
        )}
      </div>
      {l.draftBody && l.opportunity?.status === "qualified" && (
        <div className="detail-block">
          <h3>Suggested outreach draft</h3>
          <strong>{l.draftSubject}</strong>
          <p className="draft-body">{l.draftBody}</p>
          <div className="button-row">
            <button
              className="button button-outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(l.draftBody ?? "")
                  .then(() => setNotice("Draft copied."))
                  .catch(() => setNotice("Select the draft text to copy it."))
              }
            >
              <Copy size={14} /> Copy draft
            </button>
            {eligible && (
              <a
                className="button button-outline"
                href={`https://wa.me/${l.phone!.slice(1)}?text=${encodeURIComponent(l.draftBody)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={15} /> Open WhatsApp draft
              </a>
            )}
          </div>
        </div>
      )}
      {canManage && (
        <form
          className="detail-block bot-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void perform(() =>
              onSend({
                requestKey: crypto.randomUUID(),
                kind,
                body: f.get("body"),
                templateName: f.get("template"),
                language: f.get("language"),
                parameters: String(f.get("parameters") ?? "")
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }),
            );
          }}
        >
          <h3>Send through WhatsApp Business</h3>
          <p>
            {connectedWhatsApp
              ? "Meta sends your approved template or a reply during the open service window. Delivery status appears in Outreach."
              : "Connect your Meta Cloud API account in Settings to enable direct sends."}
          </p>
          <label>
            Message type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="template">Approved Meta template</option>
              <option value="text" disabled={!recent}>
                Text reply (24-hour window)
              </option>
            </select>
          </label>
          {kind === "template" ? (
            <>
              <div className="inline-fields">
                <label>
                  Approved template name
                  <input
                    name="template"
                    pattern="[a-z0-9_]+"
                    required
                    placeholder="business_introduction"
                  />
                </label>
                <label>
                  Template language
                  <input name="language" defaultValue="en_US" required />
                </label>
              </div>
              <label>
                Body parameters, in approved order
                <textarea
                  name="parameters"
                  rows={3}
                  placeholder="One text value per line, if your template uses placeholders"
                />
              </label>
              <p>
                Preview the approved template in Meta before sending. This form
                supports text body parameters.
              </p>
            </>
          ) : (
            <label>
              Reply text
              <textarea
                name="body"
                defaultValue={
                  l.opportunity?.status === "qualified"
                    ? (l.draftBody ?? "")
                    : ""
                }
                maxLength={3000}
                required
                rows={4}
              />
            </label>
          )}
          <button
            className="button button-primary"
            disabled={busy || !eligible || !connectedWhatsApp}
          >
            <MessageCircle size={15} /> Send{" "}
            {kind === "template" ? "approved template" : "reply"}
          </button>
        </form>
      )}
      {canManage && (
        <details className="detail-block">
          <summary>Correct a public contact</summary>
          <form
            className="bot-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const phone = String(f.get("phone") ?? "").trim(),
                contactEmail = String(f.get("contactEmail") ?? "").trim();
              if (!phone && !contactEmail) {
                setNotice("Enter a phone or email to correct.");
                return;
              }
              void perform(() =>
                onChange({
                  ...(phone ? { phone } : {}),
                  ...(contactEmail ? { contactEmail } : {}),
                  sourceUrl: f.get("sourceUrl"),
                }),
              );
            }}
          >
            <label>
              International phone
              <input name="phone" placeholder="Country code and phone number" />
            </label>
            <label>
              Business email
              <input name="contactEmail" type="email" />
            </label>
            <label>
              Public source URL
              <input
                name="sourceUrl"
                type="url"
                required
                placeholder="https://business.example/contact"
              />
            </label>
            <button className="button button-outline" disabled={busy}>
              Save verified correction
            </button>
          </form>
        </details>
      )}
      {canManage && (
        <button
          className="text-button danger-text"
          onClick={() => {
            if (
              window.confirm(
                `Delete ${l.companyName}? Its feedback history and spending records remain.`,
              )
            )
              void perform(onDelete);
          }}
        >
          <Trash2 size={14} /> Delete business
        </button>
      )}
    </div>
  );
}
function Spending({
  settings,
  usage,
  events,
  runs,
  runSpending,
  canManage,
  onSave,
  onReconcile,
}: {
  settings: Settings;
  usage: Usage;
  events: UsageEvent[];
  runs: Run[];
  runSpending: RunSpend[];
  canManage: boolean;
  onSave: (patch: Partial<Settings>) => Promise<void>;
  onReconcile: (id: string, cost: number, note: string) => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const month = Number(usage.monthEstimatedUsd) + Number(usage.monthActualUsd);
  const allocated = month + Number(usage.monthReservedUsd);
  const qualified = runs.reduce(
    (total, r) => total + Number(r.qualified ?? 0),
    0,
  );
  const spent = runSpending.reduce((total, r) => total + Number(r.spentUsd), 0);
  return (
    <>
      <div className="metrics-grid">
        <Stat
          icon={Wallet}
          label="Estimated this month"
          value={money(usage.monthEstimatedUsd)}
          detail="AI, discovery and configured message estimates"
        />
        <Stat
          icon={Check}
          label="Confirmed this month"
          value={money(usage.monthActualUsd)}
          detail="Manually reconciled with provider billing"
        />
        <Stat
          icon={Pause}
          label="Reserved / unconfirmed"
          value={money(usage.monthReservedUsd)}
          detail={`${usage.unconfirmedCount} request results need review`}
        />
        <Stat
          icon={Globe2}
          label="Cost per qualified prospect"
          value={qualified ? money(spent / qualified) : "—"}
          detail="Tracked spend across the latest 20 campaigns"
        />
      </div>
      <div className="panel budget-panel">
        <div>
          <h2>Monthly spending guard</h2>
          <p>
            {money(allocated)} used or reserved of{" "}
            {money(settings.monthlyBudgetUsd)} ·{" "}
            {money(Math.max(0, settings.monthlyBudgetUsd - allocated))}{" "}
            available
          </p>
          <progress
            aria-label="Monthly spending allocation"
            value={allocated}
            max={Math.max(settings.monthlyBudgetUsd, 0.0001)}
          />
          <p>
            Limits use tracked estimates and reservations, checked before each
            paid request. Provider invoices may differ. Cloud Run hosting and
            other external charges need billing reconciliation.
          </p>
        </div>
      </div>
      {notice && (
        <p className="auth-message" role="status">
          {notice}
        </p>
      )}
      {canManage && (
        <form
          className="panel campaign-form bot-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await onSave({
                monthlyBudgetUsd: Number(f.get("monthly")),
                runBudgetUsd: Number(f.get("run")),
                whatsappUnitCostUsd:
                  String(f.get("wa") ?? "") === "" ? null : Number(f.get("wa")),
              });
              setNotice("Spending limits saved.");
            } catch (e) {
              setNotice(
                e instanceof Error ? e.message : "Could not save limits.",
              );
            }
          }}
        >
          <h2>Budget controls</h2>
          <div className="campaign-fields">
            <label>
              Monthly limit (USD)
              <input
                name="monthly"
                type="number"
                min={0}
                max={10000}
                step={0.01}
                defaultValue={settings.monthlyBudgetUsd}
                required
              />
            </label>
            <label>
              Default run limit (USD)
              <input
                name="run"
                type="number"
                min={0.05}
                max={100}
                step={0.05}
                defaultValue={settings.runBudgetUsd}
                required
              />
            </label>
            <label>
              WhatsApp cost per message (USD)
              <input
                name="wa"
                type="number"
                min={0}
                max={10}
                step={0.0001}
                defaultValue={settings.whatsappUnitCostUsd ?? ""}
                placeholder="Use Meta’s rate for your template/recipient"
              />
              <small>
                Leave empty to block direct sends until pricing is set.
              </small>
            </label>
          </div>
          <button className="button button-outline">
            Save spending controls
          </button>
        </form>
      )}
      <div className="panel ledger-panel">
        <h2>Campaign costs & results</h2>
        <p>
          A business collected is a candidate. Qualification happens after
          screening. Each row includes its full tracked ledger.
        </p>
        {runs.length ? (
          runs.map((run) => {
            const cost = runSpending.find((c) => c.runId === run.id);
            return (
              <div className="ledger-row" key={run.id}>
                <div>
                  <strong>
                    {run.config.market ?? "Campaign"} · {run.status}
                  </strong>
                  <span>
                    {date(run.createdAt)} · {run.discovered} collected ·{" "}
                    {run.processed + run.failed} screened · {run.qualified ?? 0}{" "}
                    qualified · {run.sentCount ?? 0} emails accepted
                  </span>
                  <span>
                    {run.config.locations} · Limit{" "}
                    {money(run.config.budgetUsd ?? settings.runBudgetUsd)}
                  </span>
                </div>
                <div>
                  <strong>{money(cost?.spentUsd ?? 0)}</strong>
                  <span>{money(cost?.reservedUsd ?? 0)} held</span>
                  <span>
                    {run.qualified && cost
                      ? `${money(cost.spentUsd / run.qualified)} / qualified`
                      : "No qualified prospects yet"}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <Empty>Start a campaign to compare its spend and results.</Empty>
        )}
      </div>
      <div className="panel ledger-panel">
        <h2>Usage ledger</h2>
        <p>
          Tracking started {date(usage.trackingSince)}. Earlier calls are not
          included. Costs are in USD; these values do not represent your full
          account balance.
        </p>
        <p>
          {usage.inputTokens.toLocaleString()} input tokens ·{" "}
          {usage.outputTokens.toLocaleString()} output tokens ·{" "}
          {usage.searchCalls} web searches
        </p>
        {events.length ? (
          events.map((event) => (
            <div className="ledger-row" key={event.id}>
              <div>
                <strong>
                  {event.provider} · {event.kind}
                </strong>
                <span>
                  {event.model ?? "Provider rate"} · {date(event.created_at)} ·{" "}
                  {event.state}
                </span>
                {canManage && event.state === "unconfirmed" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const raw = window.prompt(
                        "Confirmed cost in USD for this request, from the provider billing record. Use 0 only if the provider confirms it was not charged.",
                      );
                      if (
                        raw === null ||
                        raw.trim() === "" ||
                        !Number.isFinite(Number(raw)) ||
                        Number(raw) < 0
                      )
                        return;
                      const note = window.prompt(
                        "Billing reference or evidence:",
                      );
                      if (!note || note.length < 5) return;
                      void onReconcile(event.id, Number(raw), note)
                        .then(() => setNotice("Billing record confirmed."))
                        .catch((e) => setNotice(e.message));
                    }}
                  >
                    Reconcile with billing
                  </button>
                )}
              </div>
              <strong>
                {event.cost_usd === null
                  ? `${money(event.reserved_usd)} held`
                  : money(event.cost_usd)}
              </strong>
            </div>
          ))
        ) : (
          <Empty>
            Every paid research or send request will create a ledger entry.
          </Empty>
        )}
      </div>
    </>
  );
}
function Learning({
  feedback,
  leads,
}: {
  feedback: Feedback[];
  leads: Lead[];
}) {
  const unique = latestFeedback(feedback);
  const positive = unique.filter((x) =>
    ["good_fit", "replied", "booked", "won"].includes(x.outcome),
  );
  const groups = [
    ...new Set(
      unique.map(
        (x) => `${x.service_fit ?? ""}|${x.region ?? ""}|${x.category ?? ""}`,
      ),
    ),
  ]
    .slice(0, 12)
    .map((key) => {
      const [service, region, category] = key.split("|");
      return {
        service,
        region,
        category,
        ...calibration(feedback, service, region, category),
      };
    });
  return (
    <>
      <div className="metrics-grid">
        <Stat
          icon={Activity}
          label="Reviewed businesses"
          value={String(unique.length)}
          detail="Latest outcome per business; recent 1,000 events"
        />
        <Stat
          icon={Target}
          label="Positive fit / sales signals"
          value={String(positive.length)}
          detail="Good fit, replied, booked, or won"
        />
        <Stat
          icon={Sparkles}
          label="Current learning version"
          value={String(unique.length)}
          detail="Records used for the next research run"
        />
        <Stat
          icon={Check}
          label="Scores adjusted"
          value={String(leads.filter((x) => x.calibrationDelta !== 0).length)}
          detail="A maximum 10-point adjustment"
        />
      </div>
      <div className="panel ledger-panel">
        <h2>How improvement works</h2>
        <p>
          Bot 1 retrieves your recent reviewed outcomes and notes during
          research. It also compares similar service, category, and location
          groups. After at least five reviewed businesses in a matching group, a
          smoothed success rate can adjust the next score by up to 10 points.
        </p>
        <p>
          Each business keeps its base score, adjustment, and learning version.
          Outcomes are saved as an audit trail; repeated edits to one business
          count as one example. Five matching industry/service examples can
          guide discovery priorities within your chosen search. This is
          feedback-based calibration, not model retraining. Budget and contact
          permissions stay under your control.
        </p>
        <div className="learning-groups">
          {groups.map((g, i) => (
            <div className="learning-group" key={i}>
              <div>
                <strong>
                  {g.service || "Unclassified"} ·{" "}
                  {g.region || g.category || "Unknown area"}
                </strong>
                <span>{g.samples} similar reviewed businesses</span>
              </div>
              <strong>
                {g.samples < 5
                  ? "Collecting evidence"
                  : `${g.delta > 0 ? "+" : ""}${g.delta} points`}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <div className="panel ledger-panel">
        <h2>Feedback history</h2>
        {feedback.length ? (
          feedback.slice(0, 30).map((f, i) => (
            <div className="ledger-row" key={i}>
              <div>
                <strong>{f.company_name}</strong>
                <span>
                  {outcomeNames[f.outcome]} · {date(f.created_at)}
                </span>
                {f.note && <p>{f.note}</p>}
              </div>
            </div>
          ))
        ) : (
          <Empty>
            Open a researched business and record the outcome and what Bot 1
            should learn.
          </Empty>
        )}
      </div>
    </>
  );
}
function FocusSettings({
  settings,
  canManage,
  onSave,
}: {
  settings: Settings;
  canManage: boolean;
  onSave: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <form
      className="panel settings-panel bot-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await onSave({
            brandName: String(f.get("brand")),
            brandDomain: String(f.get("domain")),
            targetMarket: String(f.get("market")),
            targetLocations: String(f.get("locations")),
            services: String(f.get("services")),
            researchLimit: Number(f.get("count")),
            searchCountry: String(f.get("country")),
          });
          setMessage("Defaults saved.");
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Could not save.");
        }
      }}
    >
      <h2>Business & search defaults</h2>
      <label>
        Business name
        <input
          name="brand"
          defaultValue={settings.brandName}
          maxLength={500}
          disabled={!canManage}
        />
      </label>
      <label>
        Your domain
        <input
          name="domain"
          defaultValue={settings.brandDomain}
          maxLength={500}
          disabled={!canManage}
        />
      </label>
      <label>
        Target business types
        <input
          name="market"
          defaultValue={settings.targetMarket}
          maxLength={500}
          disabled={!canManage}
        />
      </label>
      <label>
        Locations
        <input
          name="locations"
          defaultValue={settings.targetLocations}
          maxLength={500}
          disabled={!canManage}
        />
      </label>
      <label>
        Services offered
        <textarea
          name="services"
          defaultValue={settings.services}
          maxLength={500}
          rows={3}
          disabled={!canManage}
        />
      </label>
      <div className="inline-fields">
        <label>
          Businesses per run
          <input
            name="count"
            type="number"
            min={1}
            max={100}
            defaultValue={settings.researchLimit}
            disabled={!canManage}
          />
        </label>
        <label>
          Default search country
          <select
            name="country"
            defaultValue={settings.searchCountry ?? "ZA"}
            disabled={!canManage}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        API connection: {settings.apiConfigured ? "configured" : "needs setup"}{" "}
        · Worker: {settings.workerConfigured ? "configured" : "needs setup"}
      </p>
      {message && <p role="status">{message}</p>}
      {canManage && (
        <button className="button button-outline">Save defaults</button>
      )}
    </form>
  );
}
function WhatsAppSetup({
  canManage,
  whatsapp,
  onSaved,
}: {
  canManage: boolean;
  whatsapp: Overview["whatsapp"];
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [callback] = useState(() =>
    typeof window === "undefined"
      ? "/api/whatsapp/webhook"
      : `${window.location.origin}/api/whatsapp/webhook`,
  );
  return (
    <div className="panel settings-panel">
      <h2>WhatsApp Business connection</h2>
      <p>
        {whatsapp
          ? `Connected: ${whatsapp.label} · ${whatsapp.phone_number_id}`
          : "Connect Meta’s official Cloud API to send from the dashboard."}
      </p>
      <p>
        Use a business phone number, a system-user access token with WhatsApp
        messaging permissions, and the app secret. Credentials are encrypted and
        stay on the server.
      </p>
      <label className="callback-label">
        Webhook callback URL
        <input
          readOnly
          value={callback}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {canManage && (
        <form
          className="bot-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const element = e.currentTarget;
            const f = new FormData(element);
            setBusy(true);
            try {
              const result = await api("/api/integrations/whatsapp", "POST", {
                label: f.get("label"),
                phoneNumberId: f.get("phone"),
                apiVersion: f.get("version"),
                token: f.get("token"),
                appSecret: f.get("secret"),
                verifyToken: f.get("verify"),
              });
              setMessage(result.message ?? "Connection saved.");
              element.reset();
              await onSaved();
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Could not connect.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Connection name
            <input
              name="label"
              defaultValue={whatsapp?.label ?? "WhatsApp Business"}
              maxLength={100}
            />
          </label>
          <div className="inline-fields">
            <label>
              Phone Number ID
              <input
                name="phone"
                defaultValue={whatsapp?.phone_number_id ?? ""}
                pattern="[0-9]{5,30}"
                required
              />
            </label>
            <label>
              Graph API version
              <input
                name="version"
                defaultValue={whatsapp?.api_version ?? "v23.0"}
                pattern="v[0-9]{1,2}\.0"
                required
              />
            </label>
          </div>
          <label>
            Access token
            <input
              name="token"
              type="password"
              autoComplete="off"
              required={!whatsapp}
              placeholder={whatsapp ? "Blank keeps saved token" : ""}
            />
          </label>
          <label>
            Meta app secret
            <input
              name="secret"
              type="password"
              autoComplete="off"
              required={!whatsapp}
              placeholder={whatsapp ? "Blank keeps saved secret" : ""}
            />
          </label>
          <label>
            Webhook verify token
            <input
              name="verify"
              type="password"
              autoComplete="off"
              minLength={16}
              required={!whatsapp}
              placeholder={
                whatsapp
                  ? "Blank keeps saved token"
                  : "Choose 16+ random characters; use the same value in Meta"
              }
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <MessageCircle size={15} />
            )}{" "}
            Verify & save connection
          </button>
        </form>
      )}
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      <p>
        In Meta, set the callback URL above and the same verify token, then
        subscribe to “messages”. First contact requires an approved template and
        recipient consent. STOP messages suppress further outreach
        automatically.
      </p>
      {canManage && whatsapp && (
        <button
          className="text-button danger-text"
          onClick={() =>
            void api("/api/integrations/whatsapp", "DELETE")
              .then(onSaved)
              .catch((e) => setMessage(e.message))
          }
        >
          Disconnect account
        </button>
      )}
    </div>
  );
}
function BrowserAccessPanel({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const currentPassword = String(form.get("currentPassword") ?? "");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, currentPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not save your browser password.");
      formElement.reset();
      setMessage(
        "Password saved. You can now sign in from any browser using your email.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your browser password.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel settings-panel">
      <div className="settings-heading">
        <div className="settings-heading-icon orange">
          <ShieldCheck size={17} />
        </div>
        <div>
          <h2>Browser sign-in</h2>
          <p>Set a password to use the dashboard outside ChatGPT.</p>
        </div>
      </div>
      <form className="password-form" onSubmit={submit}>
        <label>
          Email
          <input value={email} readOnly />
        </label>
        <label>
          Current password{" "}
          <span className="optional">
            Only needed when changing an existing password
          </span>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <span>At least 12 characters.</span>
        </label>
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
        <button className="button button-outline" disabled={busy}>
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <ShieldCheck size={15} />
          )}{" "}
          Save browser password
        </button>
      </form>
    </div>
  );
}

function TeamAccessPanel({
  members,
  inviteEmail,
  setInviteEmail,
  inviteUrl,
  onInvite,
  inviteBusy,
  onRemoveMember,
}: {
  members: Array<{ email: string; role: string; created_at: string }>;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteUrl: string;
  onInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  inviteBusy: boolean;
  onRemoveMember: (email: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="panel settings-panel full-settings team-panel">
      <div className="settings-heading">
        <div className="settings-heading-icon">
          <UserPlus size={17} />
        </div>
        <div>
          <h2>Team access</h2>
          <p>
            Invite your partner as a read-only viewer. You keep owner controls.
          </p>
        </div>
      </div>
      <form className="invite-form" onSubmit={onInvite}>
        <label>
          Partner email
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="partner@example.com"
            required
          />
        </label>
        <button className="button button-primary" disabled={inviteBusy}>
          {inviteBusy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <UserPlus size={15} />
          )}{" "}
          Create invite link
        </button>
      </form>
      {inviteUrl && (
        <div className="invite-link-box">
          <div>
            <strong>One-time setup link</strong>
            <span>
              Copy and send this link yourself. It expires in 7 days and can be
              used once to create a password.
            </span>
          </div>
          <input
            aria-label="Partner invitation link"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="button button-outline"
            onClick={() => void copyInvite()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
      <div className="member-list">
        {members.map((member) => (
          <div className="member-row" key={member.email}>
            <div className="member-avatar">
              {member.email.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{member.email}</strong>
              <span>{member.role === "owner" ? "Owner" : "Viewer"}</span>
            </div>
            {member.role === "viewer" && (
              <button
                className="icon-button mini"
                title={`Remove ${member.email}`}
                aria-label={`Remove ${member.email}`}
                onClick={() => void onRemoveMember(member.email)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
