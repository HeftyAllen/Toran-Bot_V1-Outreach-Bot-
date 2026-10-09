// Loaded only by the standalone smoke test through NODE_OPTIONS. No real AI
// requests or website requests are needed to exercise discovery persistence.
import assert from 'node:assert/strict';
const originalFetch = globalThis.fetch;
let searches = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== 'https://api.openai.com/v1/responses') return originalFetch(input, init);
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.max_tool_calls, 1);
  assert.equal(body.tools[0].type, 'web_search');
  searches++;
  const sources = [
    'https://directory.example.com/sandton/restaurant-one/?utm_source=search',
    'https://restaurant-two.example.com/about/',
  ];
  const businesses = searches < 3 ? [] : [
    { companyName: 'Synthetic directory restaurant', region: 'Sandton, South Africa', category: 'Restaurant', sourceUrl: 'https://directory.example.com/sandton/restaurant-one', websiteUrl: 'https://unconfirmed.example.com/' },
    { companyName: 'Synthetic official restaurant', region: 'Sandton, South Africa', category: 'Restaurant', sourceUrl: 'https://restaurant-two.example.com/about', websiteUrl: 'https://restaurant-two.example.com/' },
  ];
  return Response.json({
    id: `synthetic-response-${searches}`, status: 'completed',
    usage: { input_tokens: 1000, output_tokens: 300 },
    output: [
      { type: 'web_search_call', action: { type: 'search', sources: sources.map(url => ({ type: 'url', url })) } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ businesses }), annotations: [] }] },
    ],
  });
};
