"use client";

import { useState } from "react";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import type { FieldRecord } from "@/lib/records";
import type { Records } from "@/lib/records-store";
import { Icon } from "./icons";
import { SectionTitle, TabHeader, ui } from "./ui";

const REP_KEY = "calculator.rep";
const savedKey = () => {
  try {
    return (JSON.parse(localStorage.getItem(REP_KEY) ?? "{}") as { teamKey?: string }).teamKey ?? "";
  } catch {
    return "";
  }
};

interface Usage {
  events: string[];
  days: { day: string; counts: Record<string, number> }[];
}
interface ProposalRow {
  id: string;
  createdAt: string;
  client: string;
  rep: string;
  property: string | null;
  validUntil: string;
  meta: { opens: number; lastOpen: string | null; accepted: { name: string; option: string } | null };
}

/**
 * The team's page (/admin, team key): what reps use (per action, today, 7
 * and 30 days), the proposals and what clients did with them, and the field
 * checks and installs with what they've corrected so far.
 */
export default function AdminView() {
  const lang = useLang();
  const a = UI[lang].admin;
  const [key, setKey] = useState(savedKey);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [records, setRecords] = useState<FieldRecord[] | null>(null);
  const [summary, setSummary] = useState<Records | null>(null);
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const fmt = (n: number, d = 1) => n.toLocaleString(locale, { maximumFractionDigits: d });

  const load = async () => {
    setError(null);
    const headers = { "x-team-key": key };
    try {
      const [u, p, r, s] = await Promise.all([
        fetch("/api/usage", { headers, cache: "no-store" }),
        fetch("/api/proposals", { headers, cache: "no-store" }),
        fetch("/api/records?all=1", { headers, cache: "no-store" }),
        fetch("/api/records", { cache: "no-store" }),
      ]);
      if ([u, p, r].some((x) => x.status === 403)) return setError(a.badKey);
      if ([u, p].some((x) => x.status === 503)) return setError(a.noStorage);
      setUsage((await u.json()) as Usage);
      setProposals(((await p.json()) as { proposals: ProposalRow[] }).proposals);
      setRecords(((await r.json()) as { records: FieldRecord[] }).records);
      setSummary((await s.json()) as Records);
    } catch {
      setError(a.noStorage);
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json", "x-team-key": key }, body: JSON.stringify({ delete: id }) });
    void load();
  };

  const total = (event: string, days: number) => (usage?.days.slice(0, days) ?? []).reduce((n, d) => n + (d.counts[event] ?? 0), 0);

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <TabHeader lang={lang} icon="table" eyebrow={a.eyebrow} title={a.title} lede={a.lede} printTitle="Calculator - team" />
      <main className={`${ui.container} space-y-6 pb-16 pt-6`}>
        <form
          className={`${ui.card} flex flex-wrap items-end gap-3`}
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label className="min-w-[14rem] flex-1 space-y-1">
            <span className={ui.label}>{a.key}</span>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" className={ui.input} />
          </label>
          <button type="submit" disabled={!key} className={ui.btnPrimary}>
            <Icon name="refresh" />
            {a.load}
          </button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>

        {usage && (
          <section className={`${ui.card} space-y-3`}>
            <SectionTitle icon="trend">{a.usage}</SectionTitle>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1">{a.event}</th>
                  <th className="py-1 text-right">{a.today}</th>
                  <th className="py-1 text-right">{a.week}</th>
                  <th className="py-1 text-right">{a.month}</th>
                </tr>
              </thead>
              <tbody>
                {usage.events.map((e) => (
                  <tr key={e} className="border-b border-line">
                    <td className="py-1">{a.events[e] ?? e}</td>
                    <td className="py-1 text-right tabular-nums">{total(e, 1)}</td>
                    <td className="py-1 text-right tabular-nums">{total(e, 7)}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{total(e, 30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {proposals && (
          <section className={`${ui.card} space-y-3`}>
            <SectionTitle icon="file">{a.proposals}</SectionTitle>
            <ul className="space-y-2 text-sm">
              {proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                  <a href={`/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                    {p.client}
                    {p.property && ` · ${p.property}`}
                  </a>
                  <span className="text-xs text-muted">
                    {p.rep} · {new Date(p.createdAt).toLocaleDateString(locale)} ·{" "}
                    {p.meta.accepted ? UI[lang].proposal.acceptedBy(p.meta.accepted.name, p.meta.accepted.option) : UI[lang].proposal.opened(p.meta.opens, p.meta.lastOpen ? new Date(p.meta.lastOpen).toLocaleString(locale) : "")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary && records && (
          <section className={`${ui.card} space-y-3`}>
            <SectionTitle icon="ruler">{a.records}</SectionTitle>
            <p className="text-sm font-semibold">{a.record(summary.installs, summary.within10 !== null ? `${Math.round(summary.within10 * 100)}%` : null)}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <div className={ui.label}>{a.calibration}</div>
                {Object.keys(summary.calibration).length ? (
                  Object.entries(summary.calibration).map(([m, c]) => <p key={m}>{a.calibrationLine(m, fmt(c.factor, 2), c.n)}</p>)
                ) : (
                  <p className="text-muted">{a.noCalibration}</p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <div className={ui.label}>{a.spread}</div>
                {Object.keys(summary.spread).length ? (
                  Object.entries(summary.spread).map(([b, s]) => s && <p key={b}>{a.spreadLine(b, fmt(s.low, 2), fmt(s.high, 2), s.n)}</p>)
                ) : (
                  <p className="text-muted">{a.noSpread}</p>
                )}
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {records.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2 border-b border-line pb-1">
                  <span>
                    <span className="text-xs text-muted">{new Date(r.at).toLocaleDateString(locale)} · </span>
                    {r.kind === "check"
                      ? a.checkLine(r.model, fmt(r.areaM2 / 4046.86, 2), fmt(r.actualH), fmt(r.predictedH))
                      : a.installLine(r.property, fmt(r.actualAcres, 2), fmt(r.predictedAcres, 2), r.basis)}
                    {r.note && <span className="text-muted"> · {r.note}</span>}
                  </span>
                  <button type="button" onClick={() => void remove(r.id)} className="shrink-0 text-xs font-semibold text-faint hover:text-red-600">
                    {a.remove}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
