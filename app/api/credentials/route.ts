export async function POST() {
  return Response.json(
    {
      error: "The OpenAI key is managed as a server secret for this workspace.",
    },
    { status: 410 },
  );
}
