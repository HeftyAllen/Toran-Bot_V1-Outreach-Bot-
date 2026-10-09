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

## Evidence and qualification

Discovery saves sourced candidates. Research determines whether they qualify.
The requested count is a qualified prospect target; rejected candidates do not
fill it. The worker resumes discovery while its search-round and spending
limits permit. A run can finish with fewer qualified prospects. Costs include
research of rejected candidates as well as successful leads.

- Launch: a fetched placeholder/under-construction site, or fixed desktop-width
  HTML without mobile viewport metadata. If an official site is unconfirmed,
  a separate search of the business name and city checks for one. A matching
  business listing plus no official site found can qualify a potential launch;
  the bot never treats a missing result as proof no website exists.
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
