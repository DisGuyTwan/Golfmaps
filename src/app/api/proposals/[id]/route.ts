import { kv, noStorage } from "@/lib/kv-server";
import { readProposal } from "@/lib/proposal-store-server";

/** One proposal by its link's id (public: the id is the secret), with whether it's been accepted. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = kv();
  if (!db) return noStorage();
  const found = await readProposal(db, (await params).id);
  if (!found) return Response.json({ error: "No such proposal" }, { status: 404 });
  return Response.json({ data: found.data, accepted: found.meta.accepted }, { headers: { "Cache-Control": "no-store" } });
}
