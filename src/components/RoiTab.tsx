"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/lib/i18n";
import { DEFAULT_INCENTIVE_INPUTS, computeIncentives, describeInputs } from "@/lib/incentives";
import { useLang } from "@/lib/preferences";
import { MOW_EVERY, acresForQuote, type MowEvery } from "@/lib/quote";
import { setRoiInputs, useIncentiveProfile, useLawn, useMeasurement, useMode, useQuoteSettings, useRoiImport, useSod } from "@/lib/quote-store";
import { ROI_COPY } from "@/lib/roi-copy";
import {
  DEFAULT_GAS_PERIOD,
  KR238_KWH_PER_ACRE,
  ROI_DEFAULTS,
  VOYAGER_PRESETS,
  computeRoi,
  fmtMoney,
  fmtMoney2,
  fmtNumber,
  formatPayback,
  formatRoi,
  isApproach,
  type Approach,
  type RoiInputs,
  type VoyagerModel,
  type ZeroTurnStatus,
} from "@/lib/roi";
import { buildShareUrl, prefixed, readParams } from "@/lib/share";
import { useRecords } from "@/lib/records-store";
import { Icon, type IconName } from "./icons";
import WindowPicker, { windowLine } from "./WindowPicker";
import { decodeWindow, encodeWindow, robotWindowShare, voyagerWindowShare, type MowWindow } from "@/lib/window";
import { Pop, SectionTitle, Segmented, TabHeader, delay, ui } from "./ui";

type NumericKey = Exclude<keyof RoiInputs, "batteryKwh" | "ztStatus" | "incentives" | "approach" | "mowEvery" | "window" | "calibration">;
/** Field values stay strings so they can be cleared and retyped live. */
type Fields = Record<NumericKey, string>;
/** Which incentives from the Incentives tab reduce the Voyager investment. */
type IncMode = "none" | "low" | "high";

const NOT_FIELDS = new Set<keyof RoiInputs>(["batteryKwh", "ztStatus", "incentives", "approach", "mowEvery", "window", "calibration"]);
const NUMERIC_KEYS = (Object.keys(ROI_DEFAULTS) as (keyof RoiInputs)[]).filter((k): k is NumericKey => !NOT_FIELDS.has(k));

const toFields = (i: RoiInputs): Fields =>
  Object.fromEntries(
    NUMERIC_KEYS.map((k) => [k, k === "gasPrice" ? i.gasPrice.toFixed(2) : String(i[k])]),
  ) as Fields;

/** Same as the original `+input.value`: an empty field counts as 0. */
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Inputs a client knows better than our defaults: when changed, they're listed as the client's figures. */
const CLIENT_KEYS: NumericKey[] = [
  "wage",
  "burden",
  "weeks",
  "hoursPerWeek",
  "ztMowHrs",
  "ztAcresPerHour",
  "ztPrice",
  "ztResale",
  "ztLph",
  "ztMaint",
  "voyDaysPerWeek",
  "supHrs",
  "kr238Checks",
];

const isModel = (v: string | undefined): v is VoyagerModel => v === "7" || v === "19" || v === "custom";
const isIncMode = (v: string | undefined): v is IncMode => v === "none" || v === "low" || v === "high";
const isEvery = (n: number): n is MowEvery => MOW_EVERY.includes(n as MowEvery);

/** Days between mowings from a link: r_every, or the nearest to an older link's mowings per week. */
function everyFromLink(link: Record<string, string>): MowEvery {
  const every = Number(link.every);
  if (isEvery(every)) return every;
  const perWeek = Number(link.mowsPerWeek);
  return perWeek > 0 ? (Math.min(3, Math.max(1, Math.round(7 / perWeek))) as MowEvery) : (ROI_DEFAULTS.mowEvery as MowEvery);
}

/** The acreage's likely range as shares of the area ("0.82-1.39"), from a link. */
function rangeFromLink(v: string | undefined): [number, number] | null {
  const m = v?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const [lo, hi] = [Number(m[1]), Number(m[2])];
  return lo > 0 && lo <= 1 && hi >= 1 && hi < 5 ? [lo, hi] : null;
}

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
    approach: isApproach(link.how) ? link.how : ROI_DEFAULTS.approach,
    every: everyFromLink(link),
    window: decodeWindow(link.win),
    range: rangeFromLink(link.range),
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

function H2({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <SectionTitle
      icon={icon}
      className="mb-2 mt-6 border-b border-line pb-1.5 first:mt-0 print:mb-1 print:mt-2 print:pb-0.5 print:text-sm"
    >
      {children}
    </SectionTitle>
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

/** "label … value" in print, for a choice made with buttons on screen. */
function PrintLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden items-center gap-2 print:mt-0.5 print:flex">
      <span className={`${ui.label} flex-1 text-[9px]`}>{label}</span>
      <span className="text-[11px] font-semibold">{value}</span>
    </div>
  );
}

/** One question answered with buttons (screen), or one line (print). */
function Choice<T extends string | number>({
  label,
  short,
  value,
  options,
  onChange,
}: {
  label: string;
  /** The label in print. */
  short: string;
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <>
      <div className="print:hidden">
        <div className={`${ui.label} mb-1 mt-3 block`}>{label}</div>
        <Segmented label={label} value={value} options={options} onChange={onChange} size="md" />
      </div>
      <PrintLine label={short} value={options.find((o) => o.value === value)?.label ?? ""} />
    </>
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
  const [approach, setApproach] = useState<Approach>(initial.approach);
  const [every, setEvery] = useState<MowEvery>(initial.every);
  const [mowWindow, setMowWindow] = useState<MowWindow | null>(initial.window);
  // Field checks correct the robots' pace here as in the mower fit.
  const measured = useRecords().calibration;
  const calibration = useMemo(() => Object.fromEntries(Object.entries(measured).map(([id, c]) => [id, c.factor])), [measured]);
  // The acreage's likely range (shares of the area), from the Acreage tab: payback is shown across it.
  const [acreShares, setAcreShares] = useState<[number, number] | null>(initial.range);
  const [model, setModel] = useState<VoyagerModel>(initial.model);
  const [batteryKwh, setBatteryKwh] = useState(initial.batteryKwh);
  const [fields, setFields] = useState<Fields>(initial.fields);
  const [ztStatus, setZtStatus] = useState<ZeroTurnStatus>(initial.ztStatus);
  const [incMode, setIncMode] = useState<IncMode>(initial.incMode);

  // Acreage sent from the Acreage tab ("Send to ROI"), with how the robots work, how often and the
  // layout's extra time from the mower fit: applied once per send.
  const roiImport = useRoiImport();
  const [seenImport, setSeenImport] = useState(0);
  if (roiImport && roiImport.version !== seenImport) {
    setSeenImport(roiImport.version);
    const preset = roiImport.model ? VOYAGER_PRESETS[roiImport.model as "7" | "19"] : null;
    if (preset) {
      setModel(roiImport.model!);
      setBatteryKwh(preset.batteryKwh);
    }
    if (roiImport.approach) setApproach(roiImport.approach);
    if (roiImport.every) setEvery(roiImport.every);
    setMowWindow(roiImport.window);
    setAcreShares(roiImport.range);
    setFields((prev) => ({
      ...prev,
      area: String(Math.round(roiImport.acres * 100) / 100),
      ...(roiImport.layoutPct !== null && { layoutPct: String(roiImport.layoutPct) }),
      ...(preset && {
        voyPrice: String(preset.voyPrice),
        voyMaint: String(preset.voyMaint),
        voyAcresPerDay: String(preset.voyAcresPerDay),
      }),
    }));
  }
  const measuredAcres = acresForQuote(useMode(), useMeasurement(), useSod(), useQuoteSettings(), useLawn());

  // Live gas price (Statistics Canada via /api/gas-price), unless the price
  // came from a share link or the user typed one; otherwise the dated default.
  const gasTouched = useRef(initial.gasFromLink);
  const paybackRef = useRef<HTMLDivElement>(null);
  const [gasLivePeriod, setGasLivePeriod] = useState<string | null>(null);
  const [gasEdited, setGasEdited] = useState(initial.gasFromLink);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/gas-price")
      .then((res) => (res.ok ? res.json() : null))
      .then((gas: { price?: unknown; period?: unknown } | null) => {
        if (cancelled || gasTouched.current || !gas) return;
        if (typeof gas.price !== "number" || typeof gas.period !== "string") return;
        // StatCan lags a month or more: never replace a more recent default.
        if (gas.period < DEFAULT_GAS_PERIOD) return;
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
    return { ...parsed, approach, mowEvery: every, window: mowWindow, calibration, batteryKwh, ztStatus, incentives: 0 };
  }, [fields, approach, every, mowWindow, calibration, batteryKwh, ztStatus]);

  // Incentives for this robot purchase, priced with the Incentives tab's profile.
  const sized = useMemo(() => computeRoi(base), [base]);
  const profile = useIncentiveProfile() ?? DEFAULT_INCENTIVE_INPUTS;
  const incentives = useMemo(() => {
    const s = { ...profile, buyRobot: true, robotAmt: sized.robotGross, buyTools: false, toolAmt: 0 };
    const res = computeIncentives(s, lang);
    return { low: res.keptLow, high: res.keptHigh, profile: describeInputs(s, res, lang).profile };
  }, [profile, sized.robotGross, lang]);
  const credit = incMode === "low" ? incentives.low : incMode === "high" ? incentives.high : 0;
  const r = useMemo(() => computeRoi({ ...base, incentives: credit }), [base, credit]);
  // The client's crew figures, for a proposal's payback.
  useEffect(() => setRoiInputs(base), [base]);
  // Payback at both ends of the likely acreage (a smaller job needs fewer robots but saves less).
  const paybackSpan = useMemo(() => {
    if (!acreShares) return null;
    const at = (f: number) => computeRoi({ ...base, area: base.area * f, incentives: credit }).paybackMonths;
    const ends = [at(acreShares[0]), at(acreShares[1])].sort((a, b) => a - b);
    return ends.every(Number.isFinite) ? ends : null;
  }, [base, credit, acreShares]);

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
      prefixed("r_", {
        ...fields,
        every,
        ...(mowWindow && { win: encodeWindow(mowWindow) }),
        ...(acreShares && { range: acreShares.map((v) => v.toFixed(2)).join("-") }),
        how: approach,
        model,
        battery: batteryKwh,
        ztStatus,
        inc: incMode,
      }),
      "#roi",
    );

  const gasMonth = gasLivePeriod
    ? new Date(`${gasLivePeriod}-15T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })
    : null;
  const cpaSaving = r.ztCpa - r.voyCpa;
  // The client's own figures, so the PDF says which numbers are theirs and which are ours.
  const clientFigures = CLIENT_KEYS.filter((k) => fields[k] !== "" && num(fields[k]) !== ROI_DEFAULTS[k])
    .map((k) => `${t[k]} ${decimal(num(fields[k]))} (${t.ours(decimal(ROI_DEFAULTS[k] as number))})`)
    .join("; ");
  const stay = approach === "stay";
  const robotName = stay ? "KR238" : "Voyager";

  return (
    // Printed at 80% so the client summary fits one Letter page.
    <div className="h-full overflow-y-auto bg-canvas text-ink print:h-auto print:overflow-visible print:bg-white print:[zoom:0.8]">
      <TabHeader
        lang={lang}
        icon="trend"
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        printTitle={`Calculator - ${UI[lang].tabs.roi}`}
        getShareUrl={shareUrl}
      />

      <div className={`${ui.container} grid gap-6 pb-28 pt-6 min-[800px]:grid-cols-[1fr_1.3fr] print:max-w-none print:grid-cols-[1.15fr_1fr] print:gap-3 print:px-0 print:py-2`}>
        {/* Inputs */}
        <section className={`${ui.card} ${ui.enter} min-w-0 print:border-0 print:px-2 print:py-1`} style={delay(1)}>
          <H2 icon="map">{t.site}</H2>
          <Row>
            <div>
              <Label htmlFor="area">{t.area}</Label>
              {field("area", { min: 0, step: 0.5 })}
            </div>
          </Row>
          {measuredAcres !== null && Math.abs(measuredAcres - num(fields.area)) > 0.005 && (
            <button
              type="button"
              onClick={() => setFields((prev) => ({ ...prev, area: String(Math.round(measuredAcres * 100) / 100) }))}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-2 print:hidden"
            >
              <Icon name="ruler" className="h-3.5 w-3.5" />
              {t.useAcreage(decimal(measuredAcres))}
            </button>
          )}
          <Choice
            label={t.every}
            short={t.everyShort}
            value={every}
            options={MOW_EVERY.map((days) => ({ value: days, label: t.everyOptions[days] }))}
            onChange={setEvery}
          />
          <Derived>{t.weeklyAcres(decimal(r.mowsPerWeek, 1), decimal(r.weeklyAcres, 1))}</Derived>

          <H2 icon="mower">{t.robots}</H2>
          <Choice
            label={t.approach}
            short={t.approachShort}
            value={approach}
            options={(["stay", "go"] as const).map((a) => ({ value: a, label: t.approaches[a].name, sub: t.approaches[a].model }))}
            onChange={setApproach}
          />
          <Hint>{t.approaches[approach].hint}</Hint>
          <div className="mt-3 print:hidden">
            <WindowPicker
              lang={lang}
              value={mowWindow}
              onChange={setMowWindow}
              size="md"
              label={<div className={`${ui.label} mb-1 block`}>{UI[lang].fitWindow.question}</div>}
              share={stay ? robotWindowShare(mowWindow, 120) : voyagerWindowShare(mowWindow, 480, num(fields.voyDaysPerWeek))}
            />
          </div>
          <PrintLine label={UI[lang].fitWindow.label} value={windowLine(mowWindow, lang) ?? UI[lang].fitWindow.options.any} />

          {stay ? (
            <>
              <Row>
                <div>
                  <Label htmlFor="kr238Price">{t.kr238Price}</Label>
                  {field("kr238Price")}
                  <Hint>{t.asOf.kr238Price}</Hint>
                </div>
                <div>
                  <Label htmlFor="kr238Install">{t.kr238Install}</Label>
                  {field("kr238Install")}
                  <Hint>{t.asOf.install}</Hint>
                </div>
              </Row>
              <Row>
                <div>
                  <Label htmlFor="kr238Acres">{t.kr238Acres}</Label>
                  {field("kr238Acres", { min: 0, step: 0.5 })}
                  <Hint>{t.asOf.kr238Acres}</Hint>
                </div>
                <div>
                  <Label htmlFor="kr238Checks">{t.kr238Checks}</Label>
                  {field("kr238Checks", { min: 0, step: 0.25 })}
                  <Hint>{t.kr238ChecksHint}</Hint>
                </div>
              </Row>
              <Row>
                <div>
                  <Label htmlFor="kr238Energy">{t.kr238Energy}</Label>
                  <input id="kr238Energy" readOnly value={r.voyEnergy.toFixed(0)} className={readonlyCls} />
                  <Hint>
                    {t.kr238EnergyHint(count(r.kwhPerSeason / KR238_KWH_PER_ACRE), decimal(KR238_KWH_PER_ACRE, 1), count(r.kwhPerSeason))} ·{" "}
                    {t.asOf.hq}
                  </Hint>
                </div>
                <div>
                  <Label htmlFor="kr238Maint">{t.kr238Maint}</Label>
                  {field("kr238Maint")}
                  <Hint>{t.asOf.maint}</Hint>
                </div>
              </Row>
            </>
          ) : (
            <>
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
            </>
          )}
          <Row>
            <div>
              <Label htmlFor="layoutPct">{t.layoutPct}</Label>
              {field("layoutPct", { min: 0, step: 5 })}
            </div>
          </Row>
          <Hint>{t.layoutHint}</Hint>
          <Derived>{stay ? t.kr238Fleet(r.units, decimal(r.units > 0 ? num(fields.area) / r.units : 0, 1)) : t.fleet(r.units)}</Derived>

          <H2 icon="users">{t.crew}</H2>
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

          <H2 icon="coins">{t.incSection}</H2>
          <Label htmlFor="incMode">{t.incMode}</Label>
          <select id="incMode" value={incMode} onChange={(e) => setIncMode(e.target.value as IncMode)} className={inputCls}>
            <option value="none">{t.incNone}</option>
            <option value="low">{t.incLow(money(incentives.low))}</option>
            <option value="high">{t.incHigh(money(incentives.high))}</option>
          </select>
          <Hint>{t.incHint(incentives.profile)}</Hint>

          <H2 icon="calendar">{t.horizon}</H2>
          <Label htmlFor="years">{t.years}</Label>
          {field("years", { min: 1, max: 10 })}

          <div className="print:hidden">
            {clientFigures && <Note>{t.clientFigures(clientFigures)}</Note>}
            <Note>{t.sourcesNote(approach)}</Note>
          </div>
        </section>

        {/* Outputs */}
        <section className={`${ui.card} ${ui.enter} min-w-0 print:border-0 print:px-2 print:py-1`} style={delay(2)}>
          <H2 icon="scale">{t.comparison}</H2>
          <table className="w-full border-collapse text-sm print:text-[10px]">
            <thead>
              <tr className="bg-accent-soft text-accent-ink">
                <th className="px-2.5 py-2 text-left" />
                <th className="px-2.5 py-2 text-right">{t.colZt(r.ztMachines)}</th>
                <th className="px-2.5 py-2 text-right">{t.colVoy(robotName, r.units)}</th>
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

          <H2 icon="zap">{t.doMore}</H2>
          <div className="mt-3 rounded-xl bg-brand px-5 py-4 text-white print:py-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white/85">
              <Icon name="wallet" className="h-4 w-4" />
              {t.profitTitle}
            </div>
            <div className={`${ui.kpi} my-1 print:text-base`}>
              <Pop value={`${money(r.annualProfit)} ${t.perYear}`} />
            </div>
            <div className="text-xs text-white/75">
              <span className="tabular-nums">{money(r.savings)}</span>
              {t.overHorizon}
            </div>
          </div>

          <H2 icon="table">{t.cpaTitle}</H2>
          <div className="grid gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            {(
              [
                {
                  title: t.ztCrew,
                  icon: "users",
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
                  title: robotName,
                  icon: "mower",
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
                      <span className="flex items-center gap-1.5">
                        <Icon name={col.icon} className="h-4 w-4 print:h-3 print:w-3" />
                        {col.title}
                      </span>
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

          <div ref={paybackRef} className="scroll-mt-4">
          <H2 icon="clock">{t.paybackTitle}</H2>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            {(
              [
                [t.payback, formatPayback(r.paybackMonths, lang), "clock"],
                [t.roiHorizon, formatRoi(r.roiPct, lang), "trend"],
              ] as const
            ).map(([label, value, icon]) => (
              <div key={label} className="rounded-xl bg-brand p-4 text-center text-white print:p-2">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                  <Icon name={icon} className="h-3.5 w-3.5" />
                  {label}
                </div>
                <div className={`${ui.kpi} mt-1 print:text-lg`}>
                  <Pop value={value} />
                </div>
              </div>
            ))}
          </div>
          {paybackSpan && formatPayback(paybackSpan[0], lang) !== formatPayback(paybackSpan[1], lang) && (
            <p className="mt-2 text-center text-xs font-semibold text-accent print:text-[9px]">
              {UI[lang].sources.paybackRange(formatPayback(paybackSpan[0], lang), formatPayback(paybackSpan[1], lang))}
            </p>
          )}
          </div>
          <Note>{t.paybackNote}</Note>
        </section>

        {/* In print the sources run full width under both columns, to fit one page. */}
        <div className="hidden print:col-span-2 print:block print:px-2">
          {clientFigures && <Note>{t.clientFigures(clientFigures)}</Note>}
          <Note>{t.sourcesNote(approach)}</Note>
        </div>
      </div>

      {/* Sticky results bar, like the Incentives tab's savings bar. */}
      <div
        className="sticky bottom-0 z-10 border-t border-line bg-surface/95 shadow-[0_-6px_20px_rgba(23,35,27,0.1)] backdrop-blur print:hidden"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className={`${ui.container} flex items-center justify-between gap-4 pt-2.5`}>
          <div className="flex min-w-0 gap-5 sm:gap-8">
            {(
              [
                [t.payback, formatPayback(r.paybackMonths, lang), ""],
                ["ROI", formatRoi(r.roiPct, lang), ""],
                [t.barProfit, money(r.annualProfit), "hidden sm:block"],
              ] as const
            ).map(([label, value, extra]) => (
              <div key={label} className={`min-w-0 ${extra}`}>
                <span className="block truncate text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
                <Pop value={value} className="whitespace-nowrap text-xl font-bold tabular-nums text-accent" />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => paybackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2"
          >
            {t.barDetails}
            <Icon name="arrowDown" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
