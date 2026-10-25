import { sendEmail } from "@/lib/email-server";
import { kv, noStorage } from "@/lib/kv-server";
import { stillValid } from "@/lib/proposal";
import { PROPOSAL_COPY } from "@/lib/proposal-copy";
import { readProposal } from "@/lib/proposal-store-server";

/**
 * What the client does with a proposal, from its page: { type: "open" }
 * when it's opened (the first open emails the rep), { type: "section",
 * section } when a part is read, { type: "accept", option, name } when an
 * option is accepted (once, while the prices hold; the rep is emailed).
 */
const SECTIONS = new Set(["property", "options", "assumptions", "accept"]);

/** Today in Quebec, for the validity date. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = kv();
  if (!db) return noStorage();
  const id = (await params).id;
  const found = await readProposal(db, id);
  if (!found) return Response.json({ error: "No such proposal" }, { status: 404 });
  const { data, meta } = found;
  const body = (await request.json().catch(() => null)) as { type?: string; section?: string; option?: string; name?: string } | null;
  const now = new Date().toISOString();
  const url = new URL(`/p/${id}`, request.url).toString();
  const copy = PROPOSAL_COPY[data.lang];
  const log = (event: object) => [
    ["LPUSH", `pe:${id}`, JSON.stringify({ ...event, at: now })],
    ["LTRIM", `pe:${id}`, 0, 199],
  ];

  if (body?.type === "open") {
    await db.pipeline([
      ["HINCRBY", `pm:${id}`, "opens", 1],
      ["HSETNX", `pm:${id}`, "firstOpen", now],
      ["HSET", `pm:${id}`, "lastOpen", now],
      ...log({ type: "open" }),
    ]);
    if (meta.opens === 0)
      await sendEmail({ to: data.rep.email, subject: copy.openedSubject(data.client.name), text: copy.openedText(data.client.name, url) });
    return new Response(null, { status: 204 });
  }

  if (body?.type === "section" && body.section && SECTIONS.has(body.section)) {
    await db.cmd("HINCRBY", `pm:${id}`, `sec:${body.section}`, 1);
    return new Response(null, { status: 204 });
  }

  if (body?.type === "accept") {
    const name = (body.name ?? "").trim().slice(0, 120);
    const option = data.options.find((o) => o.id === body.option);
    if (!name || !option) return Response.json({ error: "A name and an option are needed" }, { status: 400 });
    if (meta.accepted) return Response.json({ accepted: meta.accepted }, { status: 409 });
    if (!stillValid(data, today())) return Response.json({ error: "Expired" }, { status: 410 });
    const accepted = { name, option: option.id, at: now };
    // Only the first acceptance counts, even if two arrive at once.
    const set = await db.cmd<number>("HSETNX", `pm:${id}`, "accepted", JSON.stringify(accepted));
    if (!set) return Response.json({ error: "Already accepted" }, { status: 409 });
    await db.pipeline(log({ type: "accept", option: option.id, name }));
    await sendEmail({
      to: data.rep.email,
      subject: copy.acceptedSubject(data.client.name, option.id),
      text: copy.acceptedText(data.client.name, name, option.id, url),
      ...(data.client.email && { replyTo: data.client.email }),
    });
    return Response.json({ accepted });
  }

  return Response.json({ error: "Unknown event" }, { status: 400 });
}
