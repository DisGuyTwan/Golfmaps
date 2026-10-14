"use client";

import { useMemo, useRef, useState } from "react";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { TabHeader, ui } from "./ui";
import {
  BUSINESS_PROFILES,
  CITIES,
  DEFAULT_TAX_RATE,
  FARM_TYPES,
  PROFILES,
  STRINGS,
  STRUCTURES,
  computeIncentives,
  describeInputs,
  formatMoney,
  formatPct,
  isZeroItem,
  rangeText,
  summaryText,
  type City,
  type FarmType,
  type IncentiveInputs,
  type Link,
  type Mapaq,
  type Profile,
  type Province,
  type Structure,
  type Tag,
} from "@/lib/incentives";

const TAG_STYLES: Record<Tag, string> = {
  ok: "bg-accent-soft text-accent-ink",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  apply: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  off: "bg-surface-2 text-muted",
  info: "bg-surface-2 text-muted",
};

interface FormState {
  prov: Province;
  who: Profile;
  farm: FarmType;
  mapaq: Mapaq;
  bonus: boolean;
  struct: Structure;
  city: City;
  /** Numeric fields stay strings so the user can clear and retype them. */
  taxRate: string;
  buyRobot: boolean;
  buyTools: boolean;
  robotAmt: string;
  toolAmt: string;
  under500: boolean;
}

// Golf course is preselected because this app is built for golf quoting.
const DEFAULT_FORM: FormState = {
  prov: "QC",
  who: "golf",
  farm: "orchard",
  mapaq: "yes",
  bonus: false,
  struct: "corp",
  city: "stbruno",
  taxRate: String(DEFAULT_TAX_RATE.corp),
  buyRobot: true,
  buyTools: true,
  robotAmt: "24000",
  toolAmt: "3000",
  under500: true,
};

function positive(value: string): number {
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toInputs(f: FormState): IncentiveInputs {
  return {
    prov: f.prov,
    who: f.who,
    farm: f.farm,
    mapaq: f.mapaq,
    bonus: f.bonus,
    struct: f.struct,
    city: f.city,
    tax: positive(f.taxRate) / 100,
    buyRobot: f.buyRobot,
    buyTools: f.buyTools,
    robotAmt: positive(f.robotAmt),
    toolAmt: positive(f.toolAmt),
    under500: f.under500,
  };
}

function Chips<V extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value} className="relative">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium leading-tight text-ink-2 transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-line py-5 first:border-t-0 first:pt-0">
      <legend className="contents">
        <span className={`flex items-baseline gap-2 ${ui.h2}`}>
          <span className="text-accent">{n}</span>
          {title}
        </span>
      </legend>
      {children}
    </fieldset>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Links({ links }: { links?: Link[] }) {
  if (!links?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {links.map(([label, url]) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
          {label}
        </a>
      ))}
    </div>
  );
}

function TagPill({ tag, label }: { tag: Tag; label: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TAG_STYLES[tag]}`}>
      {label}
    </span>
  );
}

export default function IncentivesTab() {
  const lang = useLang();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [taxTouched, setTaxTouched] = useState(false);
  // A key rather than text, so the message follows a language switch.
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFail" | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const L = STRINGS[lang];
  const inputs = useMemo(() => toInputs(form), [form]);
  const result = useMemo(() => computeIncentives(inputs, lang), [inputs, lang]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setStruct = (struct: Structure) => {
    setForm((prev) => ({
      ...prev,
      struct,
      // Follow the structure's typical rate until the user types their own.
      taxRate: !taxTouched && struct !== "exempt" ? String(DEFAULT_TAX_RATE[struct]) : prev.taxRate,
    }));
  };

  const isBusiness = BUSINESS_PROFILES.includes(form.who);
  const showMapaq = form.who === "farm" && form.prov === "QC";
  const showTax = isBusiness && form.struct !== "exempt";
  const showCity = form.prov === "QC" && (form.who === "homeowner" || form.who === "institution");

  const hasEstimate = result.P > 0 && result.high > 0;
  const headline = hasEstimate ? rangeText(result.low, result.high, lang) : formatMoney(0, lang);
  const subline =
    result.P <= 0
      ? L.enterAmt
      : result.high <= 0
        ? L.none
        : L.ofPurchase(
            formatMoney(result.P, lang),
            L.pctRange(formatPct(result.low / result.P, lang), formatPct(result.high / result.P, lang)),
          );
  const { profile, purchase } = describeInputs(inputs, result, lang);
  const lowPct = result.P > 0 ? Math.min(100, (result.low / result.P) * 100) : 0;
  const highPct = result.P > 0 ? Math.min(100, (result.high / result.P) * 100) : 0;

  const copySummary = async () => {
    const text = summaryText(inputs, result, lang);
    try {
      await navigator.clipboard.writeText(text);
      setFallbackText(null);
      setCopyStatus("copied");
    } catch {
      setFallbackText(text);
      setCopyStatus("copyFail");
    }
  };

  return (
    // Printed at 85%: the client PDF is the profile plus results, about two pages.
    <div className="h-full overflow-y-auto bg-canvas text-ink print:h-auto print:overflow-visible print:bg-white print:[zoom:0.85]">
      <TabHeader
        eyebrow={L.eyebrow}
        title={L.h1}
        lede={L.lede}
        printLabel={UI[lang].printPdf}
        printTitle={`Kress - ${UI[lang].tabs.incentives}`}
      />

      <div className={`${ui.container} grid gap-8 pb-28 pt-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:pb-12 print:max-w-none print:gap-4 print:px-4 print:pb-0 print:pt-3`}>
        {/* The form is for the meeting; the PDF shows the choices as text instead. */}
        <form onSubmit={(e) => e.preventDefault()} noValidate className="min-w-0 print:hidden">
          <Step n={1} title={L.s1}>
            <Chips
              name="prov"
              value={form.prov}
              onChange={(v) => set("prov", v)}
              options={(["QC", "ON"] as Province[]).map((p) => ({ value: p, label: L[`prov_${p}`] }))}
            />
          </Step>

          <Step n={2} title={L.s2}>
            <Chips
              name="who"
              value={form.who}
              onChange={(v) => set("who", v)}
              options={PROFILES.map((p) => ({ value: p, label: L[`who_${p}`] }))}
            />

            {form.who === "farm" && (
              <div className="space-y-4 rounded-xl bg-accent-soft p-4">
                <Sub title={L.s2farm}>
                  <Chips
                    name="farm"
                    value={form.farm}
                    onChange={(v) => set("farm", v)}
                    options={FARM_TYPES.map((f) => ({ value: f, label: L[`farm_${f}`] }))}
                  />
                </Sub>
                {showMapaq && (
                  <Sub title={L.s2mapaq}>
                    <Chips
                      name="mapaq"
                      value={form.mapaq}
                      onChange={(v) => set("mapaq", v)}
                      options={(["yes", "no", "unsure"] as Mapaq[]).map((m) => ({ value: m, label: L[m] }))}
                    />
                    <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
                      <input
                        type="checkbox"
                        checked={form.bonus}
                        onChange={(e) => set("bonus", e.target.checked)}
                        className="mt-0.5 h-5 w-5 accent-brand"
                      />
                      {L.bonus}
                    </label>
                  </Sub>
                )}
              </div>
            )}

            {isBusiness && (
              <div className="space-y-4 rounded-xl bg-accent-soft p-4">
                <Sub title={L.s2struct}>
                  <Chips
                    name="struct"
                    value={form.struct}
                    onChange={setStruct}
                    options={STRUCTURES.map((s) => ({ value: s, label: L[`struct_${s}`] }))}
                  />
                </Sub>
                {showTax && (
                  <div className="space-y-1">
                    <label htmlFor="taxRate" className={ui.label}>
                      {L.taxLabel}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-28">
                      <input
                        id="taxRate"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={60}
                        step={0.1}
                        value={form.taxRate}
                        onChange={(e) => {
                          setTaxTouched(true);
                          set("taxRate", e.target.value);
                        }}
                        className={ui.input}
                      />
                      </div>
                      <span className="font-semibold text-muted">%</span>
                    </div>
                    <p className="text-sm text-muted">{L.taxHelp}</p>
                  </div>
                )}
              </div>
            )}

            {showCity && (
              <div className="rounded-xl bg-accent-soft p-4">
                <Sub title={L.s2city}>
                  <Chips
                    name="city"
                    value={form.city}
                    onChange={(v) => set("city", v)}
                    options={CITIES.map((c) => ({ value: c, label: L[`city_${c}`] }))}
                  />
                </Sub>
              </div>
            )}
          </Step>

          <Step n={3} title={L.s3}>
            {(
              [
                ["buyRobot", "robotAmt", L.robotLabel, L.robotHelp, 100],
                ["buyTools", "toolAmt", L.toolLabel, L.toolHelp, 50],
              ] as const
            ).map(([buyKey, amtKey, label, help, step]) => (
              <div key={buyKey} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                <label className="flex cursor-pointer items-center gap-2 text-base font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={form[buyKey]}
                    onChange={(e) => set(buyKey, e.target.checked)}
                    className="h-5 w-5 accent-brand"
                  />
                  {label}
                </label>
                {form[buyKey] && (
                  <div className="space-y-1">
                    <label htmlFor={amtKey} className={ui.label}>
                      {help}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="w-40">
                      <input
                        id={amtKey}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={step}
                        value={form[amtKey]}
                        onChange={(e) => set(amtKey, e.target.value)}
                        className={ui.input}
                      />
                      </div>
                      <span className="font-semibold text-muted">$ CAD</span>
                    </div>
                    {buyKey === "buyTools" && (
                      <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
                        <input
                          type="checkbox"
                          checked={form.under500}
                          onChange={(e) => set("under500", e.target.checked)}
                          className="mt-0.5 h-5 w-5 accent-brand"
                        />
                        {L.under500}
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="text-sm text-muted">{L.exampleNote}</p>
          </Step>
        </form>

        <section ref={resultsRef} aria-live="polite" className="grid min-w-0 scroll-mt-4 gap-5 lg:sticky lg:top-4 print:gap-3">
          <dl className={`${ui.card} hidden gap-x-4 gap-y-1 text-sm print:grid print:grid-cols-[auto_1fr] print:py-3`}>
            <dt className="font-semibold text-ink-2">{L.sumProfile}</dt>
            <dd>{profile}</dd>
            <dt className="font-semibold text-ink-2">{L.sumBuy}</dt>
            <dd>{purchase}</dd>
          </dl>
          <div className={`${ui.card} grid gap-2 print:break-inside-avoid`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{L.kicker}</p>
            <p className={`${ui.kpi} text-accent`}>{headline}</p>
            <p className="text-sm text-ink-2">{subline}</p>
            <div className="relative h-3.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-300"
                style={{ width: `${highPct}%`, background: "repeating-linear-gradient(135deg,var(--hatch) 0 6px,transparent 6px 10px)" }}
              />
              <div className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-300 dark:bg-accent" style={{ width: `${lowPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-3 w-3 rounded-sm bg-brand dark:bg-accent" />
                {L.legendLow}
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  className="inline-block h-3 w-3 rounded-sm border border-[var(--hatch)]"
                  style={{ background: "repeating-linear-gradient(135deg,var(--hatch) 0 3px,transparent 3px 5px)" }}
                />
                {L.legendHigh}
              </span>
            </div>
            <p className="text-sm text-muted">{L.rangeNote}</p>
          </div>

          {result.items.length > 0 && (
            <div className="grid gap-2">
              <h2 className={ui.h2}>{L.breakdown}</h2>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {result.items.map((item) => (
                  <div key={item.t} className="grid gap-1.5 px-4 py-3.5 print:break-inside-avoid">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold leading-snug text-ink">{item.t}</h3>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        {isZeroItem(item) ? "–" : rangeText(item.low, item.high, lang)}
                      </span>
                    </div>
                    <div>
                      <TagPill tag={item.tag} label={L.tag[item.tag]} />
                    </div>
                    <p className="text-sm text-muted">{item.d}</p>
                    <Links links={item.links} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.cards.length > 0 && (
            <div className="grid gap-2">
              <h2 className={ui.h2}>{L.programs}</h2>
              {result.cards.map((card) => (
                <article
                  key={card.t}
                  className={`grid gap-1.5 rounded-xl px-4 py-3.5 print:break-inside-avoid ${card.info ? "bg-accent-soft" : "border border-line bg-surface"}`}
                >
                  <h3 className="text-sm font-semibold leading-snug text-ink">{card.t}</h3>
                  <div>
                    <TagPill tag={card.tag} label={L.tag[card.tag]} />
                  </div>
                  <p className="text-sm text-ink-2">{card.p}</p>
                  <Links links={card.links} />
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <button type="button" onClick={copySummary} className={ui.btnPrimary}>
              {L.copy}
            </button>
            {copyStatus && (
              <span role="status" className="text-sm text-muted">
                {L[copyStatus]}
              </span>
            )}
          </div>
          {fallbackText && (
            <textarea
              readOnly
              value={fallbackText}
              aria-label={lang === "fr" ? "Résumé" : "Summary"}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              className="min-h-36 w-full rounded-lg border border-line bg-surface p-3 text-sm print:hidden"
            />
          )}

          <div className={`grid gap-2 ${ui.note} print:break-inside-avoid`}>
            <p>{L.timing}</p>
            <p>{L.watch}</p>
            <p>{L.disclaimer}</p>
          </div>
        </section>
      </div>

      {/* Sticky savings bar on phones */}
      <div
        className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 pt-2.5 shadow-[0_-6px_20px_rgba(23,35,27,0.1)] lg:hidden print:hidden"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted">{L.bar_label}</span>
          <span className="text-xl font-bold tabular-nums text-accent">{headline}</span>
        </div>
        <button
          type="button"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2"
        >
          {L.bar_btn}
        </button>
      </div>
    </div>
  );
}
