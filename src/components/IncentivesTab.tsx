"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/lib/i18n";
import { useLang } from "@/lib/preferences";
import { setIncentiveProfile } from "@/lib/quote-store";
import { buildShareUrl, prefixed, readParams } from "@/lib/share";
import { Icon, type IconName } from "./icons";
import { Pop, SectionTitle, TabHeader, delay, ui } from "./ui";
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

/**
 * Defaults, overridden by a share link's i_ parameters (i_prov=ON, i_who=farm,
 * i_robotAmt=48000, …). Unknown or invalid values keep the default.
 */
function initialForm(): FormState {
  const link = readParams(window.location.search, "i_");
  const f = { ...DEFAULT_FORM };
  const pick = <V extends string>(value: string | undefined, allowed: readonly V[], fallback: V): V =>
    allowed.includes(value as V) ? (value as V) : fallback;
  const flag = (value: string | undefined, fallback: boolean) =>
    value === "1" ? true : value === "0" ? false : fallback;
  const amount = (value: string | undefined, fallback: string) =>
    value !== undefined && Number.isFinite(Number(value)) ? value : fallback;
  f.prov = pick(link.prov, ["QC", "ON"] as const, f.prov);
  f.who = pick(link.who, PROFILES, f.who);
  f.farm = pick(link.farm, FARM_TYPES, f.farm);
  f.mapaq = pick(link.mapaq, ["yes", "no", "unsure"] as const, f.mapaq);
  f.struct = pick(link.struct, STRUCTURES, f.struct);
  f.city = pick(link.city, CITIES, f.city);
  f.bonus = flag(link.bonus, f.bonus);
  f.buyRobot = flag(link.buyRobot, f.buyRobot);
  f.buyTools = flag(link.buyTools, f.buyTools);
  f.under500 = flag(link.under500, f.under500);
  f.taxRate = amount(link.taxRate, f.taxRate);
  f.robotAmt = amount(link.robotAmt, f.robotAmt);
  f.toolAmt = amount(link.toolAmt, f.toolAmt);
  return f;
}

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
          <span className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium leading-tight text-ink-2 transition-all duration-200 active:scale-95 peer-checked:border-brand peer-checked:shadow-sm peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-line py-5 first:border-t-0 first:pt-0">
      <legend className="contents">
        <span className={`flex items-center gap-3 ${ui.h2}`}>
          {/* Icon tile with the step number in its corner. */}
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon name={icon} className="h-[18px] w-[18px]" />
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">
              {n}
            </span>
          </span>
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
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2"
        >
          {label}
          <Icon name="external" className="h-3.5 w-3.5 print:hidden" />
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
  const [form, setForm] = useState<FormState>(initialForm);
  const [taxTouched, setTaxTouched] = useState(false);
  // A key rather than text, so the message follows a language switch.
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFail" | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const L = STRINGS[lang];
  const inputs = useMemo(() => toInputs(form), [form]);
  const result = useMemo(() => computeIncentives(inputs, lang), [inputs, lang]);

  // The ROI tab prices grants and credits for the Voyager with this profile.
  useEffect(() => setIncentiveProfile(inputs), [inputs]);

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
        lang={lang}
        icon="coins"
        eyebrow={L.eyebrow}
        title={L.h1}
        lede={L.lede}
        printTitle={`Calculator - ${UI[lang].tabs.incentives}`}
        getShareUrl={() => buildShareUrl(window.location, prefixed("i_", { ...form }), "#incentives")}
      />

      <div className={`${ui.container} grid gap-8 pb-28 pt-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:pb-12 print:max-w-none print:gap-4 print:px-4 print:pb-0 print:pt-3`}>
        {/* The form is for the meeting; the PDF shows the choices as text instead. */}
        <form onSubmit={(e) => e.preventDefault()} noValidate className={`${ui.enter} min-w-0 print:hidden`} style={delay(1)}>
          <Step n={1} icon="pin" title={L.s1}>
            <Chips
              name="prov"
              value={form.prov}
              onChange={(v) => set("prov", v)}
              options={(["QC", "ON"] as Province[]).map((p) => ({ value: p, label: L[`prov_${p}`] }))}
            />
          </Step>

          <Step n={2} icon="building" title={L.s2}>
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

          <Step n={3} icon="cart" title={L.s3}>
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

        <section
          ref={resultsRef}
          aria-live="polite"
          className={`${ui.enter} grid min-w-0 scroll-mt-4 gap-5 lg:sticky lg:top-4 print:gap-3`}
          style={delay(2)}
        >
          <dl className={`${ui.card} hidden gap-x-4 gap-y-1 text-sm print:grid print:grid-cols-[auto_1fr] print:py-3`}>
            <dt className="font-semibold text-ink-2">{L.sumProfile}</dt>
            <dd>{profile}</dd>
            <dt className="font-semibold text-ink-2">{L.sumBuy}</dt>
            <dd>{purchase}</dd>
          </dl>
          <div className={`${ui.card} grid gap-2 print:break-inside-avoid`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              <Icon name="wallet" className="h-3.5 w-3.5" />
              {L.kicker}
            </p>
            {/* Money kept and tax timing are different kinds of money, so they're never added up in the headline. */}
            <div className="grid gap-1">
              <p className={ui.label}>{L.keptLabel}</p>
              <p className={`${ui.kpi} text-accent`}>
                <Pop value={rangeText(result.keptLow, result.keptHigh, lang)} />
              </p>
              <p className={ui.note}>{L.keptHelp}</p>
            </div>
            <div className="grid gap-1 border-t border-line pt-3">
              <p className={ui.label}>{L.timingLabel}</p>
              <p className="text-2xl font-bold leading-tight tabular-nums text-ink">
                <Pop value={rangeText(result.timingLow, result.timingHigh, lang)} />
              </p>
              <p className={ui.note}>{L.timingHelp}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3">
              <span className={ui.label}>{L.totalLabel}</span>
              <Pop value={headline} className="text-base font-bold tabular-nums text-ink" />
            </div>
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
              <SectionTitle icon="list">{L.breakdown}</SectionTitle>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {result.items.map((item) => (
                  <div key={item.t} className="grid animate-fade-in gap-1.5 px-4 py-3.5 print:animate-none print:break-inside-avoid">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold leading-snug text-ink">{item.t}</h3>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        {isZeroItem(item) ? "–" : rangeText(item.low, item.high, lang)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TagPill tag={item.tag} label={L.tag[item.tag]} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{L.kind[item.kind]}</span>
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
              <SectionTitle icon="layers">{L.programs}</SectionTitle>
              {result.cards.map((card) => (
                <article
                  key={card.t}
                  className={`grid animate-fade-in gap-1.5 rounded-xl px-4 py-3.5 print:animate-none print:break-inside-avoid ${card.info ? "bg-accent-soft" : "border border-line bg-surface"}`}
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
              <Icon name={copyStatus === "copied" ? "check" : "copy"} />
              {L.copy}
            </button>
            {copyStatus && (
              <span role="status" className="inline-flex animate-fade-in items-center gap-1.5 text-sm text-muted">
                <Icon name={copyStatus === "copied" ? "check" : "info"} className="h-3.5 w-3.5" />
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
        className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 pt-2.5 backdrop-blur shadow-[0_-6px_20px_rgba(23,35,27,0.1)] lg:hidden print:hidden"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-muted">{L.bar_label}</span>
          <Pop value={headline} className="text-xl font-bold tabular-nums text-accent" />
        </div>
        <button
          type="button"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2"
        >
          {L.bar_btn}
          <Icon name="arrowDown" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
