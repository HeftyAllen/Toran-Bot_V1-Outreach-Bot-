"use client";
import { useState } from "react";
import { Sparkles, Globe2, ArrowRight, LoaderCircle } from "lucide-react";
import { countries, countryInfo, industryExamples } from "../lib/search-config";
type Settings = {
  targetMarket: string;
  targetLocations: string;
  researchLimit: number;
  runBudgetUsd: number;
  searchCountry?: string;
  apiConfigured: boolean;
  workerConfigured: boolean;
};
export default function CampaignBuilder({
  settings,
  onStart,
  disabled,
  emailConnected,
}: {
  settings: Settings;
  onStart: (config: Record<string, unknown>) => Promise<void>;
  disabled: boolean;
  emailConnected: boolean;
}) {
  const [description, setDescription] = useState(""),
    [interpreting, setInterpreting] = useState(false),
    [message, setMessage] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [preview, setPreview] = useState(false);
  const [country, setCountry] = useState(settings.searchCountry ?? "ZA"),
    [types, setTypes] = useState(
      settings.targetMarket.replace(
        /^Restaurants and ecommerce businesses$/i,
        "Restaurants, ecommerce merchants",
      ),
    ),
    [areas, setAreas] = useState(
      settings.targetLocations
        .split(/[,;\n]/)
        .filter(
          (x) =>
            !countries.some(
              (c) => c.name.toLowerCase() === x.trim().toLowerCase(),
            ),
        )
        .join(", "),
    );
  const [count, setCount] = useState(String(settings.researchLimit)),
    [budget, setBudget] = useState(String(settings.runBudgetUsd)),
    [targetMode, setTargetMode] = useState("candidates"),
    [scanLimit, setScanLimit] = useState("100");
  const [filter, setFilter] = useState("missing_or_weak"),
    [automation, setAutomation] = useState(false),
    [chains, setChains] = useState(true),
    [exclusions, setExclusions] = useState(""),
    [audit, setAudit] = useState(true),
    [mode, setMode] = useState("discover"),
    [outreach, setOutreach] = useState("drafts"),
    [sendLimit, setSendLimit] = useState("5"),
    [confirm, setConfirm] = useState(false);
  const info = countryInfo(country);
  const plan = () => ({
    planVersion: 3,
    countryCode: country,
    businessTypes: types,
    areas,
    market: types,
    locations: areas,
    count: Number(count),
    budgetUsd: Number(budget),
    targetMode,
    scanLimit: Math.max(Number(scanLimit), Number(count)),
    websiteFilter: filter,
    includeAutomation: automation,
    excludeChains: chains,
    exclusions,
    auditWebsites: audit,
    mode,
    outreachMode: outreach,
    sendLimit: Number(sendLimit),
    confirmSending: confirm,
  });
  async function interpret() {
    setInterpreting(true);
    setMessage("");
    setPreview(false);
    try {
      const response = await fetch("/api/campaigns/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, countryCode: country }),
      });
      const data = (await response.json()) as {
        error?: string;
        plan: {
          businessTypes: string[];
          areas: string[];
          countryCode: string;
          count: number;
          budgetUsd: number;
          targetMode: string;
          scanLimit: number;
          websiteFilter: string;
          includeAutomation: boolean;
          excludeChains: boolean;
          exclusions: string[];
        };
        warnings: string[];
        message: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not interpret the request.");
      const p = data.plan;
      setTypes(p.businessTypes.join(", "));
      setAreas(p.areas.join(", "));
      setCountry(p.countryCode);
      setCount(String(p.count));
      setBudget(String(p.budgetUsd));
      setTargetMode(p.targetMode);
      setScanLimit(String(p.scanLimit));
      setFilter(p.websiteFilter);
      setAutomation(p.includeAutomation);
      setChains(p.excludeChains);
      setExclusions(p.exclusions.join(", "));
      setOutreach("drafts");
      setConfirm(false);
      setWarnings(data.warnings);
      setMessage(data.message);
      setPreview(true);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not interpret the search.",
      );
    } finally {
      setInterpreting(false);
    }
  }
  return (
    <form
      className="panel campaign-form bot-form smart-campaign"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!preview) {
          setPreview(true);
          setMessage(
            "Review this search plan, then start your cloud campaign.",
          );
          return;
        }
        await onStart(plan());
      }}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR NEXT CUSTOMERS</span>
          <h2>Tell Bot 1 who to find</h2>
          <p>
            Any industry, a clear location, and an opportunity Toran can help
            with.
          </p>
        </div>
        <span className="soft-count">Runs in the cloud</span>
      </div>
      <div className="natural-search">
        <label htmlFor="search-description">Describe your search</label>
        <textarea
          id="search-description"
          rows={3}
          value={description}
          maxLength={1500}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Find 50 independent salons and plumbers in Nairobi, Kenya, with no website found. Exclude chains. Spend at most $2."
          disabled={disabled || interpreting}
        />
        <div>
          <span>
            AI fills the fields below. Interpretation uses your monthly API
            budget.
          </span>
          <button
            type="button"
            className="button button-outline"
            disabled={
              disabled || interpreting || description.trim().length < 10
            }
            onClick={() => void interpret()}
          >
            {interpreting ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Sparkles size={15} />
            )}{" "}
            Interpret request
          </button>
        </div>
      </div>
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="plan-warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <fieldset
        disabled={disabled || interpreting}
        onChange={() => setPreview(false)}
      >
        <legend>Search settings</legend>
        <div className="campaign-fields">
          <label className="wide-field">
            Business types
            <textarea
              rows={2}
              value={types}
              maxLength={500}
              onChange={(e) => setTypes(e.target.value)}
              placeholder="Salons, plumbers, dentists"
              required
            />
            <small>
              Separate industries with commas. Ecommerce means merchants selling
              products.
            </small>
          </label>
          <label>
            Search country
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setConfirm(false);
              }}
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <small>
              Local phone numbers use +{info?.callingCode}. International
              numbers retain their country.
            </small>
          </label>
          <label className="wide-field">
            Cities, towns or areas
            <textarea
              rows={2}
              value={areas}
              maxLength={500}
              onChange={(e) => setAreas(e.target.value)}
              placeholder="Midrand, Sandton"
              required
            />
            <small>
              Search rotates through each industry and area in {info?.name}.
            </small>
          </label>
          <label>
            Target type
            <select
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value)}
            >
              <option value="candidates">
                Businesses to collect and screen
              </option>
              <option value="qualified">Qualified Toran prospects</option>
            </select>
          </label>
          <label>
            {targetMode === "qualified"
              ? "Qualified prospect target"
              : "Business target"}
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                if (Number(e.target.value) > Number(scanLimit))
                  setScanLimit(e.target.value);
              }}
              required
            />
          </label>
          <label>
            Run spending limit (USD)
            <input
              type="number"
              min={0.05}
              max={100}
              step={0.05}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              required
            />
            <small>A spending ceiling; the target is not guaranteed.</small>
          </label>
          <label>
            Candidate scan limit
            <input
              type="number"
              min={Number(count) || 1}
              max={500}
              value={scanLimit}
              onChange={(e) => setScanLimit(e.target.value)}
              required
            />
            <small>
              Stop screening when this cap or the budget is reached.
            </small>
          </label>
          <label>
            Website opportunity
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="missing_or_weak">Missing or weak websites</option>
              <option value="missing">No official website found</option>
              <option value="weak">Weak websites only</option>
              <option value="any">Any website; evidence still required</option>
            </select>
          </label>
          <label>
            Work to do
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="discover">Discover new businesses</option>
              <option value="queue">Research saved queue</option>
            </select>
          </label>
          <label>
            Exclude these businesses
            <input
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              maxLength={500}
              placeholder="Hotels, car dealerships, specific names"
            />
          </label>
        </div>
        <div className="search-toggles">
          <label>
            <input
              type="checkbox"
              checked={chains}
              onChange={(e) => setChains(e.target.checked)}
            />
            Exclude sourced chains and franchises
          </label>
          <label>
            <input
              type="checkbox"
              checked={automation}
              onChange={(e) => setAutomation(e.target.checked)}
            />
            Include supported ecommerce or automation opportunities
          </label>
          <label>
            <input
              type="checkbox"
              checked={audit}
              onChange={(e) => setAudit(e.target.checked)}
            />
            Run mobile performance and accessibility lab tests
          </label>
        </div>
        <details className="industry-examples">
          <summary>Other industries Toran can help</summary>
          <p>{industryExamples.join(" · ")}</p>
        </details>
        <div className="outreach-choice">
          <label>
            After qualification
            <select
              value={outreach}
              onChange={(e) => {
                setOutreach(e.target.value);
                setConfirm(false);
              }}
            >
              <option value="drafts">Prepare drafts for review</option>
              <option value="email" disabled={!emailConnected}>
                Send consented emails automatically
                {emailConnected ? "" : " — connect email in Settings"}
              </option>
            </select>
          </label>
          {outreach === "email" && (
            <>
              <label>
                Maximum emails for this run
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sendLimit}
                  onChange={(e) => setSendLimit(e.target.value)}
                  required
                />
              </label>
              <label className="confirm-send">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                  required
                />
                I authorise this campaign to send up to {sendLimit} emails to
                qualified contacts with recorded email consent.
              </label>
            </>
          )}
          <p>
            Public contacts are research data. Consent, suppression, daily
            limits and spending are checked again before sending.
          </p>
        </div>
      </fieldset>
      {preview && (
        <div className="search-plan" role="status">
          <Globe2 size={19} />
          <div>
            <strong>
              {count}{" "}
              {targetMode === "qualified"
                ? "qualified prospects"
                : "business candidates"}{" "}
              in {info?.name}
            </strong>
            <p>
              {types} · {areas}
            </p>
            <span>
              {filter.replaceAll("_", " ")} ·{" "}
              {automation
                ? "Automation opportunities included"
                : "Website opportunities"}{" "}
              · Budget ${Number(budget).toFixed(2)} ·{" "}
              {outreach === "email"
                ? `Up to ${sendLimit} consented emails`
                : "Drafts for review"}
            </span>
          </div>
        </div>
      )}
      <div className="campaign-start">
        <p>
          Web research saves independently sourced leads. Use live Google lookup
          below to explore Maps listings.
        </p>
        <button
          className="button button-primary"
          disabled={
            disabled ||
            interpreting ||
            !settings.apiConfigured ||
            !settings.workerConfigured ||
            (outreach === "email" && !confirm)
          }
        >
          <ArrowRight size={16} />
          {preview ? "Start cloud campaign" : "Review search plan"}
        </button>
      </div>
    </form>
  );
}
