/**
 * ROI Voyager tab copy. The French is the handoff's original text, kept word
 * for word; the English is a translation of it. Numbers are formatted by the
 * caller (roi.ts formatters), so only words live here.
 */
import type { RoiLang } from "./roi";

export interface RoiCopy {
  eyebrow: string;
  title: string;
  lede: string;
  model: string;
  model7: string;
  model19: string;
  modelCustom: string;
  voyPrice: string;
  voyEnergy: string;
  energyHint: (days: string, kwh: number, kwhSeason: string) => string;
  voyMaint: string;
  crew: string;
  wage: string;
  burden: string;
  weeks: string;
  hoursPerWeek: string;
  hoursPerSeason: (hours: string) => string;
  ztMowHrs: string;
  ztMowHint: string;
  voyMowHrs: string;
  mowTotals: (zt: string, voy: string) => string;
  ztPrice: string;
  ztLph: string;
  gasPrice: string;
  ztFuel: string;
  fuelHint: (hours: string, lph: string, litres: string) => string;
  ztMaint: string;
  horizon: string;
  years: string;
  sourcesNote: string;
  comparison: string;
  equipment: string;
  energy: string;
  maintenance: string;
  labor: string;
  total: string;
  doMore: string;
  profitTitle: string;
  perYear: string;
  overHorizon: string;
  cphTitle: string;
  ztCrew: string;
  depreciation: string;
  ztMaintRow: string;
  fuel: string;
  laborPaid: string;
  voyMaintRow: string;
  electricity: string;
  mowHoursSeason: string;
  opCostYear: string;
  cphRow: string;
  cphSaving: (amount: string, pct: number) => string;
  depreciationNote: string;
  paybackTitle: string;
  payback: string;
  roiHorizon: string;
  paybackNote: string;
}

const fr: RoiCopy = {
  eyebrow: "Kress Voyager · Québec · données au 14 octobre 2026",
  title: "Calculateur ROI — Tonte Autonome Voyager",
  lede: "Ce qu'une Kress Voyager fait économiser par rapport à un employé sur une zero-turn de 60 po : coût total, coût par heure de tonte, délai de récupération et rendement. Tout se recalcule en direct.",
  model: "Modèle",
  model7: "7 acres/jour — 85 000 $ (batterie 10 kWh)",
  model19: "19 acres/jour (60 po) — 115 000 $ (batterie 38 kWh)",
  modelCustom: "Personnalisé",
  voyPrice: "Prix d'équipement ($)",
  voyEnergy: "Énergie / an ($) — auto",
  energyHint: (days, kwh, kwhSeason) => `≈ ${days} journées × ${kwh} kWh = ${kwhSeason} kWh/saison`,
  voyMaint: "Entretien / an ($)",
  crew: "Équipe zero-turn remplacée — saisonnier",
  wage: "Salaire horaire ($/h)",
  burden: "Charges sociales (%)",
  weeks: "Nombre de semaines / saison",
  hoursPerWeek: "Heures / semaine",
  hoursPerSeason: (hours) => `= ${hours} heures / saison`,
  ztMowHrs: "Heures de tonte / jour — zero-turn",
  ztMowHint: "Quart de 8 h moins déplacements, dîner, pauses",
  voyMowHrs: "Heures de tonte / jour — Voyager",
  mowTotals: (zt, voy) => `= ${zt} h de tonte zero-turn / ${voy} h Voyager par saison`,
  ztPrice: "Prix tondeuse zero-turn ($)",
  ztLph: "Consommation (L/h)",
  gasPrice: "Prix essence ($/L)",
  ztFuel: "Essence / saison ($) — auto",
  fuelHint: (hours, lph, litres) => `≈ ${hours} h × ${lph} L/h = ${litres} L/saison`,
  ztMaint: "Entretien / saison ($)",
  horizon: "Horizon",
  years: "Horizon (années)",
  sourcesNote:
    "Salaire par défaut (23 $/h) : médiane québécoise de 22 $/h pour les manœuvres en aménagement paysager (CNP 85121, Québec.ca, moyenne 2023-2025), ajustée pour un opérateur de tondeuse commerciale. Charges sociales par défaut (25 %) : RRQ 6,3 % + AE ≈ 1,82 % + RQAP 0,602 % + FSS 1,65 à 4,26 % + vacances 4 % + jours fériés + CNESST (taux aménagement paysager à confirmer). Zero-turn 60 po commercial (25 000 $) : Exmark Lazer Z X et Toro Z Master 6000 affichés à environ 18 800 à 19 600 $ US, convertis en $ CA avec escompte concessionnaire. Essence calculée automatiquement : 5,3 L/h (fiche John Deere Z965M, 60 po) × heures de tonte réelles × environ 2,00 $/L (essence ordinaire, relevé de la Régie de l'énergie, début octobre 2026). Entretien zero-turn (3 000 $/saison) : estimation, non vérifiée. Énergie Voyager calculée automatiquement : une charge complète par journée de travail de 8 h, selon la capacité de batterie du modèle choisi, facturée au tarif G d'Hydro-Québec, tarif commercial petite puissance (12,388 ¢/kWh pour les 15 090 premiers kWh du mois, en vigueur au 1er avril 2026).",
  comparison: "Comparaison des coûts",
  equipment: "Équipement",
  energy: "Énergie",
  maintenance: "Entretien",
  labor: "Main-d'œuvre",
  total: "Total",
  doMore: "Combien de PLUS ils peuvent faire",
  profitTitle: "Profit récupéré sur le travail existant",
  perYear: "/ an",
  overHorizon: " sur l'horizon complet",
  cphTitle: "Coût par heure de tonte (annuel)",
  ztCrew: "Homme + zero-turn",
  depreciation: "Amortissement",
  ztMaintRow: "Entretien / réparations",
  fuel: "Essence",
  laborPaid: "Main-d'œuvre (heures payées)",
  voyMaintRow: "Entretien / lames",
  electricity: "Électricité",
  mowHoursSeason: "Heures de tonte / saison",
  opCostYear: "Coût d'exploitation / an",
  cphRow: "Coût / heure de tonte",
  cphSaving: (amount, pct) => `Économie : ${amount} par heure de tonte (${pct} % de moins)`,
  depreciationNote:
    "Amortissement linéaire sur l'horizon choisi, sans valeur résiduelle. Main-d'œuvre zero-turn = toutes les heures payées (pas seulement les heures de tonte), car l'employé est payé pour son quart complet.",
  paybackTitle: "Délai de récupération et rendement",
  payback: "Délai de récupération",
  roiHorizon: "ROI sur l'horizon",
  paybackNote:
    "Investissement net = prix Voyager − prix zero-turn évité. Économies d'exploitation / an = (main-d'œuvre + essence + entretien zero-turn) − (électricité + entretien Voyager). Délai de récupération = investissement net ÷ économies d'exploitation / an, exprimé en années et mois. ROI = (économies d'exploitation sur l'horizon − investissement net) ÷ investissement net.",
};

const en: RoiCopy = {
  eyebrow: "Kress Voyager · Quebec · data as of October 14, 2026",
  title: "ROI Calculator: Voyager Autonomous Mowing",
  lede: "What one Kress Voyager saves compared with an employee on a 60 in. zero-turn: total cost, cost per mowing hour, payback and return. Everything recalculates live.",
  model: "Model",
  model7: "7 acres/day: $85,000 (10 kWh battery)",
  model19: "19 acres/day (60 in.): $115,000 (38 kWh battery)",
  modelCustom: "Custom",
  voyPrice: "Equipment price ($)",
  voyEnergy: "Energy / year ($), auto",
  energyHint: (days, kwh, kwhSeason) => `≈ ${days} workdays × ${kwh} kWh = ${kwhSeason} kWh/season`,
  voyMaint: "Maintenance / year ($)",
  crew: "Zero-turn crew replaced, seasonal",
  wage: "Hourly wage ($/h)",
  burden: "Payroll burden (%)",
  weeks: "Weeks / season",
  hoursPerWeek: "Hours / week",
  hoursPerSeason: (hours) => `= ${hours} hours / season`,
  ztMowHrs: "Mowing hours / day, zero-turn",
  ztMowHint: "8 h shift minus travel, lunch and breaks",
  voyMowHrs: "Mowing hours / day, Voyager",
  mowTotals: (zt, voy) => `= ${zt} h of zero-turn mowing / ${voy} h Voyager per season`,
  ztPrice: "Zero-turn mower price ($)",
  ztLph: "Fuel use (L/h)",
  gasPrice: "Gas price ($/L)",
  ztFuel: "Gas / season ($), auto",
  fuelHint: (hours, lph, litres) => `≈ ${hours} h × ${lph} L/h = ${litres} L/season`,
  ztMaint: "Maintenance / season ($)",
  horizon: "Horizon",
  years: "Horizon (years)",
  sourcesNote:
    "Default wage ($23/h): Quebec median of $22/h for landscaping labourers (NOC 85121, Québec.ca, 2023-2025 average), adjusted for a commercial mower operator. Default payroll burden (25%): QPP 6.3% + EI ≈ 1.82% + QPIP 0.602% + HSF 1.65 to 4.26% + 4% vacation + statutory holidays + CNESST (landscaping rate to be confirmed). Commercial 60 in. zero-turn ($25,000): Exmark Lazer Z X and Toro Z Master 6000 listed at about US$18,800 to US$19,600, converted to CAD with a dealer discount. Gas calculated automatically: 5.3 L/h (John Deere Z965M spec sheet, 60 in.) × actual mowing hours × about $2.00/L (regular gas, Régie de l'énergie survey, early October 2026). Zero-turn maintenance ($3,000/season): estimate, not verified. Voyager energy calculated automatically: one full charge per 8 h workday, based on the chosen model's battery capacity, billed at Hydro-Québec Rate G, small-power commercial rate (12.388¢/kWh for the first 15,090 kWh each month, in effect April 1, 2026).",
  comparison: "Cost comparison",
  equipment: "Equipment",
  energy: "Energy",
  maintenance: "Maintenance",
  labor: "Labour",
  total: "Total",
  doMore: "How much MORE they can do",
  profitTitle: "Profit recovered on existing work",
  perYear: "/ year",
  overHorizon: " over the full horizon",
  cphTitle: "Cost per mowing hour (annual)",
  ztCrew: "Worker + zero-turn",
  depreciation: "Depreciation",
  ztMaintRow: "Maintenance / repairs",
  fuel: "Gas",
  laborPaid: "Labour (paid hours)",
  voyMaintRow: "Maintenance / blades",
  electricity: "Electricity",
  mowHoursSeason: "Mowing hours / season",
  opCostYear: "Operating cost / year",
  cphRow: "Cost / mowing hour",
  cphSaving: (amount, pct) => `Savings: ${amount} per mowing hour (${pct}% less)`,
  depreciationNote:
    "Straight-line depreciation over the chosen horizon, no residual value. Zero-turn labour = all paid hours (not just mowing hours), because the employee is paid for the full shift.",
  paybackTitle: "Payback and return",
  payback: "Payback period",
  roiHorizon: "ROI over the horizon",
  paybackNote:
    "Net investment = Voyager price − zero-turn price avoided. Operating savings / year = (labour + gas + zero-turn maintenance) − (electricity + Voyager maintenance). Payback = net investment ÷ operating savings / year, in years and months. ROI = (operating savings over the horizon − net investment) ÷ net investment.",
};

export const ROI_COPY: Record<RoiLang, RoiCopy> = { fr, en };
