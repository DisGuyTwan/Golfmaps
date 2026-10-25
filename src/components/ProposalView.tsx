"use client";

import { useEffect, useRef, useState } from "react";
import { UI, formatAcres } from "@/lib/i18n";
import { formatSqft } from "@/lib/lawn";
import { stillValid, type ProposalData } from "@/lib/proposal";
import { PROPOSAL_COPY } from "@/lib/proposal-copy";
import { fmtMoney, formatPayback } from "@/lib/roi";
import { Icon } from "./icons";
import { SourceList } from "./Sources";
import { TabHeader, ui } from "./ui";
import { windowLine } from "./WindowPicker";

type Accepted = { name: string; option: string; at: string } | null;

/** Sends what the client did (best effort: the page never waits on it). */
function send(id: string, event: object) {
  void fetch(`/api/proposals/${id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {});
}

/**
 * The client's proposal, in its language: the property and how sure its
 * numbers are, the options priced with their monthly payment and payback,
 * the track record, what the numbers rest on, and accepting an option.
 * Opening it, reading its parts and accepting are sent back to the rep.
 */
export default function ProposalView({
  id,
  data,
  accepted: initial,
  today,
}: {
  id: string;
  data: ProposalData;
  accepted: Accepted;
  /** Today in Quebec (YYYY-MM-DD), from the server, for the validity date. */
  today: string;
}) {
  const lang = data.lang;
  const c = PROPOSAL_COPY[lang];
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const money = (n: number) => fmtMoney(n, lang);
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(locale, { dateStyle: "long" });
  const [accepted, setAccepted] = useState<Accepted>(initial);
  const [option, setOption] = useState(data.recommended);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Opened, and each part read once (more than half of it in view for a second and a half).
  useEffect(() => {
    send(id, { type: "open" });
    const seen = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const section = (e.target as HTMLElement).dataset.section!;
          if (seen.has(section)) continue;
          if (e.isIntersecting) {
            timers.set(
              section,
              setTimeout(() => {
                seen.add(section);
                send(id, { type: "section", section });
              }, 1500),
            );
          } else clearTimeout(timers.get(section));
        }
      },
      { threshold: 0.5 },
    );
    root.current?.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [id]);

  const expired = !stillValid(data, today);
  const p = data.property;
  const amount = (n: number) => (p.acres !== null ? `${formatAcres(n, lang)} ac` : formatSqft(n, lang));
  const shown = p.acres ?? p.sqft;
  const pct = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

  const accept = async () => {
    setSending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/proposals/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "accept", option, name }),
      });
      const body = (await res.json().catch(() => ({}))) as { accepted?: Accepted };
      if (body.accepted) setAccepted(body.accepted);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={root} className="min-h-[100dvh] bg-canvas text-ink print:bg-white">
      <TabHeader
        lang={lang}
        icon="file"
        eyebrow={`${c.pageTitle} · ${c.dated(date(data.createdAt))}`}
        title={c.title(data.client.name)}
        lede={`${c.preparedBy(data.rep.name, data.rep.company)} · ${c.validUntil(date(data.validUntil))}`}
        printTitle={`Calculator - ${c.pageTitle} - ${data.client.name}`}
      />
      <main className={`${ui.container} space-y-6 pb-16 pt-6 print:max-w-none print:space-y-3 print:px-4 print:pt-3`}>
        {expired && !accepted && (
          <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{c.expired}</p>
        )}

        <section data-section="property" className={`${ui.card} space-y-2`}>
          <h2 className={ui.h2}>{c.property}</h2>
          <p className="text-sm text-muted">
            {c.kinds[p.kind]}
            {p.name && ` · ${p.name}`}
          </p>
          {shown !== null && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-accent-soft px-4 py-3 text-accent-ink">
              <span className="text-sm font-semibold">{c.grass}</span>
              <span className="text-2xl font-bold tabular-nums">{amount(shown)}</span>
              <span className="w-full text-xs">
                {p.client ? c.yourFigure : p.range && c.likely(p.acres !== null ? formatAcres(p.range[0], lang) : formatSqft(p.range[0], lang), amount(p.range[1]))}
              </span>
            </div>
          )}
          <p className="text-sm">
            {c.mowing(p.mowEvery)}
            {windowLine(p.window, lang) && ` · ${windowLine(p.window, lang)}`}
          </p>
        </section>

        <section data-section="options" className="space-y-3">
          <h2 className={ui.h2}>{c.options}</h2>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            {data.options.map((o) => {
              const pr = o.priced;
              const best = o.id === data.recommended;
              return (
                <article key={o.id} className={`${ui.card} space-y-2 ${best ? "ring-2 ring-accent" : ""} print:break-inside-avoid`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold">{c.optionTitle(o.id)}</h3>
                    {best && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">{c.recommended}</span>}
                  </div>
                  <p className="text-xs text-muted">
                    {c.optionKinds[o.kind]}
                    {o.approach && ` · ${c.approaches[o.approach]}`}
                  </p>
                  <ul className="space-y-0.5 text-sm font-semibold">
                    {o.lines.map((l) => (
                      <li key={l.model}>
                        {l.units} × {l.name}
                      </li>
                    ))}
                  </ul>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                    <dt className="text-muted">{c.equipment}</dt>
                    <dd className="text-right tabular-nums">{pr.equipment !== null ? money(pr.equipment) : c.onRequest}</dd>
                    <dt className="text-muted">{o.installPrice !== null ? c.installation : c.installEstimated}</dt>
                    <dd className="text-right tabular-nums">{money(pr.install)}</dd>
                    {pr.incentives > 0 && (
                      <>
                        <dt className="text-muted">{c.incentives}</dt>
                        <dd className="text-right tabular-nums">−{money(pr.incentives)}</dd>
                      </>
                    )}
                    {pr.net !== null && (
                      <>
                        <dt className="font-semibold">{c.net}</dt>
                        <dd className="text-right font-semibold tabular-nums">{money(pr.net)}</dd>
                      </>
                    )}
                    {pr.down !== null && pr.down > 0 && (
                      <>
                        <dt className="text-muted">{c.down}</dt>
                        <dd className="text-right tabular-nums">{money(pr.down)}</dd>
                      </>
                    )}
                  </dl>
                  {pr.monthly !== null && (
                    <div className="flex items-baseline justify-between gap-2 rounded-lg bg-brand px-3 py-2 text-white">
                      <span className="text-xs font-semibold">{c.monthly(data.financing.months, pct(data.financing.ratePct))}</span>
                      <span className="text-lg font-bold tabular-nums">{money(pr.monthly)}</span>
                    </div>
                  )}
                  {pr.roi && (
                    <div className="space-y-0.5 text-xs">
                      {Number.isFinite(pr.roi.paybackMonths) && <p className="font-semibold text-accent">{c.payback(formatPayback(pr.roi.paybackMonths, lang))}</p>}
                      <p className="text-muted">{c.running(money(pr.roi.crewMonthly), money(pr.roi.robotsMonthly))}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <p className={ui.note}>{c.taxes}</p>
          <p className="text-sm text-ink-2">
            {data.record.installs > 0 ? c.record(data.record.installs, data.record.within10 !== null ? Math.round(data.record.within10 * 100) : null) : c.noRecord}
          </p>
        </section>

        {data.notes && (
          <section className={`${ui.card} space-y-1`}>
            <h2 className={ui.h2}>{c.notes}</h2>
            <p className="whitespace-pre-line text-sm">{data.notes}</p>
          </section>
        )}

        <section data-section="accept" className={`${ui.card} space-y-3 print:hidden`}>
          <h2 className={ui.h2}>{c.accept}</h2>
          {accepted ? (
            <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-ink">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              {c.accepted(accepted.name, date(accepted.at), accepted.option)}
            </p>
          ) : expired ? (
            <p className="text-sm text-muted">{c.expired}</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && agree) void accept();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className={ui.label}>{c.acceptOption}</span>
                  <select value={option} onChange={(e) => setOption(e.target.value)} className={ui.input}>
                    {data.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {c.optionTitle(o.id)}: {o.lines.map((l) => `${l.units} × ${l.model}`).join(" + ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={ui.label}>{c.acceptName}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={ui.input} />
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                {c.acceptConfirm(option)}
              </label>
              {failed && <p className="text-sm text-red-600 dark:text-red-400">{c.acceptFailed}</p>}
              <button type="submit" disabled={!name.trim() || !agree || sending} className={ui.btnPrimary}>
                <Icon name="check" />
                {c.acceptButton}
              </button>
            </form>
          )}
          <p className="text-sm text-muted">
            {c.contact} {data.rep.name}
            {data.rep.email && (
              <>
                {" · "}
                <a href={`mailto:${data.rep.email}`} className="text-accent underline">
                  {data.rep.email}
                </a>
              </>
            )}
            {data.rep.phone && (
              <>
                {" · "}
                <a href={`tel:${data.rep.phone}`} className="text-accent underline">
                  {data.rep.phone}
                </a>
              </>
            )}
          </p>
        </section>

        <section data-section="assumptions" className={`${ui.card} space-y-2 print:break-before-page`}>
          <h2 className={ui.h2}>{UI[lang].sources.reportTitle}</h2>
          <p className="text-sm text-muted">{UI[lang].sources.reportLede}</p>
          <SourceList lang={lang} items={data.assumptions} mode={p.kind === "lawn" ? "lawn" : "acres"} />
          {data.link && (
            <a href={data.link} className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline print:hidden">
              <Icon name="map" className="h-4 w-4" />
              {c.measurement}
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
