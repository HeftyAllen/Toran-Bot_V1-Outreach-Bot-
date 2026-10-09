# Toran customer prospecting

This bot finds customers for the Launch, Sell and Scale services described at
https://toran.co.za/ (reviewed 9 October 2026). It evaluates services a business
could use, rather than rewarding the business for selling those same services.

## Campaign focus

- **Weak/missing sites + Sell/Scale opportunities** prioritizes website gaps,
  and permits specific supported ecommerce or automation opportunities.
- **Weak or missing websites only** restricts qualification to Launch.
- **Automation opportunities only** requires a relevant public manual workflow.

Web designers, marketing agencies and ecommerce-development vendors are
excluded from the customer list. Ecommerce targets are merchants, not vendors
who build ecommerce software.
Agency exclusions require support from the sourced category or page title.
An unsupported provider flag stays in review. The scoring stage uses
`gpt-4.1-mini`, with a conservative spending reservation and the same output
token limit. It receives the business identity and current pages, not an earlier
opportunity assessment as part of the business description.

## Evidence and qualification

Discovery saves sourced candidates. Research determines whether they qualify.
The requested count is a qualified prospect target; rejected candidates do not
fill it. The worker resumes discovery while its search-round and spending
limits permit. A run can finish with fewer qualified prospects. Costs include
research of rejected candidates as well as successful leads.

- Launch: a fetched placeholder/under-construction site, or fixed desktop-width
  HTML without mobile viewport metadata. If an official site is unconfirmed,
  a separate broad search of the business/brand name checks for one, including
  parent-brand websites and branch locators. An individual business listing
  identified by its title/main heading plus no official site found can qualify a potential launch;
  the bot never treats a missing result as proof no website exists.
  A category directory that merely mentions the name stays in review, and
  website status remains unknown until its business page can be verified.
  If a result supplies an unverified parent homepage, an exact business-name
  domain in retrieved sources can establish the actual branch URL. Directory
  profiles, name-containing paths and unrelated domain suffixes cannot do this.
- Sell: an exact public instruction for manual orders/payments supports a
  potential checkout/order-handling opportunity.
- Scale: an exact public manual order, booking, appointment or quotation
  instruction supports a potential workflow improvement. A generic contact
  form/phone number does not establish an automation gap. Internal systems
  and the owner's interest still need confirmation.

Evidence excerpts must match text from an actually fetched source URL. HTML
screening cannot establish subjective visual quality, page speed, broken
interactive checkout, or absence of hidden CRM/automation. Ambiguous cases
remain **Needs review**. A good site with no supported gap is **Ruled out**.
Feedback calibration cannot turn an unsupported case into a qualified prospect.
Research and confirmed contacts are retained, but outreach drafts are prepared
only for qualified opportunities. WhatsApp consent/suppression rules still apply.

The Overview and Leads default view show qualified prospects. Use the Leads
filter to inspect review/ruled-out candidates and their sources. Existing
research from before this qualification update is marked for fresh assessment;
its old scores and drafts are not presented as qualified recommendations.

## Deployment

Apply the `toran_opportunity_qualification` SQL migration before deploying the
matching application code. It adds the opportunity assessment to leads, a
qualified counter to runs, and the reviewed lead state. Existing server-only
database policies and permissions remain in force. The migration updates only
placeholder workspace brand/service/location defaults.

Also apply `qualified_worker_claim` before deploying the matching worker. It
retires the original job-claim RPC and gives the updated worker a separate claim
RPC. Older deployments and open browser tabs cannot process campaigns with the
previous qualification rules. The existing Cron job and Vault entries stay in
place; no second scheduler is needed.

## Smart campaigns (v6)

The campaign builder accepts any business type, not only restaurants and
online stores. Describe the request in ordinary language, then **Interpret
request** to get an editable preview. Interpretation is charged to the monthly
API budget and never queues a run or enables sending. Choose **Review plan**,
check the country, industries, areas, target and USD spending ceiling, then
**Start Bot 1**. Web discovery rotates each industry/area combination within
the selected country. It does not implement an exact geographic radius.

Choose whether the target counts **businesses collected and screened** or
**qualified prospects**. Smart campaigns allow 1–500 businesses and a maximum
500-candidate scan ceiling. The worker may return fewer when search rounds,
available sources or budgets run out. Existing campaigns keep their original
qualification-target behavior. Counters show raw candidates, sourced candidates
saved, exclusions, duplicates, screened businesses and qualified opportunities.
Overview shows the latest campaign's results, including ruled-out candidates;
its Leads filter lets you inspect those results separately from older prospects.

The selected country is distinct from a phone calling code. Country-aware
parsing handles national trunk prefixes and preserves explicit international
numbers. A public number does not prove WhatsApp availability or consent.

Website filters support **no official site found**, **existing weak websites**,
**either**, or **any website with opportunity evidence**. Supported Sell/Scale
opportunities require the separate checkbox. Agency and user exclusions apply
to discovery; a sourced chain/franchise statement also excludes the business
when the chain filter is selected. A suspected chain classification stays in
review. Missing-only campaigns skip paid website analysis for businesses with
an established official site when automation is disabled.

Optional mobile checks call Google's PageSpeed Insights API on the verified
public website. The saved Lighthouse lab result includes performance,
accessibility, loading measurements, selected issues and a screenshot when
Google supplies one. A performance score below 40 together with LCP above
4 seconds supports a performance opportunity; this is one simulated test, not
proof of subjective visual quality. An unavailable lab test is recorded as
unavailable and does not itself create a website-gap lead. Set the optional
server variable `PAGESPEED_API_KEY` if a quota key is needed. Tests are split
into separate worker ticks to preserve progress.

Spending aggregates the full usage ledger for the latest 20 campaigns and
shows collected, screened, qualified and email-accepted counts alongside tracked
cost, held reservations and cost per qualified prospect. Google and message
costs use configurable conservative estimates; free allowances and invoices can
differ. Unconfirmed costs stay reserved until reconciled.

Learning uses the latest owner outcome per business. Five unique matching
industry/service examples can inform discovery priorities within the requested
industry and area. Existing score calibration remains bounded to 10 points and
cannot qualify an unsupported opportunity. This does not retrain an AI model or
change the owner's chosen geography, filters or consent requirements.

Apply `smart_campaigns_and_integrations` before deploying v6. The existing
Cron job and Vault secrets are preserved. Its old qualified-worker claim RPC
cannot claim v3 plans; v6 uses the smart-worker claim RPC.
