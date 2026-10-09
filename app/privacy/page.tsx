import Link from "next/link";
export default function Privacy() {
  return (
    <main className="public-policy">
      <h1>Bot 1 privacy information</h1>
      <p>
        The Toran workspace stores member email addresses, password hashes,
        independently sourced business details, source links, research, outreach
        drafts, consent records, message results and usage records in its
        Supabase project. Authorized workspace members can view dashboard
        records; owner permissions control changes. Provider credentials are
        encrypted on the server.
      </p>
      <p>
        Campaign descriptions and independently sourced pages are sent to OpenAI
        for interpretation and research. When connected, Google receives live
        listing queries, the selected area and optional coordinates. Google
        listing details are displayed temporarily and are not saved as leads or
        sent to the research model. Google processes information under its{" "}
        <a href="https://policies.google.com/privacy">privacy policy</a>.
      </p>
      <p>
        When the owner sends a message, the connected email or WhatsApp provider
        receives the recipient and message. Signed unsubscribe links suppress
        further outreach. Cloud hosting and providers may retain operational
        logs under their own settings and policies. The dashboard uses a session
        cookie for sign-in.
      </p>
      <p>
        Contact the Toran workspace owner through{" "}
        <a href="https://toran.co.za/">toran.co.za</a> for questions or record
        removal. Deleting a lead preserves its spending and feedback audit
        history.
      </p>
      <p>
        <Link href="/terms">Terms of use</Link> ·{" "}
        <Link href="/">Return to dashboard</Link>
      </p>
    </main>
  );
}
