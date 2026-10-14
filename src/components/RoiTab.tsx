"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/lib/preferences";
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
} from "@/lib/roi";

type NumericKey = Exclude<keyof RoiInputs, "batteryKwh">;
/** Field values stay strings so they can be cleared and retyped live. */
type Fields = Record<NumericKey, string>;

const toFields = (i: RoiInputs): Fields => ({
  voyPrice: String(i.voyPrice),
  voyMaint: String(i.voyMaint),
  wage: String(i.wage),
  burden: String(i.burden),
  weeks: String(i.weeks),
  hoursPerWeek: String(i.hoursPerWeek),
  ztMowHrs: String(i.ztMowHrs),
  voyMowHrs: String(i.voyMowHrs),
  ztPrice: String(i.ztPrice),
  ztLph: String(i.ztLph),
  gasPrice: i.gasPrice.toFixed(2),
  ztMaint: String(i.ztMaint),
  years: String(i.years),
});

/** Same as the original `+input.value`: an empty field counts as 0. */
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Filled boxes stay the brand red in both themes (white text on top). */
const RED = "#7a1010";

const inputCls =
  "w-full rounded-md border border-roi-border bg-roi-surface px-2.5 py-2 text-base text-roi-ink focus:border-roi-accent focus:outline-none focus:ring-1 focus:ring-roi-accent print:py-0 print:text-[11px]";
const readonlyCls =
  "w-full rounded-md border border-roi-border bg-roi-readonly px-2.5 py-2 text-base font-bold text-roi-accent print:py-0 print:text-[11px]";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 mt-3 block text-[13px] font-semibold text-roi-label print:mb-0 print:mt-0.5 print:text-[9px]">
      {children}
    </label>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 border-b-2 border-roi-accent pb-1.5 text-lg font-semibold text-roi-accent first:mt-0 print:mb-1 print:mt-2 print:pb-0.5 print:text-sm">
      {children}
    </h2>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] leading-relaxed text-roi-note print:mt-2 print:text-[8px]">{children}</p>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export default function RoiTab() {
  const lang = useLang();
  const t = ROI_COPY[lang];
  const money = (n: number) => fmtMoney(n, lang);
  const count = (n: number) => fmtNumber(n, lang);
  const [model, setModel] = useState<VoyagerModel>("7");
  const [batteryKwh, setBatteryKwh] = useState(ROI_DEFAULTS.batteryKwh);
  const [fields, setFields] = useState<Fields>(() => toFields(ROI_DEFAULTS));

  const inputs = useMemo<RoiInputs>(() => {
    const parsed = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, num(value)]),
    ) as Record<NumericKey, number>;
    return { ...parsed, batteryKwh };
  }, [fields, batteryKwh]);
  const r = useMemo(() => computeRoi(inputs), [inputs]);

  const changeModel = (next: VoyagerModel) => {
    setModel(next);
    if (next === "custom") return;
    const preset = VOYAGER_PRESETS[next];
    setBatteryKwh(preset.batteryKwh);
    setFields((prev) => ({ ...prev, voyPrice: String(preset.voyPrice), voyMaint: String(preset.voyMaint) }));
  };

  const field = (key: NumericKey, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={key}
      type="number"
      inputMode="decimal"
      value={fields[key]}
      onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
      className={inputCls}
      {...props}
    />
  );

  const cphSaving = r.ztCph > 0 ? r.ztCph - r.voyCph : 0;

  return (
    <div className="roi-print h-full overflow-y-auto bg-roi-canvas text-roi-ink print:h-auto print:overflow-visible print:bg-white">
      <header className="px-4 py-5 text-white sm:px-8 print:px-0 print:py-2" style={{ background: RED }}>
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold print:text-lg">{t.title}</h1>
            <p className="mt-1 text-sm opacity-85 print:hidden">{t.lede}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-md border border-white/70 px-4 text-sm font-semibold text-white hover:bg-white/10 print:hidden"
          >
            {t.print}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1300px] gap-6 p-4 sm:p-6 min-[800px]:grid-cols-[1fr_1.3fr] print:grid-cols-[1fr_1.3fr] print:gap-3 print:p-0 print:pt-2">
        {/* Inputs */}
        <section className="min-w-0 rounded-[10px] bg-roi-surface px-5 py-5 shadow-sm print:px-2 print:py-1 print:shadow-none">
          <H2>Voyager</H2>

          <Label htmlFor="model">{t.model}</Label>
          <select
            id="model"
            value={model}
            onChange={(e) => changeModel(e.target.value as VoyagerModel)}
            className={inputCls}
          >
            <option value="7">{t.model7}</option>
            <option value="19">{t.model19}</option>
            <option value="custom">{t.modelCustom}</option>
          </select>

          <Label htmlFor="voyPrice">{t.voyPrice}</Label>
          {field("voyPrice")}

          <Row>
            <div>
              <Label htmlFor="voyEnergy">{t.voyEnergy}</Label>
              <input id="voyEnergy" readOnly value={r.voyEnergy.toFixed(0)} className={readonlyCls} />
              <div className="mt-0.5 text-[11px] text-roi-hint print:text-[8px]">
                {t.energyHint(r.workDays.toFixed(0), batteryKwh, r.kwhPerSeason.toFixed(0))}
              </div>
            </div>
            <div>
              <Label htmlFor="voyMaint">{t.voyMaint}</Label>
              {field("voyMaint")}
            </div>
          </Row>

          <H2>{t.crew}</H2>

          <Row>
            <div>
              <Label htmlFor="wage">{t.wage}</Label>
              {field("wage", { step: 0.01 })}
            </div>
            <div>
              <Label htmlFor="burden">{t.burden}</Label>
              {field("burden", { step: 0.5 })}
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
          <div className="mt-1 text-xs font-semibold text-roi-accent print:text-[9px]">
            {t.hoursPerSeason(r.totalHours.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA"))}
          </div>

          <Row>
            <div>
              <Label htmlFor="ztMowHrs">{t.ztMowHrs}</Label>
              {field("ztMowHrs", { step: 0.5, min: 0 })}
              <div className="mt-0.5 text-[11px] text-roi-hint print:text-[8px]">{t.ztMowHint}</div>
            </div>
            <div>
              <Label htmlFor="voyMowHrs">{t.voyMowHrs}</Label>
              {field("voyMowHrs", { step: 0.5, min: 0 })}
            </div>
          </Row>
          <div className="mt-1 text-xs font-semibold text-roi-accent print:text-[9px]">
            {t.mowTotals(count(r.ztMowTotal), count(r.voyMowTotal))}
          </div>

          <Label htmlFor="ztPrice">{t.ztPrice}</Label>
          {field("ztPrice")}

          <Row>
            <div>
              <Label htmlFor="ztLph">{t.ztLph}</Label>
              {field("ztLph", { step: 0.1 })}
            </div>
            <div>
              <Label htmlFor="gasPrice">{t.gasPrice}</Label>
              {field("gasPrice", { step: 0.01 })}
            </div>
          </Row>

          <Row>
            <div>
              <Label htmlFor="ztFuel">{t.ztFuel}</Label>
              <input id="ztFuel" readOnly value={r.ztFuel.toFixed(0)} className={readonlyCls} />
              <div className="mt-0.5 text-[11px] text-roi-hint print:text-[8px]">
                {t.fuelHint(String(Math.round(r.ztMowTotal)), String(num(fields.ztLph)), count(r.ztLitres))}
              </div>
            </div>
            <div>
              <Label htmlFor="ztMaint">{t.ztMaint}</Label>
              {field("ztMaint")}
            </div>
          </Row>

          <H2>{t.horizon}</H2>

          <Label htmlFor="years">{t.years}</Label>
          {field("years", { min: 1, max: 10 })}

          <Note>{t.sourcesNote}</Note>
        </section>

        {/* Outputs */}
        <section className="min-w-0 rounded-[10px] bg-roi-surface px-5 py-5 shadow-sm print:px-2 print:py-1 print:shadow-none">
          <H2>{t.comparison}</H2>
          <table className="w-full border-collapse text-sm print:text-[10px]">
            <thead>
              <tr className="bg-roi-head text-roi-accent">
                <th className="px-2.5 py-2 text-left" />
                <th className="px-2.5 py-2 text-right">Zero-turn</th>
                <th className="px-2.5 py-2 text-right">Voyager</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t.equipment, r.zt.equip, r.voy.equip],
                  [t.energy, r.zt.energy, r.voy.energy],
                  [t.maintenance, r.zt.maint, r.voy.maint],
                  [t.labor, r.zt.labor, 0],
                ] as const
              ).map(([label, zt, voy]) => (
                <tr key={label} className="border-b border-roi-line">
                  <td className="px-2.5 py-2 print:py-0.5">{label}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(zt)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(voy)}</td>
                </tr>
              ))}
              <tr className="bg-roi-soft font-bold">
                <td className="px-2.5 py-2 print:py-0.5">{t.total}</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(r.zt.total)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(r.voy.total)}</td>
              </tr>
            </tbody>
          </table>

          <H2>{t.doMore}</H2>
          <div className="mt-3 rounded-md border-l-4 border-[#4a0808] px-4 py-3.5 text-white print:py-1.5" style={{ background: RED }}>
            <div className="text-[15px] font-bold">{t.profitTitle}</div>
            <div className="my-0.5 text-[22px] font-extrabold tabular-nums print:text-base">
              {money(r.annualProfit)} {t.perYear}
            </div>
            <div className="text-xs text-[#f0d9d9]">
              <span className="tabular-nums">{money(r.savings)}</span>
              {t.overHorizon}
            </div>
          </div>

          <H2>{t.cphTitle}</H2>
          <div className="grid gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            {(
              [
                {
                  title: t.ztCrew,
                  hours: r.ztMowTotal,
                  annual: r.ztAnnual,
                  rows: [
                    [t.depreciation, money(r.ztDep)],
                    [t.ztMaintRow, money(num(fields.ztMaint))],
                    [t.fuel, money(r.ztFuel)],
                    [t.laborPaid, money(r.annualLabor)],
                  ],
                  cph: r.ztCph,
                },
                {
                  title: "Voyager",
                  hours: r.voyMowTotal,
                  annual: r.voyAnnual,
                  rows: [
                    [t.depreciation, money(r.voyDep)],
                    [t.voyMaintRow, money(num(fields.voyMaint))],
                    [t.electricity, money(r.voyEnergy)],
                    [t.labor, money(0)],
                  ],
                  cph: r.voyCph,
                },
              ] as const
            ).map((col) => (
              <table key={col.title} className="w-full border-collapse text-sm print:text-[10px]">
                <thead>
                  <tr className="bg-roi-head text-roi-accent">
                    <th className="px-2.5 py-2 text-left print:py-1" colSpan={2}>
                      {col.title}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-roi-line">
                    <td className="px-2.5 py-2 print:py-0.5">{t.mowHoursSeason}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{count(col.hours)} h</td>
                  </tr>
                  <tr className="border-b border-roi-line">
                    <td className="px-2.5 py-2 print:py-0.5">{t.opCostYear}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{money(col.annual)}</td>
                  </tr>
                  {col.rows.map(([label, value]) => (
                    <tr key={label} className="border-b border-roi-line text-xs text-roi-sub print:text-[9px]">
                      <td className="py-1 pl-6 pr-2.5 print:py-0">{label}</td>
                      <td className="whitespace-nowrap px-2.5 py-1 text-right tabular-nums print:py-0">{value}</td>
                    </tr>
                  ))}
                  <tr className="text-[15px] font-extrabold text-white print:text-[11px]" style={{ background: RED }}>
                    <td className="px-2.5 py-2 print:py-1">{t.cphRow}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-1">{fmtMoney2(col.cph, lang)}</td>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
          {r.ztCph > 0 && (
            <div className="mt-3 text-center text-[15px] font-bold text-roi-accent print:text-xs">
              {t.cphSaving(fmtMoney2(cphSaving, lang), Math.round((1 - r.voyCph / r.ztCph) * 100))}
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
              <div key={label} className="rounded-lg p-4 text-center text-white print:p-2" style={{ background: RED }}>
                <div className="text-xs uppercase tracking-wide opacity-85">{label}</div>
                <div className="mt-1 text-[28px] font-extrabold tabular-nums print:text-lg">{value}</div>
              </div>
            ))}
          </div>
          <Note>{t.paybackNote}</Note>
        </section>
      </div>
    </div>
  );
}
