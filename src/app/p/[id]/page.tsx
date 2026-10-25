import type { Metadata } from "next";
import ProposalView from "@/components/ProposalView";
import { kv } from "@/lib/kv-server";
import { PROPOSAL_COPY } from "@/lib/proposal-copy";
import { readProposal } from "@/lib/proposal-store-server";

/** A client's proposal, as the rep sent it: read fresh each time (its acceptance can change). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Calculator", robots: { index: false, follow: false } };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = kv();
  const found = db ? await readProposal(db, id).catch(() => null) : null;
  if (!found)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-8 text-center text-ink">
        <p className="max-w-sm text-sm text-muted">
          {PROPOSAL_COPY.en.notFound}
          <br />
          {PROPOSAL_COPY.fr.notFound}
        </p>
      </main>
    );
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return <ProposalView id={id} data={found.data} accepted={found.meta.accepted} today={today} />;
}
