"use client";

import { useEffect, useMemo, useState } from "react";
import { UI, formatAcres, type Lang } from "@/lib/i18n";
import { computeIncentives, DEFAULT_INCENTIVE_INPUTS } from "@/lib/incentives";
import { SQ_M_TO_SQ_FT, formatSqft } from "@/lib/lawn";
import { mainFleet } from "@/lib/mowers";
import { useLang } from "@/lib/preferences";
import { DEFAULT_FINANCING, edgesToMap, UNIT_PRICES } from "@/lib/prices";
import { priceOption, proposalOptions, validUntil, VALID_DAYS, type Financing, type ProposalData, type ProposalOption } from "@/lib/proposal";
import { acresForQuote, lawnQuoteSqft } from "@/lib/quote";
import {
  getAcreageLink,
  useCourseName,
  useIncentiveProfile,
  useLawn,
  useMeasurement,
  useMode,
  useQuoteSettings,
  useRoiInputs,
  useSod,
} from "@/lib/quote-store";
import { useRecords } from "@/lib/records-store";
import { fmtMoney, formatPayback } from "@/lib/roi";
import { steepM2 } from "@/lib/site";
import { countUse } from "@/lib/usage";
import { Icon } from "./icons";
import { useMowerFit } from "./MowerFit";
import { useAssumptions } from "./Sources";
import { SectionTitle, TabHeader, delay, ui } from "./ui";

/** The rep's details and team key, kept on this device (a convenience: the proposal carries what's sent). */
const REP_KEY = "calculator.rep";
type Rep = { name: string; email: string; phone: string; company: string; teamKey: string };
const NO_REP: Rep = { name: "", email: "", phone: "", company: "", teamKey: "" };
function loadRep(): Rep {
  try {
    return { ...NO_REP, ...(JSON.parse(localStorage.getItem(REP_KEY) ?? "{}") as Partial<Rep>) };
  } catch {
    return NO_REP;
  }
}
function saveRep(rep: Rep) {
  try {
    localStorage.setItem(REP_KEY, JSON.stringify(rep));
  } catch {
    // Private mode: typed again next time.
  }
}

interface SentRow {
  id: string;
  createdAt: string;
  validUntil: string;
  client: string;
  property: string | null;
  meta: { opens: number; lastOpen: string | null; sections: Record<string, number>; accepted: { name: string; option: string } | null };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className={ui.label}>{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const numberOr = (v: string, fallback: number | null) => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * The Proposal tab: one document for the client instead of three PDFs. It
 * takes the property measured on the Acreage tab, the robots the mower fit
 * recommends (and the other way of working, and the next best), the
 * Incentives tab's profile and the ROI tab's crew figures; the rep adds
 * prices (the dealer's list, or typed), their installation price (beside
 * our estimate), financing, validity and notes, and creates a link the
 * client opens and accepts. The list below shows what each client did.
 */
export default function ProposalTab() {
  const lang = useLang();
  const t = UI[lang];
  const p = t.proposal;
  const money = (n: number) => fmtMoney(n, lang);
  const mode = useMode();
  const q = useQuoteSettings();
  const measurement = useMeasurement();
  const sod = useSod();
  const lawn = useLawn();
  const courseName = useCourseName();
  const fit = useMowerFit();
  const assumptions = useAssumptions();
  const records = useRecords();
  const profile = useIncentiveProfile() ?? DEFAULT_INCENTIVE_INPUTS;
  const roiInputs = useRoiInputs();

  const [rep, setRep] = useState<Rep>(loadRep);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientLang, setClientLang] = useState<Lang>(lang);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [installs, setInstalls] = useState<Record<string, string>>({});
  const [left, setLeft] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [financing, setFinancing] = useState({ rate: String(DEFAULT_FINANCING.ratePct), months: String(DEFAULT_FINANCING.months), down: String(DEFAULT_FINANCING.downPct) });
  const [days, setDays] = useState(String(VALID_DAYS));
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "done" | "error"; url?: string; error?: string }>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<SentRow[] | null>(null);

  const changeRep = (patch: Partial<Rep>) =>
    setRep((r) => {
      const next = { ...r, ...patch };
      saveRep(next);
      return next;
    });

  const commercial = q.commercial || mode !== "lawn";
  const acres = acresForQuote(mode, measurement, sod, q, lawn);
  const sqft = mode === "lawn" ? lawnQuoteSqft(lawn, q) : null;
  const rec = fit?.recommendation ?? null;
  const fleet = rec ? mainFleet(rec) : null;
  const other = fit?.approaches && fit.approach ? fit.approaches[fit.approach === "stay" ? "go" : "stay"] : null;
  const edgeM = fit ? edgesToMap(fit.site) : 0;
  const unitPrices = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [model, listed] of Object.entries(UNIT_PRICES)) out[model] = numberOr(prices[model] ?? "", listed);
    return out;
  }, [prices]);
  const baseOptions = useMemo(
    () => (rec ? proposalOptions(rec, fit?.approach ?? null, other, edgeM, unitPrices) : []),
    [rec, fit?.approach, other, edgeM, unitPrices],
  );
  const fin: Financing = {
    ratePct: numberOr(financing.rate, 0) ?? 0,
    months: Math.max(1, Math.round(numberOr(financing.months, 48) ?? 48)),
    downPct: numberOr(financing.down, 0) ?? 0,
  };
  const job =
    acres !== null && commercial
      ? {
          acres,
          mowEvery: q.mowEvery,
          window: q.window,
          layoutPct: fleet?.work ? Math.max(0, Math.round((fleet.work.factor - 1) * 100)) : 0,
          base: roiInputs ?? undefined,
          calibration: Object.fromEntries(Object.entries(records.calibration).map(([id, c]) => [id, c.factor])),
        }
      : null;
  const options = baseOptions.map((o) => {
    const withInstall: ProposalOption = { ...o, installPrice: numberOr(installs[o.id] ?? "", null) };
    const equipment = withInstall.lines.every((l) => l.unitPrice !== null) ? withInstall.lines.reduce((s, l) => s + l.unitPrice! * l.units, 0) : 0;
    const kept = equipment > 0 ? computeIncentives({ ...profile, buyRobot: true, robotAmt: equipment, buyTools: false, toolAmt: 0 }, clientLang).keptLow : 0;
    return { ...withInstall, priced: priceOption(withInstall, fin, kept, job) };
  });
  const included = options.filter((o) => !left[o.id]);
  const recommended = included.find((o) => o.id === chosen)?.id ?? included[0]?.id ?? null;
  const models = [...new Set(baseOptions.flatMap((o) => o.lines.map((l) => l.model)))];
  const ready = !!fit && included.length > 0 && clientName.trim() && rep.name.trim() && rep.email.trim() && rep.teamKey.trim();

  const loadSent = async (key = rep.teamKey) => {
    if (!key) return;
    try {
      const res = await fetch("/api/proposals", { headers: { "x-team-key": key }, cache: "no-store" });
      if (res.ok) setSent(((await res.json()) as { proposals: SentRow[] }).proposals);
    } catch {
      // The list stays as it was.
    }
  };
  // The sent proposals, once the tab opens with a team key.
  useEffect(() => {
    const key = loadRep().teamKey;
    if (!key) return;
    let cancelled = false;
    fetch("/api/proposals", { headers: { "x-team-key": key }, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ proposals: SentRow[] }>) : null))
      .then((body) => {
        if (!cancelled && body) setSent(body.proposals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    if (!ready || !fit || !recommended) return;
    setState({ kind: "saving" });
    const range = fit.range?.low != null && fit.range.high != null ? ([fit.range.low, fit.range.high] as [number, number]) : null;
    const steep = steepM2(fit.site);
    const data: ProposalData = {
      version: 1,
      lang: clientLang,
      createdAt: new Date().toISOString(),
      validUntil: validUntil(new Date(), Math.max(1, Math.round(numberOr(days, VALID_DAYS) ?? VALID_DAYS))),
      client: { name: clientName.trim(), email: clientEmail.trim() },
      rep: { name: rep.name.trim(), email: rep.email.trim(), phone: rep.phone.trim(), company: rep.company.trim() },
      property: {
        kind: mode === "lawn" ? (q.commercial ? "site" : "lawn") : mode,
        name: courseName,
        acres: mode === "lawn" ? (q.commercial ? acres : null) : acres,
        sqft: mode === "lawn" && !q.commercial ? sqft : null,
        range: mode === "lawn" ? null : range,
        client: mode === "lawn" ? q.lawnOverride !== null : q.override !== null,
        mowEvery: q.mowEvery,
        window: q.window,
        steep: steep === null ? null : { amount: mode === "lawn" && !q.commercial ? steep * SQ_M_TO_SQ_FT : steep / 4046.86, share: fit.site.terrain?.over36 ?? 0 },
      },
      options: included,
      recommended,
      financing: fin,
      assumptions,
      record: { installs: records.installs, within10: records.within10 },
      link: getAcreageLink() ?? "",
      notes: notes.trim(),
    };
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-team-key": rep.teamKey },
        body: JSON.stringify(data),
      });
      if (res.status === 503) return setState({ kind: "error", error: p.noStorage });
      if (res.status === 403) return setState({ kind: "error", error: p.badKey });
      if (!res.ok) return setState({ kind: "error", error: p.failed });
      const { url } = (await res.json()) as { url: string };
      setState({ kind: "done", url });
      countUse("proposal.create");
      void loadSent();
    } catch {
      setState({ kind: "error", error: p.failed });
    }
  };

  const shownArea = mode === "lawn" && !q.commercial ? (sqft !== null ? formatSqft(sqft, lang) : null) : acres !== null ? `${formatAcres(acres, lang)} ac` : null;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }) : "");

  return (
    <div className="h-full overflow-y-auto bg-canvas text-ink">
      <TabHeader lang={lang} icon="file" eyebrow={p.eyebrow} title={p.title} lede={p.lede} printTitle={`Calculator - ${p.title}`} />
      <div className={`${ui.container} grid gap-6 pb-20 pt-6 min-[900px]:grid-cols-[1fr_1.2fr]`}>
        <section className={`${ui.card} ${ui.enter} min-w-0 space-y-4`} style={delay(1)}>
          <SectionTitle icon="users">{p.client}</SectionTitle>
          <Field label={p.clientName}>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={ui.input} />
          </Field>
          <Field label={p.clientEmail}>
            <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={ui.input} />
          </Field>
          <Field label={p.language}>
            <select value={clientLang} onChange={(e) => setClientLang(e.target.value as Lang)} className={ui.input}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>

          <SectionTitle icon="pen">{p.you}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={p.repName}>
              <input value={rep.name} onChange={(e) => changeRep({ name: e.target.value })} autoComplete="name" className={ui.input} />
            </Field>
            <Field label={p.repCompany}>
              <input value={rep.company} onChange={(e) => changeRep({ company: e.target.value })} autoComplete="organization" className={ui.input} />
            </Field>
            <Field label={p.repEmail}>
              <input type="email" value={rep.email} onChange={(e) => changeRep({ email: e.target.value })} autoComplete="email" className={ui.input} />
            </Field>
            <Field label={p.repPhone}>
              <input type="tel" value={rep.phone} onChange={(e) => changeRep({ phone: e.target.value })} autoComplete="tel" className={ui.input} />
            </Field>
          </div>
          <Field label={p.teamKey} hint={p.teamKeyHint}>
            <input type="password" value={rep.teamKey} onChange={(e) => changeRep({ teamKey: e.target.value })} autoComplete="off" className={ui.input} />
          </Field>

          <SectionTitle icon="wallet">{p.financing}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Field label={p.rate}>
              <input inputMode="decimal" value={financing.rate} onChange={(e) => setFinancing((f) => ({ ...f, rate: e.target.value }))} className={ui.input} />
            </Field>
            <Field label={p.months}>
              <input inputMode="numeric" value={financing.months} onChange={(e) => setFinancing((f) => ({ ...f, months: e.target.value }))} className={ui.input} />
            </Field>
            <Field label={p.down}>
              <input inputMode="decimal" value={financing.down} onChange={(e) => setFinancing((f) => ({ ...f, down: e.target.value }))} className={ui.input} />
            </Field>
          </div>
          <p className="text-xs text-muted">{p.financingHint}</p>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Field label={p.validity}>
              <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={ui.input} />
            </Field>
            <Field label={p.notes}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={ui.input} />
            </Field>
          </div>
        </section>

        <section className={`${ui.card} ${ui.enter} min-w-0 space-y-4`} style={delay(2)}>
          <SectionTitle icon="calculator">{p.options}</SectionTitle>
          {!fit || !rec ? (
            <p className="text-sm text-muted">{p.empty}</p>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                {courseName ?? t.modes[mode === "lawn" && q.commercial ? "site" : mode]}
                {shownArea && ` · ${shownArea}`}
              </p>
              {models.map((model) => (
                <Field
                  key={model}
                  label={p.unitPrice(model)}
                  hint={UNIT_PRICES[model] != null ? p.unitPriceListed : p.unitPriceMissing}
                >
                  <input
                    inputMode="decimal"
                    placeholder={UNIT_PRICES[model] != null ? String(UNIT_PRICES[model]) : ""}
                    value={prices[model] ?? ""}
                    onChange={(e) => setPrices((x) => ({ ...x, [model]: e.target.value }))}
                    className={ui.input}
                  />
                </Field>
              ))}
              <ul className="space-y-3">
                {options.map((o) => (
                  <li key={o.id} className={`space-y-2 rounded-lg border px-3 py-2 ${o.id === recommended ? "border-brand" : "border-line"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold">
                        {o.id.toUpperCase()} · {o.lines.map((l) => `${l.units} × ${l.model}`).join(" + ")}
                      </span>
                      <span className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={!left[o.id]} onChange={(e) => setLeft((x) => ({ ...x, [o.id]: !e.target.checked }))} />
                          {p.include}
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" name="recommended" checked={o.id === recommended} disabled={!!left[o.id]} onChange={() => setChosen(o.id)} />
                          {p.recommended}
                        </label>
                      </span>
                    </div>
                    <Field
                      label={p.installPrice}
                      hint={p.installEstimate(money(o.installEstimate.total), o.installEstimate.hours.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 }))}
                    >
                      <input
                        inputMode="decimal"
                        value={installs[o.id] ?? ""}
                        placeholder={String(Math.round(o.installEstimate.total))}
                        onChange={(e) => setInstalls((x) => ({ ...x, [o.id]: e.target.value }))}
                        className={ui.input}
                      />
                    </Field>
                    {o.priced.net !== null && o.priced.monthly !== null && (
                      <p className="text-sm font-semibold text-accent">
                        {p.priced(money(o.priced.net), money(o.priced.monthly))}
                        {o.priced.roi && Number.isFinite(o.priced.roi.paybackMonths) && ` · ${p.payback(formatPayback(o.priced.roi.paybackMonths, lang))}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" disabled={!ready || state.kind === "saving"} onClick={() => void create()} className={`${ui.btnPrimary} w-full`}>
                <Icon name="link" />
                {state.kind === "saving" ? p.creating : p.create}
              </button>
              {state.kind === "error" && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
              {state.kind === "done" && state.url && (
                <div className="space-y-2 rounded-lg bg-accent-soft px-3 py-2 text-accent-ink">
                  <p className="text-sm font-semibold">{p.created}</p>
                  <p className="break-all text-xs">{state.url}</p>
                  <div className="flex gap-2">
                    <a href={state.url} target="_blank" rel="noopener noreferrer" className={ui.btnSecondary}>
                      <Icon name="external" />
                      {p.open}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(state.url!).then(() => setCopied(true));
                      }}
                      className={ui.btnSecondary}
                    >
                      <Icon name={copied ? "check" : "copy"} />
                      {copied ? p.copied : p.copy}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t border-line pt-4">
            <SectionTitle icon="list">{p.sent}</SectionTitle>
            <button type="button" onClick={() => void loadSent()} className="text-xs font-semibold text-accent hover:underline">
              {p.refresh}
            </button>
          </div>
          {sent && sent.length === 0 && <p className="text-sm text-muted">{p.noneSent}</p>}
          {sent && sent.length > 0 && (
            <ul className="space-y-2">
              {sent.map((s) => (
                <li key={s.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <a href={`/p/${s.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
                      {s.client}
                      {s.property && ` · ${s.property}`}
                    </a>
                    <span className="shrink-0 text-muted">{when(s.createdAt)}</span>
                  </div>
                  <div className={s.meta.accepted ? "font-semibold text-accent" : "text-ink-2"}>
                    {s.meta.accepted ? p.acceptedBy(s.meta.accepted.name, s.meta.accepted.option) : p.opened(s.meta.opens, when(s.meta.lastOpen))}
                  </div>
                  {Object.keys(s.meta.sections).length > 0 && (
                    <div className="text-muted">{p.read(Object.keys(s.meta.sections).map((k) => p.sections[k] ?? k).join(", "))}</div>
                  )}
                  <div className="text-faint">{p.expiresOn(s.validUntil)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
