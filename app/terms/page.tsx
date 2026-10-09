import Link from "next/link";
export default function Terms() {
  return (
    <main className="public-policy">
      <h1>Bot 1 terms of use</h1>
      <p>
        This private Toran workspace researches public business information and
        prepares outreach. The owner controls campaign locations, budgets,
        integrations and permissions. Search results, website assessments and
        spending estimates need review; they do not guarantee demand, absence of
        a website or provider invoice totals.
      </p>
      <p>
        Use only contacts you are permitted to message. Record recipient
        permission before sending and respect opt-outs. Account owners are
        responsible for their provider accounts, message content and use of the
        service.
      </p>
      <p>
        Live Google Maps results are provided by Google and remain separate from
        saved leads and exports. Your use of those results is subject to the{" "}
        <a href="https://maps.google.com/help/terms_maps/">
          Google Maps terms of service
        </a>
        . Do not copy or export those results through this dashboard.
      </p>
      <p>
        <Link href="/privacy">Privacy information</Link> ·{" "}
        <Link href="/">Return to dashboard</Link>
      </p>
    </main>
  );
}
