"use client";

import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  FileText,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Section = "Overview" | "Leads" | "Outreach" | "Learning" | "Settings";
type Lead = {
  id: string;
  companyName: string;
  websiteUrl: string;
  region: string | null;
  status: string;
  fitScore: number | null;
  confidence: string | null;
  serviceFit: string | null;
  summary: string | null;
  evidence: string[] | string | null;
  discoverySourceUrl: string | null;
  draftSubject: string | null;
  draftBody: string | null;
  outcome: string | null;
  createdAt: string;
};
type Run = { id: string; status: string; processed: number; message: string | null; createdAt: string };
type Settings = {
  brandName: string;
  brandDomain: string;
  targetMarket: string;
  targetLocations: string;
  services: string;
  automationEnabled: boolean;
  apiConfigured: boolean;
  researchLimit: number;
};

const navItems: { name: Section; icon: typeof LayoutDashboard }[] = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Leads", icon: Target },
  { name: "Outreach", icon: FileText },
  { name: "Learning", icon: Activity },
];

const defaultSettings: Settings = {
  brandName: "New business",
  brandDomain: "",
  targetMarket: "Restaurants and ecommerce businesses",
  targetLocations: "Midrand, Sandton, Johannesburg",
  services: "Websites, ecommerce, business automation",
  automationEnabled: true,
  apiConfigured: false,
  researchLimit: 3,
};

function scoreTone(score: number | null) {
  if (score === null) return "score-unknown";
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-mid";
  return "score-low";
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Just now"
    : date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export default function Dashboard({ displayName, email, role, authSource }: { displayName: string; email: string; role: "owner" | "viewer"; authSource: "password" | "chatgpt" }) {
  const canManage = role === "owner";
  const [section, setSection] = useState<Section>("Overview");
  const [settings, setSettings] = useState(defaultSettings);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [members, setMembers] = useState<Array<{ email: string; role: string; created_at: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("Dashboard data is unavailable.");
      const data = await response.json() as { settings?: Partial<Settings>; leads?: Lead[]; runs?: Run[]; role?: string };
      setSettings({ ...defaultSettings, ...data.settings });
      setLeads(data.leads ?? []);
      setRuns(data.runs ?? []);
      if (data.role && data.role !== role) window.location.reload();
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshMembers() {
    if (!canManage) return;
    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { members?: Array<{ email: string; role: string; created_at: string }> };
      setMembers(data.members ?? []);
    } catch { /* Keep the rest of the dashboard usable if this panel is unavailable. */ }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filteredLeads = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => `${lead.companyName} ${lead.websiteUrl} ${lead.region ?? ""}`.toLowerCase().includes(term));
  }, [leads, query]);
  const reviewCount = leads.filter((lead) => ["researched", "drafted", "ready"].includes(lead.status)).length;
  const approvedCount = leads.filter((lead) => ["good_fit", "replied", "booked", "won"].includes(lead.outcome ?? "")).length;
  const bookedCount = leads.filter((lead) => lead.outcome === "booked").length;
  const avgScore = leads.filter((lead) => lead.fitScore !== null).length
    ? Math.round(leads.reduce((total, lead) => total + (lead.fitScore ?? 0), 0) / leads.filter((lead) => lead.fitScore !== null).length)
    : null;

  async function runResearch() {
    if (!settings.automationEnabled) {
      setStatusText("Allow runs from the Bot 1 panel before starting research.");
      return;
    }
    if (!connected) {
      setStatusText("The cloud workspace is not connected yet.");
      return;
    }
    setBusy(true);
    setStatusText("");
    try {
      const response = await fetch("/api/run", { method: "POST" });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "The research run could not start.");
      setStatusText(data.message ?? "Research run finished.");
      await refresh();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "The research run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSetting(key: keyof Settings, value: string | number | boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error("Couldn't save that setting.");
      setStatusText("Settings saved.");
      await refresh();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't save that setting.");
      await refresh();
    }
  }

  async function addLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: form.get("company"), websiteUrl: form.get("website"), region: form.get("region") }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't add that business.");
      setShowAdd(false);
      setStatusText("Business added to the research queue.");
      await refresh();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't add that business.");
    } finally {
      setBusy(false);
    }
  }

  async function setOutcome(lead: Lead, outcome: string) {
    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, outcome }),
      });
      if (!response.ok) throw new Error("Couldn't save the outcome.");
      await refresh();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't save the outcome.");
    }
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Remove ${lead.companyName} and its research from this workspace?`)) return;
    try {
      const response = await fetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't remove that business.");
      setSelectedLead(null);
      setStatusText("Business and its research were removed.");
      await refresh();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't remove that business.");
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteUrl("");
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await response.json() as { error?: string; inviteUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't create the invitation.");
      if (typeof data.inviteUrl !== "string") throw new Error("The invite link could not be created.");
      setInviteUrl(data.inviteUrl);
      setInviteEmail("");
      setStatusText("Invite created. Copy the one-time link and send it to your partner.");
      await refreshMembers();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't create the invitation.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeMember(memberEmail: string) {
    if (!window.confirm(`Remove ${memberEmail} from this workspace?`)) return;
    try {
      const response = await fetch(`/api/members?email=${encodeURIComponent(memberEmail)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't remove that member.");
      setInviteUrl("");
      setStatusText(`${memberEmail} no longer has access.`);
      await refreshMembers();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Couldn't remove that member.");
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/signin");
  }

  function navigate(name: Section) {
    setSection(name);
    setMobileMenu(false);
  }

  return (
    <div className={`app-shell ${dark ? "dark" : ""}`}>
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Command size={17} strokeWidth={2.4} /></div>
          <div><strong>BOT STUDIO</strong><span>PROSPECTING</span></div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileMenu(false)}><X size={18} /></button>
        </div>
        <div className="workspace-card">
          <div className="workspace-orb"><Bot size={19} /></div>
          <div className="workspace-copy"><span>WORKSPACE</span><strong>{settings.brandName || "New business"}</strong></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => navigate(name)}>
              <Icon size={17} strokeWidth={1.9} /><span>{name}</span>
              {name === "Leads" && reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}
            </button>
          ))}
        </nav>
        <p className="nav-caption nav-caption-lower">PREFERENCES</p>
        <button className={`nav-item ${section === "Settings" ? "active" : ""}`} onClick={() => navigate("Settings")}>
          <Settings2 size={17} strokeWidth={1.9} /><span>Settings</span>
        </button>
        <div className="sidebar-bottom">
          <div className="helper-card">
            <div className="helper-icon"><CircleHelp size={17} /></div>
            <div><strong>Need a hand?</strong><span>Check setup and run status.</span></div>
            <ArrowUpRight size={14} />
          </div>
          <div className="profile-row">
            <div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy"><strong>{displayName}</strong><span>{email} · {role}</span></div>
            <MoreHorizontal size={17} className="muted-icon" />
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-trigger" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Bot Studio</span><span className="breadcrumb-slash">/</span><strong>{section}</strong></div>
          <div className="top-actions">
          <div className="connection-pill"><span className={`connection-dot ${connected ? "is-connected" : ""}`} />{connected ? `${role === "owner" ? "Owner" : "Viewer"} · cloud connected` : "Connecting…"}</div>
            <button className="icon-button theme-button" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            {authSource === "password" && <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={16} /></button>}
            <button className="avatar top-avatar" aria-label="Account">{displayName.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>

        <main className="content-area">
          {section === "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-dot" />YOUR PROSPECTING WORKSPACE</div>
                  <h1>Good morning, {displayName.split(" ")[0]}<span className="heading-period">.</span></h1>
                  <p>Discover local businesses, review fit, and approve the next step from any device.</p>
                </div>
                {canManage && <button className="button button-outline" onClick={() => setShowAdd(true)}><Plus size={17} /> Add a business</button>}
              </div>

              {statusText && <div className="toast-message" role="status"><span>{statusText}</span><button aria-label="Dismiss" onClick={() => setStatusText("")}><X size={15} /></button></div>}

              <section className="bot-banner">
                <div className="bot-banner-main">
                  <div className="bot-symbol"><Bot size={25} strokeWidth={1.8} /><span className="bot-spark"><Sparkles size={13} /></span></div>
                  <div className="bot-banner-copy">
                    <div className="bot-label-row"><span className="bot-label">BOT 01</span><span className={`run-state ${settings.automationEnabled ? "run-state-on" : ""}`}><span />{settings.automationEnabled ? "RUNS ENABLED" : "PAUSED"}</span></div>
                    <h2>Prospect researcher</h2>
                    <p>Finds public business websites that fit your targeting, reviews each site, and prepares drafts for your approval.</p>
                  </div>
                </div>
                <div className="bot-banner-controls">
                  {canManage && <button className={`button ${settings.automationEnabled ? "button-outline" : "button-soft"}`} onClick={() => void updateSetting("automationEnabled", !settings.automationEnabled)}>
                    {settings.automationEnabled ? <><Pause size={15} /> Pause new runs</> : <><Play size={15} fill="currentColor" /> Allow runs</>}
                  </button>}
                  {canManage && <button className="button button-primary run-button" disabled={busy || !connected || !settings.automationEnabled} onClick={() => void runResearch()}>
                    {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                    {busy ? "Finding & researching…" : "Find & research leads"}
                  </button>}
                  {!canManage && <span className="role-note"><ShieldCheck size={14} /> Viewer access</span>}
                </div>
                <div className="banner-footnote"><ShieldCheck size={14} /> Searches public sources, researches business websites, and drafts messages. Nothing is sent.<span className="banner-footnote-divider" />Up to {settings.researchLimit} sites per run · 3 runs/24h</div>
              </section>

              {!connected && (
                <div className="setup-notice"><div className="setup-notice-icon"><CircleHelp size={18} /></div><div><strong>Connecting to the cloud workspace</strong><span>Dashboard data will appear when the database connection is ready.</span></div><button onClick={() => void refresh()}>Retry <ArrowUpRight size={14} /></button></div>
              )}

              <section className="metrics-grid" aria-label="Lead metrics">
                <MetricCard icon={BriefcaseBusiness} label="Businesses researched" value={String(leads.filter((lead) => lead.fitScore !== null).length).padStart(2, "0")} foot="Across your saved queue" accent="blue" />
                <MetricCard icon={Target} label="Ready for your review" value={String(reviewCount).padStart(2, "0")} foot={reviewCount ? "Scored with evidence" : "No leads waiting"} accent="violet" />
                <MetricCard icon={BadgeCheck} label="Positive outcomes" value={String(approvedCount).padStart(2, "0")} foot="Recorded from your feedback" accent="green" />
                <MetricCard icon={ArrowUpRight} label="Calls booked" value={String(bookedCount).padStart(2, "0")} foot="From tracked outcomes" accent="orange" />
              </section>

              <section className="content-grid">
                <div className="panel leads-panel">
                  <div className="panel-heading">
                    <div><div className="section-title-row"><h2>Lead queue</h2>{reviewCount > 0 && <span className="soft-count">{reviewCount} to review</span>}</div><p>Every score comes with a reason you can check.</p></div>
                    <button className="text-button" onClick={() => navigate("Leads")}>View all <ArrowUpRight size={14} /></button>
                  </div>
                  {leads.length ? (
                    <LeadTable leads={filteredLeads.slice(0, 5)} onOutcome={setOutcome} onDetails={setSelectedLead} canManage={canManage} />
                  ) : (
                    <div className="empty-leads">
                      <div className="empty-art"><Globe2 size={25} /><span><Plus size={13} /></span></div>
                      <strong>Your first prospects start here</strong>
                      <p>Start with one click. Bot 1 will search public sources for businesses matching your target market.</p>
                      {canManage && <button className="button button-primary" disabled={busy || !connected || !settings.automationEnabled} onClick={() => void runResearch()}><Sparkles size={15} /> Find my first leads</button>}
                    </div>
                  )}
                </div>
                <div className="right-rail">
                  <div className="panel pulse-panel">
                    <div className="panel-heading compact"><div><div className="eyebrow">BOT ACTIVITY</div><h2>Recent runs</h2></div><Activity size={17} className="muted-icon" /></div>
                    {runs.length ? <div className="activity-list">{runs.slice(0, 4).map((run) => <div className="activity-row" key={run.id}><span className={`activity-status ${run.status}`}><Check size={12} /></span><div className="activity-copy"><strong>{run.message || `Processed ${run.processed} businesses`}</strong><span>{shortDate(run.createdAt)} · {run.status}</span></div></div>)}</div> : <div className="empty-activity"><div className="activity-line"><span /><span /><span /></div><p>No activity yet</p><span>Your first research run will show here.</span></div>}
                    <div className="last-run-footer"><span>Average fit score</span><strong>{avgScore === null ? "—" : `${avgScore}/100`}</strong></div>
                  </div>
                  <div className="panel focus-panel">
                  <div className="focus-panel-top"><div className="focus-icon"><Target size={17} /></div><span>YOUR FOCUS</span>{canManage && <button className="icon-button mini" aria-label="Edit focus" onClick={() => setShowSettings(true)}><Settings2 size={15} /></button>}</div>
                    <strong>{settings.targetMarket}</strong>
                    <p><Globe2 size={13} /> {settings.targetLocations}</p>
                    {canManage && <button className="text-button" onClick={() => setShowSettings(true)}>Edit targeting <ArrowUpRight size={14} /></button>}
                  </div>
                </div>
              </section>
              <div className="learning-strip"><div className="learning-strip-icon"><Sparkles size={16} /></div><div><strong>Bot learns from your decisions</strong><span>Mark a lead as a good fit, poor fit, replied, or booked. Those outcomes guide future scoring.</span></div><button className="text-button" onClick={() => navigate("Learning")}>See feedback <ArrowUpRight size={14} /></button></div>
            </>
          )}

          {section === "Leads" && <section className="section-page"><PageTitle eyebrow="PROSPECT PIPELINE" title="Lead queue" subtitle="Review discovered businesses, research evidence, and draft outreach." action={canManage ? <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add a business</button> : undefined} /><div className="filter-bar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search businesses" /></div><span className="filter-total">{filteredLeads.length} businesses</span></div><div className="panel"><LeadTable leads={filteredLeads} onOutcome={setOutcome} onDetails={setSelectedLead} canManage={canManage} /></div></section>}

          {section === "Outreach" && <section className="section-page"><PageTitle eyebrow="DRAFTS FOR REVIEW" title="Outreach drafts" subtitle="Bot 1 prepares permission-request drafts for you to review. It never sends or addresses them." /><div className="panel drafts-panel">{leads.filter((lead) => lead.draftBody).length ? leads.filter((lead) => lead.draftBody).map((lead) => <article className="draft-card" key={lead.id}><div className="draft-card-head"><div><span className="draft-label">DRAFT · {lead.serviceFit || "PROJECT FIT"}</span><h3>{lead.companyName}</h3><span className="draft-url">{lead.websiteUrl}</span></div><span className={`score-chip ${scoreTone(lead.fitScore)}`}>{lead.fitScore ?? "—"}<small>/100</small></span></div><p className="draft-subject"><strong>Subject:</strong> {lead.draftSubject}</p><p className="draft-body">{lead.draftBody}</p><div className="draft-footer"><span><ShieldCheck size={14} /> Not sent</span><button className="button button-outline" onClick={() => void navigator.clipboard.writeText(`Subject: ${lead.draftSubject}\n\n${lead.draftBody}`)}>Copy draft <Check size={14} /></button></div></article>) : <EmptyState icon={FileText} title="No drafts yet" body="Run Find & research leads to discover businesses and prepare permission requests for your review." action={canManage ? <button className="button button-primary" onClick={() => void runResearch()}><Sparkles size={15} /> Find & research</button> : undefined} />}</div></section>}

          {section === "Learning" && <section className="section-page"><PageTitle eyebrow="FEEDBACK LOOP" title="What the bot is learning" subtitle="Your corrections and outcomes help improve the next scores. The bot does not change its goals or permissions." /><div className="learning-overview-grid"><div className="panel learning-stat"><div className="learning-stat-icon blue"><Activity size={18} /></div><span>Recorded outcomes</span><strong>{leads.filter((lead) => lead.outcome).length}</strong><p>Lead decisions saved</p></div><div className="panel learning-stat"><div className="learning-stat-icon green"><BadgeCheck size={18} /></div><span>Positive signals</span><strong>{leads.filter((lead) => ["replied", "booked", "won"].includes(lead.outcome ?? "")).length}</strong><p>Replies, calls, or wins</p></div><div className="panel learning-stat"><div className="learning-stat-icon orange"><ArrowDownLeft size={18} /></div><span>Corrections</span><strong>{leads.filter((lead) => ["poor_fit", "not_interested"].includes(lead.outcome ?? "")).length}</strong><p>Signals to avoid similar leads</p></div></div><div className="panel learning-explainer"><div className="learning-explainer-icon"><Sparkles size={19} /></div><div><h2>Evidence first, improvement over time</h2><p>Each lead stores the bot&apos;s score, reasons, confidence, and the outcome you record. Future runs can use your reviewed history as context. Changes to the scoring rules remain visible in Settings.</p><div className="learning-steps"><span><i>01</i> Bot predicts fit</span><ArrowUpRight size={13} /><span><i>02</i> You record outcome</span><ArrowUpRight size={13} /><span><i>03</i> Next run uses feedback</span></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Recent feedback</h2><p>Review your decisions and the lead behind each one.</p></div></div>{leads.filter((lead) => lead.outcome).length ? <div className="feedback-list">{leads.filter((lead) => lead.outcome).slice(0, 8).map((lead) => <div className="feedback-row" key={lead.id}><span className={`feedback-marker ${lead.outcome}`}><Check size={13} /></span><div><strong>{lead.companyName}</strong><span>{lead.outcome?.replaceAll("_", " ")} · {shortDate(lead.createdAt)}</span></div><span className={`score-chip ${scoreTone(lead.fitScore)}`}>{lead.fitScore ?? "—"}</span></div>)}</div> : <EmptyState icon={Activity} title="No feedback recorded" body="Use the outcome menu on a researched lead to start building a useful feedback history." />}</div></section>}

          {section === "Settings" && <SettingsPage settings={settings} updateSetting={updateSetting} busy={busy} canManage={canManage} email={email} members={members} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteUrl={inviteUrl} onInvite={inviteMember} inviteBusy={inviteBusy} onRemoveMember={removeMember} />}
        </main>
        <footer className="app-footer"><span>BOT STUDIO · PROSPECTING</span><span>Invite-only data · {connected ? "Saved to Supabase" : "Connecting…"}</span></footer>
      </div>

      {showAdd && <Modal title="Add a business to research" close={() => setShowAdd(false)}><p className="modal-intro">Use a business website you found from a permitted source. Bot 1 will inspect that site only.</p><form className="form-stack" onSubmit={addLead}><label>Business name<input name="company" placeholder="e.g. Greenhouse Café" required /></label><label>Business website<input name="website" type="url" placeholder="https://business.co.za" required /></label><label>Location <span className="optional">Optional</span><input name="region" placeholder="e.g. Midrand" /></label><div className="notice-inline"><ShieldCheck size={15} /><span>The public page text and your targeting rules are sent to OpenAI for analysis. No contact details are collected. No LinkedIn scraping or automatic outreach.</span></div><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Add to queue</button></div></form></Modal>}
      {showSettings && <Modal title="Workspace settings" close={() => setShowSettings(false)} wide><SettingsPage settings={settings} updateSetting={updateSetting} busy={busy} canManage={canManage} email={email} members={members} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteUrl={inviteUrl} onInvite={inviteMember} inviteBusy={inviteBusy} onRemoveMember={removeMember} /></Modal>}
      {selectedLead && <LeadDetails lead={selectedLead} close={() => setSelectedLead(null)} onDelete={deleteLead} canManage={canManage} />}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, foot, accent }: { icon: typeof BriefcaseBusiness; label: string; value: string; foot: string; accent: string }) {
  return <div className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={17} strokeWidth={2} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-foot">{foot}</span></div>;
}

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</div><h1>{title}<span className="heading-period">.</span></h1><p>{subtitle}</p></div>{action}</div>;
}

function LeadTable({ leads, onOutcome, onDetails, canManage }: { leads: Lead[]; onOutcome: (lead: Lead, outcome: string) => void; onDetails: (lead: Lead) => void; canManage: boolean }) {
  if (!leads.length) return <div className="empty-table"><p>No matching businesses.</p></div>;
  return <div className="table-wrap"><table className="lead-table"><thead><tr><th>BUSINESS</th><th>FIT</th><th>PROJECT MATCH</th><th>STATUS</th><th>OUTCOME</th><th></th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><div className="company-cell"><span className="company-avatar">{lead.companyName.slice(0, 1).toUpperCase()}</span><div><strong>{lead.companyName}</strong><span>{lead.region || new URL(lead.websiteUrl).hostname}</span></div></div></td><td><span className={`score-chip ${scoreTone(lead.fitScore)}`}>{lead.fitScore === null ? "—" : lead.fitScore}<small>{lead.fitScore === null ? "" : "/100"}</small></span></td><td><span className="fit-label">{lead.serviceFit || "Awaiting research"}</span><span className="fit-note">{lead.confidence || ""}</span></td><td><span className={`status-label status-${lead.status}`}>{lead.status.replaceAll("_", " ")}</span></td><td>{canManage ? <select aria-label={`Record outcome for ${lead.companyName}`} value={lead.outcome || ""} onChange={(event) => event.target.value && onOutcome(lead, event.target.value)}><option value="">Record outcome</option><option value="good_fit">Good fit</option><option value="poor_fit">Poor fit</option><option value="replied">Replied</option><option value="not_interested">Not interested</option><option value="booked">Call booked</option><option value="won">Won</option><option value="lost">Lost</option></select> : <span className="fit-note">{lead.outcome?.replaceAll("_", " ") || "Read only"}</span>}</td><td><button className="icon-button mini" title="View evidence and score details" aria-label={`View ${lead.companyName} research details`} onClick={() => onDetails(lead)}><MoreHorizontal size={15} /></button></td></tr>)}</tbody></table></div>;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={20} /></div><strong>{title}</strong><p>{body}</p>{action}</div>;
}

function Modal({ title, close, children, wide }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={close}><X size={17} /></button></div>{children}</section></div>;
}

function LeadDetails({ lead, close, onDelete, canManage }: { lead: Lead; close: () => void; onDelete: (lead: Lead) => Promise<void>; canManage: boolean }) {
  let evidence: string[] = [];
  if (Array.isArray(lead.evidence)) evidence = lead.evidence;
  else if (typeof lead.evidence === "string") {
    try { evidence = JSON.parse(lead.evidence) as string[]; } catch { evidence = [lead.evidence]; }
  }
  return <Modal title="Research notes" close={close} wide><div className="lead-details-head"><div><span className="draft-label">BUSINESS REVIEW</span><h3>{lead.companyName}</h3><a href={lead.websiteUrl} target="_blank" rel="noreferrer">{lead.websiteUrl}<ArrowUpRight size={12} /></a>{lead.discoverySourceUrl && <a className="source-link" href={lead.discoverySourceUrl} target="_blank" rel="noreferrer">Discovery source <ArrowUpRight size={12} /></a>}</div><span className={`score-chip ${scoreTone(lead.fitScore)}`}>{lead.fitScore ?? "—"}<small>/100</small></span></div><div className="detail-summary"><strong>Summary</strong><p>{lead.summary || "This business has not been researched yet."}</p></div><div className="evidence-box"><strong>Visible evidence</strong>{evidence.length ? <ul>{evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>No website evidence saved yet.</p>}</div><div className="unknown-facts"><div><span>Budget</span><strong>Unknown</strong></div><div><span>Timeline</span><strong>Unknown</strong></div><div><span>Confidence</span><strong>{lead.confidence || "Not assessed"}</strong></div></div><div className="detail-disclaimer"><ShieldCheck size={14} /> Score reflects visible website fit only. It is not a judgment of the owner&apos;s value or ability to pay.</div><div className="detail-actions">{canManage ? <button className="button button-outline delete-button" onClick={() => void onDelete(lead)}>Remove business</button> : <span />}<button className="button button-primary" onClick={close}>Done</button></div></Modal>;
}

function SettingsPage({ settings, updateSetting, busy, compact, canManage, email, members, inviteEmail, setInviteEmail, inviteUrl, onInvite, inviteBusy, onRemoveMember }: {
  settings: Settings;
  updateSetting: (key: keyof Settings, value: string | number | boolean) => Promise<void>;
  busy: boolean;
  compact?: boolean;
  canManage: boolean;
  email: string;
  members: Array<{ email: string; role: string; created_at: string }>;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteUrl: string;
  onInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  inviteBusy: boolean;
  onRemoveMember: (email: string) => Promise<void>;
}) {
  return <section className={`section-page ${compact ? "settings-compact" : ""}`}>
    <PageTitle eyebrow="BOT CONFIGURATION" title="Settings" subtitle="Manage targeting, team access, and your browser sign-in." />
    <div className="settings-layout">
      <div className="panel settings-panel">
        <div className="settings-heading"><div className="settings-heading-icon"><BriefcaseBusiness size={17} /></div><div><h2>Brand identity</h2><p>These details shape research and draft outreach.</p></div></div>
        <div className="settings-fields">
          <SettingField key={settings.brandName} label="Business name" value={settings.brandName} placeholder="Your new brand name" onSave={(value) => updateSetting("brandName", value)} disabled={!canManage} />
          <SettingField key={settings.brandDomain} label="Website or domain" value={settings.brandDomain} placeholder="https://yourbrand.co.za" onSave={(value) => updateSetting("brandDomain", value)} disabled={!canManage} />
          <SettingField key={settings.targetMarket} label="Target market" value={settings.targetMarket} placeholder="Restaurants, ecommerce, local services" onSave={(value) => updateSetting("targetMarket", value)} disabled={!canManage} />
          <SettingField key={settings.targetLocations} label="Target locations" value={settings.targetLocations} placeholder="Midrand, Sandton, Johannesburg" onSave={(value) => updateSetting("targetLocations", value)} disabled={!canManage} />
          <SettingField key={settings.services} label="Services you offer" value={settings.services} placeholder="Websites, ecommerce, automation" onSave={(value) => updateSetting("services", value)} disabled={!canManage} />
        </div>
      </div>
      <div className="panel settings-panel">
        <div className="settings-heading"><div className="settings-heading-icon violet"><Sparkles size={17} /></div><div><h2>Research engine</h2><p>Cloud model connection and batch size.</p></div></div>
        <div className="engine-status"><span>OpenAI connection</span><strong>{settings.apiConfigured ? <><i className="green-dot" /> Connected</> : "Not connected"}</strong><p>The API key is stored as a server secret. It is never sent to your browser.</p></div>
        <div className="settings-divider" />
        <div className="limit-row"><div><strong>Businesses per run</strong><span>Search and research a small batch.</span></div><select disabled={busy || !canManage} value={settings.researchLimit} onChange={(event) => void updateSetting("researchLimit", Number(event.target.value))}><option value={1}>1 business</option><option value={3}>3 businesses</option><option value={5}>5 businesses</option></select></div>
      </div>
      <BrowserAccessPanel email={email} />
      {canManage && <TeamAccessPanel members={members} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteUrl={inviteUrl} onInvite={onInvite} inviteBusy={inviteBusy} onRemoveMember={onRemoveMember} />}
      <div className="panel settings-panel full-settings">
        <div className="settings-heading"><div className="settings-heading-icon orange"><ShieldCheck size={17} /></div><div><h2>Automation boundaries</h2><p>What Bot 1 can do in this version.</p></div></div>
        <div className="setting-toggle-row"><div><strong>Review before outreach</strong><span>Bot 1 writes drafts. It does not send email or messages.</span></div><span className="toggle-on"><Check size={13} /> Always on</span></div>
        <div className="setting-toggle-row"><div><strong>Public business websites</strong><span>Searches public sources and reviews business websites only; it does not collect personal contact details.</span></div><span className="toggle-on"><Check size={13} /> Enabled</span></div>
        <div className="settings-help"><Clock3 size={16} /><p>You can start a batch from the dashboard while your computer is off. Recurring runs need a cloud scheduler, which is not connected yet.</p></div>
      </div>
    </div>
  </section>;
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
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, currentPassword }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save your browser password.");
      formElement.reset();
      setMessage("Password saved. You can now sign in from any browser using your email.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your browser password.");
    } finally { setBusy(false); }
  }
  return <div className="panel settings-panel">
    <div className="settings-heading"><div className="settings-heading-icon orange"><ShieldCheck size={17} /></div><div><h2>Browser sign-in</h2><p>Set a password to use the dashboard outside ChatGPT.</p></div></div>
    <form className="password-form" onSubmit={submit}>
      <label>Email<input value={email} readOnly /></label>
      <label>Current password <span className="optional">Only needed when changing an existing password</span><input name="currentPassword" type="password" autoComplete="current-password" /></label>
      <label>New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><span>At least 12 characters.</span></label>
      {message && <p className="auth-message" role="status">{message}</p>}
      <button className="button button-outline" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />} Save browser password</button>
    </form>
  </div>;
}

function TeamAccessPanel({ members, inviteEmail, setInviteEmail, inviteUrl, onInvite, inviteBusy, onRemoveMember }: {
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
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  }
  return <div className="panel settings-panel full-settings team-panel">
    <div className="settings-heading"><div className="settings-heading-icon"><UserPlus size={17} /></div><div><h2>Team access</h2><p>Invite your partner as a read-only viewer. You keep owner controls.</p></div></div>
    <form className="invite-form" onSubmit={onInvite}><label>Partner email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="partner@example.com" required /></label><button className="button button-primary" disabled={inviteBusy}>{inviteBusy ? <LoaderCircle size={15} className="spin" /> : <UserPlus size={15} />} Create invite link</button></form>
    {inviteUrl && <div className="invite-link-box"><div><strong>One-time setup link</strong><span>Copy and send this link yourself. It expires in 7 days and can be used once to create a password.</span></div><input aria-label="Partner invitation link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><button className="button button-outline" onClick={() => void copyInvite()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy link"}</button></div>}
    <div className="member-list">{members.map((member) => <div className="member-row" key={member.email}><div className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</div><div><strong>{member.email}</strong><span>{member.role === "owner" ? "Owner" : "Viewer"}</span></div>{member.role === "viewer" && <button className="icon-button mini" title={`Remove ${member.email}`} aria-label={`Remove ${member.email}`} onClick={() => void onRemoveMember(member.email)}><Trash2 size={15} /></button>}</div>)}</div>
  </div>;
}

function SettingField({ label, value, placeholder, onSave, disabled }: { label: string; value: string; placeholder: string; onSave: (value: string) => Promise<void>; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSave(draft.trim()); setSaved(true); window.setTimeout(() => setSaved(false), 1400); }
  return <form className="setting-field" onSubmit={submit}><label>{label}<input disabled={disabled} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} /></label>{!disabled && <button className={`save-field ${saved ? "saved" : ""}`} type="submit" aria-label={`Save ${label}`}>{saved ? <Check size={14} /> : <ArrowUpRight size={14} />}</button>}</form>;
}
