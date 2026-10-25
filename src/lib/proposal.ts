/**
 * One proposal instead of three PDFs: the property and how sure its numbers
 * are, a few options (the fleet recommended, the other way of working, the
 * next best), each priced (the dealer's unit prices or the rep's, the rep's
 * installation price beside the app's estimate, grants and credits off) with
 * its monthly payment and, for the commercial robots, its payback against
 * the zero-turn crew; financing, a validity date, the assumptions and the
 * track record. It's saved as a snapshot (ProposalData) so the client's page
 * shows what the rep sent, whatever changes after. Pure, so it's tested
 * without a browser.
 */
import { computeRoi, ROI_DEFAULTS, VOYAGER_PRESETS, type Approach, type RoiInputs } from "./roi";
import { mowerName, type Fit, type Mower, type Recommendation } from "./mowers";
import { installEstimate, monthlyPayment, UNIT_PRICES, type InstallEstimate } from "./prices";
import type { Assumption } from "./trust";
import type { MowWindow } from "./window";

/** A fleet of one or two robot models (golf with fairways: KR238s on the fairways, the rest by the chosen robot). */
export type FleetLine = { mower: Mower; units: number };

export interface ProposalLine {
  model: string;
  name: string;
  units: number;
  /** Price per unit (CAD, before taxes): the dealer's, the rep's, or null while neither is in. */
  unitPrice: number | null;
}

export interface ProposalOption {
  id: string;
  /** Why it's offered: the fleet recommended, the other way of working (cut and stay or go), the next best robot. */
  kind: "recommended" | "otherApproach" | "runnerUp";
  approach: Approach | null;
  lines: ProposalLine[];
  /** The app's installation estimate, and the rep's price (null: the estimate is used, and said so). */
  installEstimate: InstallEstimate;
  installPrice: number | null;
}

export interface Financing {
  ratePct: number;
  months: number;
  /** Paid up front (% of the net price). */
  downPct: number;
}

export interface PricedOption {
  equipment: number | null;
  install: number;
  /** Grants and credits kept (the Incentives tab's low end), taken off. */
  incentives: number;
  net: number | null;
  down: number | null;
  monthly: number | null;
  /** Against the zero-turn crew, for the commercial robots the ROI tab models (KR238s, Voyagers); null otherwise. */
  roi: { paybackMonths: number; savingsYear: number; crewMonthly: number; robotsMonthly: number } | null;
}

/** The fleets a recommendation offers: each with its robots (two models on a golf course with fairways). */
export function fleetOf(rec: Recommendation, which: "best" | "runnerUp"): FleetLine[] {
  const f: Fit | null = which === "best" ? rec.best : rec.runnerUp;
  if (!f) return [];
  // Golf with fairways: the fairways' KR238s and the rough's robots (the runner-up only changes the fairways' pick).
  const lines = [{ mower: f.mower, units: f.units }];
  if (which === "best" && rec.rough) {
    const same = lines.find((l) => l.mower.id === rec.rough!.mower.id);
    if (same) same.units += rec.rough.units;
    else lines.push({ mower: rec.rough.mower, units: rec.rough.units });
  }
  return lines;
}

const fleetKey = (lines: { model: string; units: number }[]) => lines.map((l) => `${l.units}x${l.model}`).join("+");

/**
 * The options a proposal offers: the fleet recommended for the way the
 * robots work, the other way (a golf course or a commercial site, when it
 * fits), and the next best robot; each different from the ones before.
 */
export function proposalOptions(
  rec: Recommendation,
  approach: Approach | null,
  other: Recommendation | null,
  edgeM: number,
  unitPrices: Record<string, number | null> = UNIT_PRICES,
): ProposalOption[] {
  const out: ProposalOption[] = [];
  const add = (kind: ProposalOption["kind"], fleet: FleetLine[], how: Approach | null) => {
    const key = fleetKey(fleet.map((l) => ({ model: l.mower.id, units: l.units })));
    if (!fleet.length || out.some((o) => fleetKey(o.lines) === key)) return;
    const estimate = fleet.reduce<InstallEstimate>(
      (t, l) => {
        const e = installEstimate(l.mower, l.units, edgeM / fleet.length);
        return { hours: t.hours + e.hours, labour: t.labour + e.labour, materials: t.materials + e.materials, total: t.total + e.total };
      },
      { hours: 0, labour: 0, materials: 0, total: 0 },
    );
    out.push({
      id: String.fromCharCode(97 + out.length),
      kind,
      approach: how,
      lines: fleet.map((l) => ({ model: l.mower.id, name: mowerName(l.mower), units: l.units, unitPrice: unitPrices[l.mower.id] ?? null })),
      installEstimate: estimate,
      installPrice: null,
    });
  };
  add("recommended", fleetOf(rec, "best"), approach);
  if (other && approach) add("otherApproach", fleetOf(other, "best"), approach === "stay" ? "go" : "stay");
  add("runnerUp", fleetOf(rec, "runnerUp"), approach);
  return out;
}

/** What the ROI tab needs to price an option against the crew: the job, and the client's crew. */
export interface RoiJob {
  acres: number;
  mowEvery: number;
  window: MowWindow | null;
  layoutPct: number;
  /** The ROI tab's inputs when it's been opened (the client's crew figures), else its defaults. */
  base?: Partial<RoiInputs>;
  /** The field checks' pace per model (as the ROI tab takes them). */
  calibration?: Record<string, number>;
}

/**
 * An option's price: equipment (null while a unit price is missing), the
 * installation (the rep's, else the estimate), grants and credits off, the
 * down payment and the monthly payment; and its payback against the crew
 * when its robots are the ones the ROI tab models.
 */
export function priceOption(o: ProposalOption, financing: Financing, incentives: number, job: RoiJob | null): PricedOption {
  const equipment = o.lines.every((l) => l.unitPrice !== null) ? o.lines.reduce((t, l) => t + l.unitPrice! * l.units, 0) : null;
  const install = o.installPrice ?? o.installEstimate.total;
  const net = equipment === null ? null : Math.max(0, equipment + install - incentives);
  const down = net === null ? null : (net * Math.min(100, Math.max(0, financing.downPct))) / 100;
  const monthly = net === null ? null : monthlyPayment(net - down!, financing.ratePct, financing.months);
  let roi: PricedOption["roi"] = null;
  const only = o.lines.length === 1 ? o.lines[0] : null;
  const how = only?.model === "KR238" ? "stay" : only && (only.model === "KR800" || only.model === "KR804") ? "go" : null;
  if (job && only && how && only.unitPrice !== null) {
    const preset = only.model === "KR800" ? VOYAGER_PRESETS["7"] : only.model === "KR804" ? VOYAGER_PRESETS["19"] : null;
    const input: RoiInputs = {
      ...ROI_DEFAULTS,
      ...job.base,
      ...(job.calibration && { calibration: job.calibration }),
      ...(preset ?? {}),
      area: job.acres,
      mowEvery: job.mowEvery,
      window: job.window,
      layoutPct: job.layoutPct,
      approach: how,
      incentives,
      ...(how === "stay"
        ? { kr238Price: only.unitPrice, kr238Install: install / only.units }
        : { voyPrice: only.unitPrice + install / only.units }),
    };
    const r = computeRoi(input);
    roi = {
      paybackMonths: r.paybackMonths,
      savingsYear: r.annualOpSavings,
      crewMonthly: (r.annualLabor + r.ztFuel + r.ztMaintTotal) / 12,
      robotsMonthly: (r.voyEnergy + r.voyMaintTotal + r.supLabor) / 12,
    };
  }
  return { equipment, install, incentives, net, down, monthly, roi };
}

/** What the client's page shows: a snapshot of the proposal as sent. */
export interface ProposalData {
  version: 1;
  lang: "en" | "fr";
  createdAt: string;
  /** Last day the prices hold (YYYY-MM-DD). */
  validUntil: string;
  client: { name: string; email: string };
  rep: { name: string; email: string; phone: string; company: string };
  property: {
    kind: "golf" | "sod" | "lawn" | "site";
    name: string | null;
    acres: number | null;
    sqft: number | null;
    /** Our likely range, as [low, high] in the property's unit, when there's one. */
    range: [number, number] | null;
    /** The client's own number replaced ours. */
    client: boolean;
    mowEvery: number;
    window: MowWindow | null;
  };
  options: (ProposalOption & { priced: PricedOption })[];
  /** The option the rep recommends (its id). */
  recommended: string;
  financing: Financing;
  assumptions: Assumption[];
  /** Installs recorded so far, and the share within 10 % of our acreage (null under 5). */
  record: { installs: number; within10: number | null };
  /** The Acreage tab's link, to reopen the measurement. */
  link: string;
  notes: string;
}

/** Days a proposal's prices hold by default. */
export const VALID_DAYS = 30;

/** "YYYY-MM-DD", `days` after `from`. */
export function validUntil(from: Date, days = VALID_DAYS): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Whether a proposal can still be accepted on `today` (YYYY-MM-DD, in Quebec's time zone at the caller). */
export const stillValid = (p: Pick<ProposalData, "validUntil">, today: string) => today <= p.validUntil;
