import { forbidden, isTeam, kv, newId, noStorage } from "@/lib/kv-server";
import type { ProposalData } from "@/lib/proposal";
import { listProposals } from "@/lib/proposal-store-server";

/**
 * Proposals (team key): POST saves one (the snapshot the rep sends) and
 * gives its client link; GET lists the latest with what clients did with
 * them (opens, sections read, acceptance).
 */
export const maxDuration = 15;
/** Largest proposal kept (bytes): a few options, the assumptions and notes. */
const MAX_BYTES = 200_000;

function isProposal(v: unknown): v is ProposalData {
  const p = v as ProposalData;
  return (
    !!p &&
    p.version === 1 &&
    (p.lang === "en" || p.lang === "fr") &&
    typeof p.validUntil === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.validUntil) &&
    !!p.client &&
    typeof p.client.name === "string" &&
    !!p.rep &&
    typeof p.rep.email === "string" &&
    Array.isArray(p.options) &&
    p.options.length > 0 &&
    p.options.length <= 6
  );
}

export async function POST(request: Request) {
  if (!isTeam(request)) return forbidden();
  const db = kv();
  if (!db) return noStorage();
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Proposal too large" }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return Response.json({ error: "Not JSON" }, { status: 400 });
  }
  if (!isProposal(data)) return Response.json({ error: "Not a proposal" }, { status: 400 });
  const id = newId();
  const proposal: ProposalData = { ...data, createdAt: new Date().toISOString() };
  // Kept a year past its validity.
  const ttl = Math.max(86_400, Math.round((Date.parse(`${proposal.validUntil}T23:59:59Z`) - Date.now()) / 1000) + 365 * 86_400);
  await db.pipeline([
    ["SET", `p:${id}`, JSON.stringify(proposal), "EX", ttl],
    ["ZADD", "proposals", Date.now(), id],
  ]);
  const url = new URL(`/p/${id}`, request.url).toString();
  return Response.json({ id, url });
}

export async function GET(request: Request) {
  if (!isTeam(request)) return forbidden();
  const db = kv();
  if (!db) return noStorage();
  const proposals = await listProposals(db);
  // The list needs only the headline of each.
  return Response.json(
    {
      proposals: proposals.map(({ id, data, meta }) => ({
        id,
        createdAt: data.createdAt,
        validUntil: data.validUntil,
        client: data.client.name,
        rep: data.rep.name,
        property: data.property.name,
        options: data.options.length,
        meta,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
