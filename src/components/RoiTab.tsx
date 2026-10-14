"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/lib/i18n";
import { DEFAULT_INCENTIVE_INPUTS, computeIncentives, describeInputs } from "@/lib/incentives";
import { useLang } from "@/lib/preferences";
import { quoteAcres } from "@/lib/quote";
import { useIncentiveProfile, useMeasurement, useQuoteSettings, useRoiImport } from "@/lib/quote-store";
import { ROI_COPY } from "@/lib/roi-copy";
import {
  ROI_DEFAULTS,
  VOYAGER_PRESETS,
  computeRoi,
  fmtMoney,
  fmtMoney2,
  fmtNumber,
  formatPayback,
  formatRoi,
  type RoiInputs,
  type VoyagerModel,
  type ZeroTurnStatus,
} from "@/lib/roi";
import { buildShareUrl, prefixed, readParams } from "@/lib/share";
import { TabHeader, ui } from "./ui";

type NumericKey = Exclude<keyof RoiInputs, "batteryKwh" | "ztStatus" | "incentives">;
/** Field values stay strings so they can be cleared and retyped live. */
type Fields = Record<NumericKey, string>;
/** Which incentives from the Incentives tab reduce the Voyager investment. */
type IncMode = "none" | "low" | "high";

const NUMERIC_KEYS = (Object.keys(ROI_DEFAULTS) as (keyof RoiInputs)[]).filter(
  (k): k is NumericKey => k !== "batteryKwh" && k !== "ztStatus" && k !== "incentives",
);

const toFields = (i: RoiInputs): Fields =>
  Object.fromEntries(
    NUMERIC_KEYS.map((k) => [k, k === "gasPrice" ? i.gasPrice.toFixed(2) : String(i[k])]),
  ) as Fields;

/** Same as the original `+input.value`: an empty field counts as 0. */
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const isModel = (v: string | undefined): v is VoyagerModel => v === "7" || v === "19" || v === "custom";
const isIncMode = (v: string | undefined): v is IncMode => v === "none" || v === "low" || v === "high";

/** Defaults, overridden by a share link's r_ parameters (r_area=60, r_model=19, …). */
function initialState() {
  const link = readParams(window.location.search, "r_");
  const fields = toFields(ROI_DEFAULTS);
  for (const key of NUMERIC_KEYS) {
    if (link[key] !== undefined && Number.isFinite(Number(link[key]))) fields[key] = link[key];
  }
  const battery = Number(link.battery);
  return {
    fields,
    model: isModel(link.model) ? link.model : ("7" as VoyagerModel),
    batteryKwh: Number.isFinite(battery) && battery > 0 ? battery : ROI_DEFAULTS.batteryKwh,
    ztStatus: (link.ztStatus === "own" ? "own" : "replace") as ZeroTurnStatus,
    incMode: isIncMode(link.inc) ? link.inc : ("low" as IncMode),
    gasFromLink: link.gasPrice !== undefined,
  };
}

// The print versions shrink everything so the summary fits one Letter page.
const inputCls = `${ui.input} print:py-0 print:text-[11px]`;
const readonlyCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-base font-bold text-accent tabular-nums print:py-0 print:text-[11px]";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={`${ui.label} mb-1 mt-3 block print:mb-0 print:mt-0.5 print:text-[9px]`}>
      {children}
    </label>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className={`${ui.h2} mb-2 mt-6 border-b border-line pb-1.5 first:mt-0 print:mb-1 print:mt-2 print:pb-0.5 print:text-sm`}>
      {children}
    </h2>
  );
}

/** Source and date of a default, or how an auto value is computed. Screen only. */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-muted print:hidden">{children}</p>;
}

/** A computed line under a group of inputs (e.g. "= 35 acres to mow per week"). */
function Derived({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs font-semibold text-accent print:text-[9px]">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className={`${ui.note} mt-4 print:mt-2 print:text-[8px]`}>{children}</p>;
}

/**
 * Two inputs side by side. In print each becomes "label … value" on one line,
 * so the input column stays short enough for a one-page PDF.
 */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 print:gap-y-0.5 print:[&>div]:flex print:[&>div]:items-center print:[&>div]:gap-2 print:[&_input]:w-20 print:[&_input]:shrink-0 print:[&_input]:text-right print:[&_label]:m-0 print:[&_label]:flex-1">
      {children}
    </div>
  );
}

export default function RoiTab() {
  const lang = useLang();
  const t = ROI_COPY[lang];
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const money = (n: number) => fmtMoney(n, lang);
  const count = (n: number) => fmtNumber(n, lang);
  const decimal = (n: number, digits = 2) => n.toLocaleString(locale, { maximumFractionDigits: digits });

  const [initial] = useState(initialState);
  const [model, setModel] = useState<VoyagerModel>(initial.model);
  const [batteryKwh, setBatteryKwh] = useState(initial.batteryKwh);
  const [fields, setFields] = useState<Fields>(initial.fields);
  const [ztStatus, setZtStatus] = useState<ZeroTurnStatus>(initial.ztStatus);
  const [incMode, setIncMode] = useState<IncMode>(initial.incMode);

  // Acreage sent from the Acreage tab ("Send to ROI"): applied once per send.
  const roiImport = useRoiImport();
  const [seenImport, setSeenImport] = useState(0);
  if (roiImport && roiImport.version !== seenImport) {
    setSeenImport(roiImport.version);
    setFields((prev) => ({ ...prev, area: String(Math.round(roiImport.acres * 100) / 100) }));
  }
  const measuredAcres = quoteAcres(useMeasurement(), useQuoteSettings());

  // Live gas price (Statistics Canada via /api/gas-price), unless the price
  // came from a share link or the user typed one; otherwise the dated default.
  const gasTouched = useRef(initial.gasFromLink);
  const [gasLivePeriod, setGasLivePeriod] = useState<string | null>(null);
  const [gasEdited, setGasEdited] = useState(initial.gasFromLink);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/gas-price")
      .then((res) => (res.ok ? res.json() : null))
      .then((gas: { price?: unknown; period?: unknown } | null) => {
        if (cancelled || gasTouched.current || !gas) return;
        if (typeof gas.price !== "number" || typeof gas.period !== "string") return;
        const price = gas.price;
        setFields((prev) => ({ ...prev, gasPrice: price.toFixed(2) }));
        setGasLivePeriod(gas.period);
      })
      .catch(() => {
        /* keep the dated default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const base = useMemo<RoiInputs>(() => {
    const parsed = Object.fromEntries(NUMERIC_KEYS.map((k) => [k, num(fields[k])])) as Record<NumericKey, number>;
    return { ...parsed, batteryKwh, ztStatus, incentives: 0 };
  }, [fields, batteryKwh, ztStatus]);

  // Incentives for this Voyager purchase, priced with the Incentives tab's profile.
  const sized = useMemo(() => computeRoi(base), [base]);
  const profile = useIncentiveProfile() ?? DEFAULT_INCENTIVE_INPUTS;
  const incentives = useMemo(() => {
    const s = { ...profile, buyRobot: true, robotAmt: sized.units * base.voyPrice, buyTools: false, toolAmt: 0 };
    const res = computeIncentives(s, lang);
    return { low: res.keptLow, high: res.keptHigh, profile: describeInputs(s, res, lang).profile };
  }, [profile, sized.units, base.voyPrice, lang]);
  const credit = incMode === "low" ? incentives.low : incMode === "high" ? incentives.high : 0;
  const r = useMemo(() => computeRoi({ ...base, incentives: credit }), [base, credit]);

  const changeModel = (next: VoyagerModel) => {
    setModel(next);
    if (next === "custom") return;
    const preset = VOYAGER_PRESETS[next];
    setBatteryKwh(preset.batteryKwh);
    setFields((prev) => ({
      ...prev,
      voyPrice: String(preset.voyPrice),
      voyMaint: String(preset.voyMaint),
      voyAcresPerDay: String(preset.voyAcresPerDay),
    }));
  };

  const field = (key: NumericKey, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={key}
      type="number"
      inputMode="decimal"
      value={fields[key]}
      onChange={(e) => {
        if (key === "gasPrice") {
          gasTouched.current = true;
          setGasEdited(true);
        }
        setFields((prev) => ({ ...prev, [key]: e.target.value }));
      }}
      className={inputCls}
      {...props}
    />
  );

  const shareUrl = () =>
    buildShareUrl(
      window.location,
      prefixed("r_", { ...fields, model, battery: batteryKwh, ztStatus, inc: incMode }),
      "#roi",
    );

  const gasMonth = gasLivePeriod
    ? new Date(`${gasLivePeriod}-15T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })
    : null;
  const cpaSaving = r.ztCpa - r.voyCpa;

  return (
    // Printed at 80% so the client summary fits one Letter page.
    <div className="h-full overflow-y-auto bg-canvas text-ink print:h-auto print:overflow-visible print:bg-white print:[zoom:0.8]">
      <TabHeader
        lang={lang}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        printTitle={`Kress - ${UI[lang].tabs.roi}`}
        getShareUrl={shareUrl}
      />

      <div className={`${ui.container} grid gap-6 py-6 min-[800px]:grid-cols-[1fr_1.3fr] print:max-w-none print:grid-cols-[1.15fr_1fr] print:gap-3 print:px-0 print:py-2`}>
        {/* Inputs */}
        <section className={`${ui.card} min-w-0 print:border-0 print:px-2 print:py-1`}>
          <H2>{t.site}</H2>
          <Row>
            <div>
              <Label htmlFor="area">{t.area}</Label>
              {field("area", { min: 0, step: 0.5 })}
            </div>
            <div>
              <Label htmlFor="mowsPerWeek">{t.mowsPerWeek}</Label>
              {field("mowsPerWeek", { min: 0, step: 0.5 })}
            </div>
          </Row>
          {measuredAcres !== null && Math.abs(measuredAcres - num(fields.area)) > 0.005 && (
            <button
              type="button"
              onClick={() => setFields((prev) => ({ ...prev, area: String(Math.round(measuredAcres * 100) / 100) }))}
              className="mt-2 text-sm font-semibold text-accent underline underline-offset-2 print:hidden"
            >
              {t.useAcreage(decimal(measuredAcres))}
            </button>
          )}
          <Derived>{t.weeklyAcres(decimal(r.weeklyAcres, 1))}</Derived>

          <H2>Voyager</H2>
          <Label htmlFor="model">{t.model}</Label>
          <select id="model" value={model} onChange={(e) => changeModel(e.target.value as VoyagerModel)} className={inputCls}>
            <option value="7">{t.model7}</option>
            <option value="19">{t.model19}</option>
            <option value="custom">{t.modelCustom}</option>
          </select>

          <Row>
            <div>
              <Label htmlFor="voyPrice">{t.voyPrice}</Label>
              {field("voyPrice")}
              <Hint>{t.asOf.price}</Hint>
            </div>
            <div>
              <Label htmlFor="voyAcresPerDay">{t.voyAcresPerDay}</Label>
              {field("voyAcresPerDay", { min: 0, step: 0.5 })}
              <Hint>{t.asOf.capacity}</Hint>
            </div>
          </Row>
          <Row>
            <div>
              <Label htmlFor="voyDaysPerWeek">{t.voyDaysPerWeek}</Label>
              {field("voyDaysPerWeek", { min: 1, max: 7 })}
              <Hint>{t.voyDaysHint}</Hint>
            </div>
            <div>
              <Label htmlFor="supHrs">{t.supHrs}</Label>
              {field("supHrs", { min: 0, step: 0.25 })}
              <Hint>{t.supHint}</Hint>
            </div>
          </Row>
          <Row>
            <div>
              <Label htmlFor="voyEnergy">{t.voyEnergy}</Label>
              <input id="voyEnergy" readOnly value={r.voyEnergy.toFixed(0)} className={readonlyCls} />
              <Hint>
                {t.energyHint(r.charges.toFixed(0), batteryKwh, r.kwhPerSeason.toFixed(0))} · {t.asOf.hq}
              </Hint>
            </div>
            <div>
              <Label htmlFor="voyMaint">{t.voyMaint}</Label>
              {field("voyMaint")}
              <Hint>{t.asOf.maint}</Hint>
            </div>
          </Row>
          <Derived>{t.fleet(r.units)}</Derived>

          <H2>{t.crew}</H2>
          <Row>
            <div>
              <Label htmlFor="wage">{t.wage}</Label>
              {field("wage", { step: 0.01 })}
              <Hint>{t.asOf.wage}</Hint>
            </div>
            <div>
              <Label htmlFor="burden">{t.burden}</Label>
              {field("burden", { step: 0.5 })}
              <Hint>{t.asOf.burden}</Hint>
            </div>
          </Row>
          <Row>
            <div>
              <Label htmlFor="weeks">{t.weeks}</Label>
              {field("weeks", { min: 1 })}
            </div>
            <div>
              <Label htmlFor="hoursPerWeek">{t.hoursPerWeek}</Label>
              {field("hoursPerWeek", { min: 1 })}
            </div>
          </Row>
          <Derived>{t.hoursPerSeason(r.totalHours.toLocaleString(locale))}</Derived>
          <Row>
            <div>
              <Label htmlFor="ztMowHrs">{t.ztMowHrs}</Label>
              {field("ztMowHrs", { step: 0.5, min: 0 })}
              <Hint>{t.ztMowHint}</Hint>
            </div>
            <div>
              <Label htmlFor="ztAcresPerHour">{t.ztAcresPerHour}</Label>
              {field("ztAcresPerHour", { step: 0.1, min: 0 })}
              <Hint>{t.asOf.ztRate}</Hint>
            </div>
          </Row>
          <Derived>{t.crewLine(decimal(r.crewFte), r.ztMachines, count(r.ztMowTotal))}</Derived>

          <Label htmlFor="ztStatus">{t.ztStatus}</Label>
          <select id="ztStatus" value={ztStatus} onChange={(e) => setZtStatus(e.target.value as ZeroTurnStatus)} className={inputCls}>
            <option value="replace">{t.ztReplace}</option>
            <option value="own">{t.ztOwn}</option>
          </select>
          <Row>
            <div>
              <Label htmlFor="ztPrice">{t.ztPrice}</Label>
              {field("ztPrice", { disabled: ztStatus === "own" })}
              <Hint>{t.asOf.ztPrice}</Hint>
            </div>
            <div>
              <Label htmlFor="ztResale">{t.ztResale}</Label>
              {field("ztResale", { disabled: ztStatus === "replace" })}
              <Hint>{t.asOf.resale}</Hint>
            </div>
          </Row>
          <Row>
            <div>
              <Label htmlFor="ztLph">{t.ztLph}</Label>
              {field("ztLph", { step: 0.1 })}
            </div>
            <div>
              <Label htmlFor="gasPrice">{t.gasPrice}</Label>
              {field("gasPrice", { step: 0.01 })}
              {!gasEdited && <Hint>{gasMonth ? t.asOf.gasLive(gasMonth) : t.asOf.gasDefault}</Hint>}
            </div>
          </Row>
          <Row>
            <div>
              <Label htmlFor="ztFuel">{t.ztFuel}</Label>
              <input id="ztFuel" readOnly value={r.ztFuel.toFixed(0)} className={readonlyCls} />
              <Hint>{t.fuelHint(count(r.ztMowTotal), String(num(fields.ztLph)), count(r.ztLitres))}</Hint>
            </div>
            <div>
              <Label htmlFor="ztMaint">{t.ztMaint}</Label>
              {field("ztMaint")}
              <Hint>{t.asOf.maint}</Hint>
            </div>
          </Row>

          <H2>{t.incSection}</H2>
          <Label htmlFor="incMode">{t.incMode}</Label>
          <select id="incMode" value={incMode} onChange={(e) => setIncMode(e.target.value as IncMode)} className={inputCls}>
            <option value="none">{t.incNone}</option>
            <option value="low">{t.incLow(money(incentives.low))}</option>
            <option value="high">{t.incHigh(money(incentives.high))}</option>
          </select>
          <Hint>{t.incHint(incentives.profile)}</Hint>

          <H2>{t.horizon}</H2>
          <Label htmlFor="years">{t.years}</Label>
          {field("years", { min: 1, max: 10 })}

          <div className="print:hidden">
            <Note>{t.sourcesNote}</Note>
          </div>
        </section>

        {/* Outputs */}
        <section className={`${ui.card} min-w-0 print:border-0 print:px-2 print:py-1`}>
          <H2>{t.comparison}</H2>
          <table className="w-full border-collapse text-sm print:text-[10px]">
            <thead>
              <tr className="bg-accent-soft text-accent-ink">
                <th className="px-2.5 py-2 text-left" />
                <th className="px-2.5 py-2 text-right">{t.colZt(r.ztMachines)}</th>
                <th className="px-2.5 py-2 text-right">{t.colVoy(r.units)}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t.equipment, r.zt.equip, r.voy.equip],
                  [t.energy, r.zt.energy, r.voy.energy],
                  [t.maintenance, r.zt.maint, r.voy.maint],
                  [`${t.labor} / ${t.supervision.toLowerCase()}`, r.zt.labor, r.voy.labor],
                ] as const
              ).map(([label, zt, voy]) => (
                <tr key={label} className="border-b border-line">
                  <td className="px-2.5 py-2 print:py-0.5">{label}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(zt)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(voy)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-bold">
                <td className="px-2.5 py-2 print:py-0.5">{t.total}</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(r.zt.total)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(r.voy.total)}</td>
              </tr>
            </tbody>
          </table>

          <H2>{t.doMore}</H2>
          <div className="mt-3 rounded-xl bg-brand px-5 py-4 text-white print:py-1.5">
            <div className="text-sm font-semibold text-white/85">{t.profitTitle}</div>
            <div className={`${ui.kpi} my-1 print:text-base`}>
              {money(r.annualProfit)} {t.perYear}
            </div>
            <div className="text-xs text-white/75">
              <span className="tabular-nums">{money(r.savings)}</span>
              {t.overHorizon}
            </div>
          </div>

          <H2>{t.cpaTitle}</H2>
          <div className="grid gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            {(
              [
                {
                  title: t.ztCrew,
                  annual: r.ztAnnual,
                  rows: [
                    [t.depreciation, money(r.ztDep)],
                    [t.ztMaintRow, money(r.ztMaintTotal)],
                    [t.fuel, money(r.ztFuel)],
                    [t.laborPaid, money(r.annualLabor)],
                  ],
                  cpa: r.ztCpa,
                },
                {
                  title: "Voyager",
                  annual: r.voyAnnual,
                  rows: [
                    [t.depreciation, money(r.voyDep)],
                    [t.voyMaintRow, money(r.voyMaintTotal)],
                    [t.electricity, money(r.voyEnergy)],
                    [t.supervision, money(r.supLabor)],
                  ],
                  cpa: r.voyCpa,
                },
              ] as const
            ).map((col) => (
              <table key={col.title} className="w-full border-collapse text-sm print:text-[10px]">
                <thead>
                  <tr className="bg-accent-soft text-accent-ink">
                    <th className="px-2.5 py-2 text-left print:py-1" colSpan={2}>
                      {col.title}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line">
                    <td className="px-2.5 py-2 print:py-0.5">{t.acresSeason}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{count(r.seasonAcres)} ac</td>
                  </tr>
                  <tr className="border-b border-line">
                    <td className="px-2.5 py-2 print:py-0.5">{t.opCostYear}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(col.annual)}</td>
                  </tr>
                  {col.rows.map(([label, value]) => (
                    <tr key={label} className="border-b border-line text-xs text-muted print:text-[9px]">
                      <td className="py-1 pl-6 pr-2.5 print:py-0">{label}</td>
                      <td className="whitespace-nowrap px-2.5 py-1 text-right tabular-nums print:py-0">{value}</td>
                    </tr>
                  ))}
                  <tr className="bg-brand text-sm font-bold text-white print:text-[11px]">
                    <td className="px-2.5 py-2 print:py-1">{t.cpaRow}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-1">{fmtMoney2(col.cpa, lang)}</td>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
          {r.ztCpa > 0 && (
            <div className="mt-3 text-center text-sm font-bold text-accent print:text-xs">
              {cpaSaving >= 0
                ? t.cpaSaving(fmtMoney2(cpaSaving, lang), Math.round((cpaSaving / r.ztCpa) * 100))
                : t.cpaMore(fmtMoney2(-cpaSaving, lang))}
            </div>
          )}
          <Note>{t.depreciationNote}</Note>

          <H2>{t.paybackTitle}</H2>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            {(
              [
                [t.payback, formatPayback(r.paybackMonths, lang)],
                [t.roiHorizon, formatRoi(r.roiPct, lang)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-brand p-4 text-center text-white print:p-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/80">{label}</div>
                <div className={`${ui.kpi} mt-1 print:text-lg`}>{value}</div>
              </div>
            ))}
          </div>
          <Note>{t.paybackNote}</Note>
        </section>

        {/* In print the sources run full width under both columns, to fit one page. */}
        <div className="hidden print:col-span-2 print:block print:px-2">
          <Note>{t.sourcesNote}</Note>
        </div>
      </div>
    </div>
  );
}
