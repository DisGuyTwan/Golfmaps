"use client";

import { useMemo, useState } from "react";
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

const RED = "#7a1010";

const inputCls =
  "w-full rounded-md border border-[#ccc] bg-white px-2.5 py-2 text-base text-[#222] focus:border-[#7a1010] focus:outline-none focus:ring-1 focus:ring-[#7a1010] print:py-0 print:text-[11px]";
const readonlyCls =
  "w-full rounded-md border border-[#ccc] bg-[#f5f0ec] px-2.5 py-2 text-base font-bold text-[#7a1010] print:py-0 print:text-[11px]";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 mt-3 block text-[13px] font-semibold text-[#444] print:mb-0 print:mt-0.5 print:text-[9px]">
      {children}
    </label>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 border-b-2 border-[#7a1010] pb-1.5 text-lg font-semibold text-[#7a1010] first:mt-0 print:mb-1 print:mt-2 print:pb-0.5 print:text-sm">
      {children}
    </h2>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] leading-relaxed text-[#999] print:mt-2 print:text-[8px]">{children}</p>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export default function RoiTab() {
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
    <div lang="fr-CA" className="roi-print h-full overflow-y-auto bg-[#f4f1ee] text-[#222] print:h-auto print:overflow-visible print:bg-white">
      <header className="px-4 py-5 text-white sm:px-8 print:px-0 print:py-2" style={{ background: RED }}>
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold print:text-lg">Calculateur ROI — Tonte Autonome Voyager</h1>
            <p className="mt-1 text-sm opacity-85 print:hidden">
              Ajustez les chiffres en direct pendant la rencontre. Tout se recalcule automatiquement.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-md border border-white/70 px-4 text-sm font-semibold text-white hover:bg-white/10 print:hidden"
          >
            Imprimer / PDF
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1300px] gap-6 p-4 sm:p-6 min-[800px]:grid-cols-[1fr_1.3fr] print:grid-cols-[1fr_1.3fr] print:gap-3 print:p-0 print:pt-2">
        {/* Inputs */}
        <section className="min-w-0 rounded-[10px] bg-white px-5 py-5 shadow-sm print:px-2 print:py-1 print:shadow-none">
          <H2>Voyager</H2>

          <Label htmlFor="model">Modèle</Label>
          <select
            id="model"
            value={model}
            onChange={(e) => changeModel(e.target.value as VoyagerModel)}
            className={inputCls}
          >
            <option value="7">7 acres/jour — 85 000 $ (batterie 10 kWh)</option>
            <option value="19">19 acres/jour (60 po) — 115 000 $ (batterie 30 kWh)</option>
            <option value="custom">Personnalisé</option>
          </select>

          <Label htmlFor="voyPrice">Prix d&apos;équipement ($)</Label>
          {field("voyPrice")}

          <Row>
            <div>
              <Label htmlFor="voyEnergy">Énergie / an ($) — auto</Label>
              <input id="voyEnergy" readOnly value={r.voyEnergy.toFixed(0)} className={readonlyCls} />
              <div className="mt-0.5 text-[11px] text-[#888] print:text-[8px]">
                ≈ {r.workDays.toFixed(0)} journées × {batteryKwh} kWh = {r.kwhPerSeason.toFixed(0)} kWh/saison
              </div>
            </div>
            <div>
              <Label htmlFor="voyMaint">Entretien / an ($)</Label>
              {field("voyMaint")}
            </div>
          </Row>

          <H2>Équipe zero-turn remplacée — saisonnier</H2>

          <Row>
            <div>
              <Label htmlFor="wage">Salaire horaire ($/h)</Label>
              {field("wage", { step: 0.01 })}
            </div>
            <div>
              <Label htmlFor="burden">Charges sociales (%)</Label>
              {field("burden", { step: 0.5 })}
            </div>
          </Row>

          <Row>
            <div>
              <Label htmlFor="weeks">Nombre de semaines / saison</Label>
              {field("weeks", { min: 1 })}
            </div>
            <div>
              <Label htmlFor="hoursPerWeek">Heures / semaine</Label>
              {field("hoursPerWeek", { min: 1 })}
            </div>
          </Row>
          <div className="mt-1 text-xs font-semibold text-[#7a1010] print:text-[9px]">
            = {r.totalHours.toLocaleString("fr-CA")} heures / saison
          </div>

          <Row>
            <div>
              <Label htmlFor="ztMowHrs">Heures de tonte / jour — zero-turn</Label>
              {field("ztMowHrs", { step: 0.5, min: 0 })}
              <div className="mt-0.5 text-[11px] text-[#888] print:text-[8px]">
                Quart de 8 h moins déplacements, dîner, pauses
              </div>
            </div>
            <div>
              <Label htmlFor="voyMowHrs">Heures de tonte / jour — Voyager</Label>
              {field("voyMowHrs", { step: 0.5, min: 0 })}
            </div>
          </Row>
          <div className="mt-1 text-xs font-semibold text-[#7a1010] print:text-[9px]">
            = {fmtNumber(r.ztMowTotal)} h de tonte zero-turn / {fmtNumber(r.voyMowTotal)} h Voyager par saison
          </div>

          <Label htmlFor="ztPrice">Prix tondeuse zero-turn ($)</Label>
          {field("ztPrice")}

          <Row>
            <div>
              <Label htmlFor="ztLph">Consommation (L/h)</Label>
              {field("ztLph", { step: 0.1 })}
            </div>
            <div>
              <Label htmlFor="gasPrice">Prix essence ($/L)</Label>
              {field("gasPrice", { step: 0.01 })}
            </div>
          </Row>

          <Row>
            <div>
              <Label htmlFor="ztFuel">Essence / saison ($) — auto</Label>
              <input id="ztFuel" readOnly value={r.ztFuel.toFixed(0)} className={readonlyCls} />
              <div className="mt-0.5 text-[11px] text-[#888] print:text-[8px]">
                ≈ {Math.round(r.ztMowTotal)} h × {num(fields.ztLph)} L/h = {fmtNumber(r.ztLitres)} L/saison
              </div>
            </div>
            <div>
              <Label htmlFor="ztMaint">Entretien / saison ($)</Label>
              {field("ztMaint")}
            </div>
          </Row>

          <H2>Horizon</H2>

          <Label htmlFor="years">Horizon (années)</Label>
          {field("years", { min: 1, max: 10 })}

          <Note>
            Salaire par défaut (23 $/h) : médiane québécoise de 22 $/h pour les manœuvres en aménagement paysager
            (CNP 85121, Québec.ca, moyenne 2023-2025), ajustée pour un opérateur de tondeuse commerciale. Charges
            sociales par défaut (25 %) : RRQ 6,3 % + AE ≈ 1,82 % + RQAP 0,602 % + FSS 1,65 à 4,26 % + vacances 4 % +
            jours fériés + CNESST (taux aménagement paysager à confirmer). Zero-turn 60 po commercial (25 000 $) :
            Exmark Lazer Z X et Toro Z Master 6000 affichés à environ 18 800 à 19 600 $ US, convertis en $ CA avec
            escompte concessionnaire. Essence calculée automatiquement : 5,3 L/h (fiche John Deere Z965M, 60 po) ×
            heures de tonte réelles × environ 1,80 $/L (essence ordinaire Montréal, août 2026). Entretien zero-turn
            (3 000 $/saison) : estimation, non vérifiée. Énergie Voyager calculée automatiquement : une charge
            complète par journée de travail de 8 h, selon la capacité de batterie du modèle choisi, facturée au tarif G
            d&apos;Hydro-Québec, tarif commercial petite puissance (12,388 ¢/kWh, premier bloc, en vigueur au 1er avril
            2026).
          </Note>
        </section>

        {/* Outputs */}
        <section className="min-w-0 rounded-[10px] bg-white px-5 py-5 shadow-sm print:px-2 print:py-1 print:shadow-none">
          <H2>Comparaison des coûts</H2>
          <table className="w-full border-collapse text-sm print:text-[10px]">
            <thead>
              <tr className="bg-[#f0e9e4] text-[#7a1010]">
                <th className="px-2.5 py-2 text-left" />
                <th className="px-2.5 py-2 text-right">Zero-turn</th>
                <th className="px-2.5 py-2 text-right">Voyager</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Équipement", r.zt.equip, r.voy.equip],
                  ["Énergie", r.zt.energy, r.voy.energy],
                  ["Entretien", r.zt.maint, r.voy.maint],
                  ["Main-d'œuvre", r.zt.labor, 0],
                ] as const
              ).map(([label, zt, voy]) => (
                <tr key={label} className="border-b border-[#e5e0da]">
                  <td className="px-2.5 py-2 print:py-0.5">{label}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtMoney(zt)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtMoney(voy)}</td>
                </tr>
              ))}
              <tr className="bg-[#fbf3ee] font-bold">
                <td className="px-2.5 py-2 print:py-0.5">Total</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtMoney(r.zt.total)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtMoney(r.voy.total)}</td>
              </tr>
            </tbody>
          </table>

          <H2>Combien de PLUS ils peuvent faire</H2>
          <div className="mt-3 rounded-md border-l-4 border-[#4a0808] px-4 py-3.5 text-white print:py-1.5" style={{ background: RED }}>
            <div className="text-[15px] font-bold">Profit récupéré sur le travail existant</div>
            <div className="my-0.5 text-[22px] font-extrabold tabular-nums print:text-base">
              {fmtMoney(r.annualProfit)} / an
            </div>
            <div className="text-xs text-[#f0d9d9]">
              <span className="tabular-nums">{fmtMoney(r.savings)}</span>{" sur l'horizon complet"}
            </div>
          </div>

          <H2>Coût par heure de tonte (annuel)</H2>
          <div className="grid gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            {(
              [
                {
                  title: "Homme + zero-turn",
                  hours: r.ztMowTotal,
                  annual: r.ztAnnual,
                  rows: [
                    ["Amortissement", fmtMoney(r.ztDep)],
                    ["Entretien / réparations", fmtMoney(num(fields.ztMaint))],
                    ["Essence", fmtMoney(r.ztFuel)],
                    ["Main-d'œuvre (heures payées)", fmtMoney(r.annualLabor)],
                  ],
                  cph: r.ztCph,
                },
                {
                  title: "Voyager",
                  hours: r.voyMowTotal,
                  annual: r.voyAnnual,
                  rows: [
                    ["Amortissement", fmtMoney(r.voyDep)],
                    ["Entretien / lames", fmtMoney(num(fields.voyMaint))],
                    ["Électricité", fmtMoney(r.voyEnergy)],
                    ["Main-d'œuvre", "0 $"],
                  ],
                  cph: r.voyCph,
                },
              ] as const
            ).map((col) => (
              <table key={col.title} className="w-full border-collapse text-sm print:text-[10px]">
                <thead>
                  <tr className="bg-[#f0e9e4] text-[#7a1010]">
                    <th className="px-2.5 py-2 text-left print:py-1" colSpan={2}>
                      {col.title}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#e5e0da]">
                    <td className="px-2.5 py-2 print:py-0.5">Heures de tonte / saison</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtNumber(col.hours)} h</td>
                  </tr>
                  <tr className="border-b border-[#e5e0da]">
                    <td className="px-2.5 py-2 print:py-0.5">Coût d&apos;exploitation / an</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-0.5">{fmtMoney(col.annual)}</td>
                  </tr>
                  {col.rows.map(([label, value]) => (
                    <tr key={label} className="border-b border-[#e5e0da] text-xs text-[#666] print:text-[9px]">
                      <td className="py-1 pl-6 pr-2.5 print:py-0">{label}</td>
                      <td className="whitespace-nowrap px-2.5 py-1 text-right tabular-nums print:py-0">{value}</td>
                    </tr>
                  ))}
                  <tr className="text-[15px] font-extrabold text-white print:text-[11px]" style={{ background: RED }}>
                    <td className="px-2.5 py-2 print:py-1">Coût / heure de tonte</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums print:py-1">{fmtMoney2(col.cph)}</td>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
          {r.ztCph > 0 && (
            <div className="mt-3 text-center text-[15px] font-bold text-[#7a1010] print:text-xs">
              Économie : {fmtMoney2(cphSaving)} par heure de tonte ({Math.round((1 - r.voyCph / r.ztCph) * 100)} % de
              moins)
            </div>
          )}
          <Note>
            Amortissement linéaire sur l&apos;horizon choisi, sans valeur résiduelle. Main-d&apos;œuvre zero-turn =
            toutes les heures payées (pas seulement les heures de tonte), car l&apos;employé est payé pour son quart
            complet.
          </Note>

          <H2>Délai de récupération et rendement</H2>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            {(
              [
                ["Délai de récupération", formatPayback(r.paybackMonths)],
                ["ROI sur l'horizon", formatRoi(r.roiPct)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg p-4 text-center text-white print:p-2" style={{ background: RED }}>
                <div className="text-xs uppercase tracking-wide opacity-85">{label}</div>
                <div className="mt-1 text-[28px] font-extrabold tabular-nums print:text-lg">{value}</div>
              </div>
            ))}
          </div>
          <Note>
            Investissement net = prix Voyager − prix zero-turn évité. Économies d&apos;exploitation / an = (main-d&apos;œuvre
            + essence + entretien zero-turn) − (électricité + entretien Voyager). Délai de récupération = investissement
            net ÷ économies d&apos;exploitation / an, exprimé en années et mois. ROI = (économies d&apos;exploitation sur
            l&apos;horizon − investissement net) ÷ investissement net.
          </Note>
        </section>
      </div>
    </div>
  );
}
