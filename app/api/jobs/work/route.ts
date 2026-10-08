import { env } from "@bot1/runtime";
import { processNextJob } from "../../../../lib/campaigns";
import { requireApiUser } from "../../../../lib/server-auth";
export const maxDuration = 90;
function equalSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function POST(request: Request) {
  const expected =
    typeof env.WORKER_SECRET === "string" ? env.WORKER_SECRET : "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected || !equalSecret(expected, supplied)) {
    const { user, member, response } = await requireApiUser();
    if (!user || !member) return response;
    if (member.role !== "owner")
      return Response.json(
        { error: "Owner access required." },
        { status: 403 },
      );
  }
  try {
    return Response.json(await processNextJob(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Worker could not reach the database." },
      { status: 503 },
    );
  }
}
