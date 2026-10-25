/**
 * Proposals in the database (kv-server.ts): the snapshot sent (`p:<id>`),
 * what the client did with it (`pm:<id>`: opens, first and last open, the
 * sections read, the acceptance), their events (`pe:<id>`, the last 200),
 * and the list by date (`proposals`). Route handlers and the client's page
 * only.
 */
import type { Kv } from "./kv-server";
import type { ProposalData } from "./proposal";

export interface ProposalMeta {
  opens: number;
  firstOpen: string | null;
  lastOpen: string | null;
  /** Times each section was read on the client's page. */
  sections: Record<string, number>;
  accepted: { name: string; option: string; at: string } | null;
}

export interface StoredProposal {
  id: string;
  data: ProposalData;
  meta: ProposalMeta;
}

function metaOf(flat: string[] | null): ProposalMeta {
  const h: Record<string, string> = {};
  for (let i = 0; flat && i + 1 < flat.length; i += 2) h[flat[i]] = flat[i + 1];
  const sections: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) if (k.startsWith("sec:")) sections[k.slice(4)] = Number(v);
  let accepted: ProposalMeta["accepted"] = null;
  try {
    accepted = h.accepted ? JSON.parse(h.accepted) : null;
  } catch {
    accepted = null;
  }
  return { opens: Number(h.opens ?? 0), firstOpen: h.firstOpen ?? null, lastOpen: h.lastOpen ?? null, sections, accepted };
}

export async function readProposal(db: Kv, id: string): Promise<StoredProposal | null> {
  if (!/^[A-Za-z0-9]{8,20}$/.test(id)) return null;
  const [raw, flat] = (await db.pipeline([
    ["GET", `p:${id}`],
    ["HGETALL", `pm:${id}`],
  ])) as [string | null, string[] | null];
  if (!raw) return null;
  try {
    return { id, data: JSON.parse(raw) as ProposalData, meta: metaOf(flat) };
  } catch {
    return null;
  }
}

/** The latest proposals, newest first. */
export async function listProposals(db: Kv, count = 50): Promise<StoredProposal[]> {
  const ids = (await db.cmd<string[]>("ZRANGE", "proposals", 0, count - 1, "REV")) ?? [];
  if (!ids.length) return [];
  const rows = await db.pipeline(ids.flatMap((id) => [["GET", `p:${id}`], ["HGETALL", `pm:${id}`]]));
  return ids.flatMap((id, i) => {
    try {
      const raw = rows[2 * i] as string | null;
      return raw ? [{ id, data: JSON.parse(raw) as ProposalData, meta: metaOf(rows[2 * i + 1] as string[] | null) }] : [];
    } catch {
      return [];
    }
  });
}
