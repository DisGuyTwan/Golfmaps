/**
 * ROI tab copy. The French started from the handoff's text; the
 * English is a translation of it. Numbers are formatted by the caller (roi.ts
 * formatters), so only words live here.
 */
import type { Approach, RoiLang } from "./roi";

const plural = (n: number, word: string, suffix = "s") => (n > 1 ? `${word}${suffix}` : word);

const fr = {
  eyebrow: "Kress KR238 et Voyager · Québec · données au 25 octobre 2026",
  title: "Calculateur ROI : tonte autonome Kress",
  lede: "Ce que des robots Kress font économiser par rapport à une équipe sur zero-turn de 60 po, pour la même superficie tondue aussi souvent : coût total, coût par acre, délai de récupération et rendement. Des KR238 qui restent sur le terrain ou des Voyager qui repartent avec l'équipe. Tout se recalcule en direct.",

  site: "Terrain à tondre",
  area: "Superficie à tondre (acres)",
  useAcreage: (ac: string) => `Utiliser l'onglet Superficie : ${ac} ac`,
  every: "À quelle fréquence voulez-vous tondre?",
  everyShort: "Tonte",
  everyOptions: { 1: "Chaque jour", 2: "Aux 2 jours", 3: "Aux 3 jours" } as Record<1 | 2 | 3, string>,
  weeklyAcres: (mows: string, ac: string) => `= ${mows} tontes par semaine, ${ac} acres à tondre par semaine`,

  robots: "Robots Kress",
  approach: "Comment les robots vont-ils travailler?",
  approachShort: "Mode",
  approaches: {
    stay: { name: "Tond et reste", model: "KR238", hint: "Chaque KR238 reste sur le terrain, avec sa zone et sa station de recharge." },
    go: { name: "Tond et repart", model: "Voyager KR800 / KR804", hint: "L'équipe apporte le Voyager; il tond, puis passe à la zone ou au terrain suivant." },
  } as Record<Approach, { name: string; model: string; hint: string }>,
  layoutPct: "Temps en plus selon le terrain (%)",
  layoutHint: "Virages, bordures, arbres et déplacements, selon le choix du robot de l'onglet Superficie. 0 = un terrain carré.",

  kr238Price: "Prix par KR238 ($)",
  kr238Install: "Installation par KR238 ($)",
  kr238Acres: "Acres par KR238 (aux 48 h)",
  kr238Maint: "Entretien / an par KR238 ($)",
  kr238Checks: "Vérifications (h/semaine par KR238)",
  kr238ChecksHint: "Nettoyage, lames, dégager un robot coincé.",
  kr238Energy: "Énergie / an ($), auto",
  kr238EnergyHint: (acres: string, kwh: string, kwhSeason: string) => `≈ ${acres} acres × ${kwh} kWh/acre = ${kwhSeason} kWh/saison`,
  kr238Fleet: (n: number, each: string) => `= ${n} KR238 ${plural(n, "nécessaire")}, environ ${each} acres chacun`,

  model: "Modèle",
  model7: "7 acres/jour : 85 000 $ (batterie 10 kWh)",
  model19: "19 acres/jour (60 po) : 115 000 $ (batterie 38 kWh)",
  modelCustom: "Personnalisé",
  voyPrice: "Prix par Voyager ($)",
  voyAcresPerDay: "Acres par charge (1 charge/jour)",
  voyDaysPerWeek: "Jours de tonte / semaine",
  voyDaysHint: "Elle peut tondre 7 jours sur 7.",
  voyMaint: "Entretien / an par Voyager ($)",
  supHrs: "Supervision (h/jour par Voyager)",
  supHint: "Déplacements entre les zones, cartographie, dégagements, surveillance.",
  voyEnergy: "Énergie / an ($), auto",
  energyHint: (charges: string, kwh: number, kwhSeason: string) => `≈ ${charges} charges × ${kwh} kWh = ${kwhSeason} kWh/saison`,
  fleet: (n: number) => `= ${n} Voyager ${plural(n, "nécessaire")}`,

  crew: "Équipe zero-turn remplacée, saisonnière",
  wage: "Salaire horaire ($/h)",
  burden: "Charges sociales (%)",
  weeks: "Nombre de semaines / saison",
  hoursPerWeek: "Heures / semaine",
  hoursPerSeason: (hours: string) => `= ${hours} heures / saison`,
  ztMowHrs: "Heures de tonte / jour, zero-turn",
  ztMowHint: "Quart de 8 h moins déplacements, dîner, pauses",
  ztAcresPerHour: "Rendement zero-turn (acres/h)",
  crewLine: (fte: string, machines: number, hours: string) =>
    `= ${fte} opérateur à temps plein sur ${machines} zero-turn, ${hours} h de tonte par saison`,
  ztStatus: "Zero-turn actuelles",
  ztReplace: "À remplacer : achat évité",
  ztOwn: "Déjà payées : on les vend",
  ztPrice: "Prix tondeuse zero-turn ($)",
  ztResale: "Valeur de revente par zero-turn ($)",
  ztLph: "Consommation (L/h)",
  gasPrice: "Prix essence ($/L)",
  ztFuel: "Essence / saison ($), auto",
  fuelHint: (hours: string, lph: string, litres: string) => `≈ ${hours} h × ${lph} L/h = ${litres} L/saison`,
  ztMaint: "Entretien / saison par zero-turn ($)",

  incSection: "Subventions et crédits d'impôt",
  incMode: "Déduire de l'investissement en robots",
  incNone: "Aucun",
  incLow: (amount: string) => `En vigueur seulement : ${amount}`,
  incHigh: (amount: string) => `Avec les éléments à confirmer : ${amount}`,
  incHint: (profile: string) =>
    `Subventions et crédit d'impôt (pas les radiations, qui ne font que devancer l'économie d'impôt), selon l'onglet Incitatifs pour : ${profile}.`,

  horizon: "Horizon",
  years: "Horizon (années)",

  asOf: {
    price: "Prix Kress, octobre 2026",
    capacity: "Selon Kress (acres par charge)",
    kr238Price: "39 999 $ US chez un détaillant, converti, octobre 2026",
    kr238Acres: "Selon Kress (20 acres aux 48 h)",
    install: "Station, antenne RTK, cartographie (estimation)",
    supervision: "Estimation à ajuster",
    wage: "Médiane 2023-2025, Québec.ca",
    burden: "Taux 2026",
    ztRate: "60 po ≈ 12 km/h, 65 % d'efficacité",
    ztPrice: "Prix affichés convertis, octobre 2026",
    resale: "Estimation, zero-turn de quelques saisons",
    maint: "Estimation",
    gasDefault: "Régie de l'énergie, début octobre 2026",
    gasLive: (month: string) => `Statistique Canada, Montréal, ${month} (mis à jour chaque jour)`,
    hq: "Tarif G d'Hydro-Québec au 1er avril 2026",
  },

  sourcesNote: (approach: Approach) =>
    `Salaire par défaut (23 $/h) : médiane québécoise de 22 $/h pour les manœuvres en aménagement paysager (CNP 85121, Québec.ca, moyenne 2023-2025), ajustée pour un opérateur de tondeuse commerciale. Charges sociales par défaut (25 %) : RRQ 6,3 % + AE ≈ 1,82 % + RQAP 0,602 % + FSS 1,65 à 4,26 % + vacances 4 % + jours fériés + CNESST (taux aménagement paysager à confirmer). Zero-turn 60 po commercial (25 000 $) : Exmark Lazer Z X et Toro Z Master 6000 affichés à environ 18 800 à 21 300 $ US, convertis en $ CA avec escompte concessionnaire. Rendement zero-turn (3 acres/h) : plateau de 60 po à environ 12 km/h avec 65 % d'efficacité au champ. Essence calculée automatiquement : 5,3 L/h (fiche John Deere Z965M, 60 po) × heures de tonte requises × prix de l'essence ordinaire (Statistique Canada, Montréal, ou 2,00 $/L, Régie de l'énergie, début octobre 2026). Entretien zero-turn (3 000 $/saison) : estimation, non vérifiée. ${
      approach === "stay"
        ? "KR238 (55 000 $) : 39 999 $ US chez un détaillant américain (octobre 2026), converti en $ CA comme le prix des Voyager; 20 acres tondues au complet aux 48 h selon Kress (donc 10 acres chaque jour ou 30 acres aux 3 jours), chaque robot rempli à 90 % quand il en faut plusieurs. Énergie KR238 : environ 0,3 kWh par acre tondue (estimation, Kress ne publie pas la taille de la batterie), facturée au tarif G d'Hydro-Québec (12,388 ¢/kWh pour les 15 090 premiers kWh du mois, en vigueur au 1er avril 2026). Installation (1 500 $), entretien (600 $/an), vérifications (1 h/semaine) et valeur de revente (8 000 $) : estimations à ajuster."
        : "Capacité Voyager selon Kress : jusqu'à 7 acres par charge (KR800, 10 kWh) et 19 acres par charge (KR804, 38 kWh). Énergie Voyager : une charge complète par tranche de superficie, facturée au tarif G d'Hydro-Québec (12,388 ¢/kWh pour les 15 090 premiers kWh du mois, en vigueur au 1er avril 2026). Supervision (0,5 h/jour) et valeur de revente (8 000 $) : estimations à ajuster."
    }`,

  comparison: "Comparaison des coûts",
  colZt: (n: number) => `Zero-turn ×${n}`,
  colVoy: (name: string, n: number) => `${name} ×${n}`,
  equipment: "Équipement",
  energy: "Énergie",
  maintenance: "Entretien",
  labor: "Main-d'œuvre",
  total: "Total",
  doMore: "Combien de PLUS ils peuvent faire",
  profitTitle: "Profit récupéré sur le travail existant",
  perYear: "/ an",
  overHorizon: " sur l'horizon complet",
  cpaTitle: "Coût par acre tondu (annuel)",
  ztCrew: "Équipe + zero-turn",
  depreciation: "Amortissement",
  ztMaintRow: "Entretien / réparations",
  fuel: "Essence",
  laborPaid: "Main-d'œuvre (part des quarts payés)",
  voyMaintRow: "Entretien / lames",
  electricity: "Électricité",
  supervision: "Supervision",
  acresSeason: "Acres tondus / saison",
  opCostYear: "Coût d'exploitation / an",
  cpaRow: "Coût / acre tondu",
  cpaSaving: (amount: string, pct: number) => `Économie : ${amount} par acre tondu (${pct} % de moins)`,
  cpaMore: (amount: string) => `Les robots coûtent ${amount} de plus par acre tondu`,
  depreciationNote:
    "Amortissement linéaire sur l'horizon choisi, sans valeur résiduelle. Main-d'œuvre zero-turn = part des quarts payés que la tonte occupe (heures de tonte requises ÷ heures de tonte par quart); le reste du temps de l'équipe sert à d'autres tâches et n'est pas compté comme économie. La supervision des robots est comptée au même salaire chargé.",
  paybackTitle: "Délai de récupération et rendement",
  payback: "Délai de récupération",
  roiHorizon: "ROI sur l'horizon",
  barProfit: "Profit / an",
  barDetails: "Voir le détail",
  paybackNote:
    "Investissement net = prix des robots (et leur installation) − subventions et crédits déduits − prix des zero-turn évitées (ou leur valeur de revente si elles sont déjà payées). Économies d'exploitation / an = (main-d'œuvre + essence + entretien zero-turn) − (électricité + entretien + supervision des robots). Délai de récupération = investissement net ÷ économies d'exploitation / an, exprimé en années et mois. ROI = (économies d'exploitation sur l'horizon − investissement net) ÷ investissement net.",
};

export type RoiCopy = typeof fr;

const en: RoiCopy = {
  eyebrow: "Kress KR238 and Voyager · Quebec · data as of October 25, 2026",
  title: "ROI Calculator: Kress Autonomous Mowing",
  lede: "What Kress robots save compared with a crew on 60 in. zero-turns mowing the same acreage just as often: total cost, cost per acre, payback and return. KR238s that stay on the property, or Voyagers that leave with the crew. Everything recalculates live.",

  site: "Area to mow",
  area: "Area to mow (acres)",
  useAcreage: (ac) => `Use the Acreage tab: ${ac} ac`,
  every: "How often do you want to mow?",
  everyShort: "Mowing",
  everyOptions: { 1: "Every day", 2: "Every 2 days", 3: "Every 3 days" },
  weeklyAcres: (mows, ac) => `= ${mows} mowings a week, ${ac} acres to mow per week`,

  robots: "Kress robots",
  approach: "How will the robots work?",
  approachShort: "Approach",
  approaches: {
    stay: { name: "Cut and stay", model: "KR238", hint: "Each KR238 stays on the property, with its own zone and charger." },
    go: { name: "Cut and go", model: "Voyager KR800 / KR804", hint: "The crew brings the Voyager; it mows, then moves on to the next area or site." },
  },
  layoutPct: "Extra time for this property (%)",
  layoutHint: "Turns, edges, trees and driving, from the Acreage tab's mower fit. 0 = a plain square.",

  kr238Price: "Price per KR238 ($)",
  kr238Install: "Installation per KR238 ($)",
  kr238Acres: "Acres per KR238 (every 48 h)",
  kr238Maint: "Maintenance / year per KR238 ($)",
  kr238Checks: "Checks (h/week per KR238)",
  kr238ChecksHint: "Cleaning, blades, freeing a stuck robot.",
  kr238Energy: "Energy / year ($), auto",
  kr238EnergyHint: (acres, kwh, kwhSeason) => `≈ ${acres} acres × ${kwh} kWh/acre = ${kwhSeason} kWh/season`,
  kr238Fleet: (n, each) => `= ${n} KR238 needed, about ${each} acres each`,

  model: "Model",
  model7: "7 acres/day: $85,000 (10 kWh battery)",
  model19: "19 acres/day (60 in.): $115,000 (38 kWh battery)",
  modelCustom: "Custom",
  voyPrice: "Price per Voyager ($)",
  voyAcresPerDay: "Acres per charge (1 charge/day)",
  voyDaysPerWeek: "Mowing days / week",
  voyDaysHint: "It can mow 7 days a week.",
  voyMaint: "Maintenance / year per Voyager ($)",
  supHrs: "Supervision (h/day per Voyager)",
  supHint: "Moving it between areas, mapping, clearing jams, checking on it.",
  voyEnergy: "Energy / year ($), auto",
  energyHint: (charges, kwh, kwhSeason) => `≈ ${charges} charges × ${kwh} kWh = ${kwhSeason} kWh/season`,
  fleet: (n) => `= ${n} ${plural(n, "Voyager")} needed`,

  crew: "Zero-turn crew replaced, seasonal",
  wage: "Hourly wage ($/h)",
  burden: "Payroll burden (%)",
  weeks: "Weeks / season",
  hoursPerWeek: "Hours / week",
  hoursPerSeason: (hours) => `= ${hours} hours / season`,
  ztMowHrs: "Mowing hours / day, zero-turn",
  ztMowHint: "8 h shift minus travel, lunch and breaks",
  ztAcresPerHour: "Zero-turn output (acres/h)",
  crewLine: (fte, machines, hours) =>
    `= ${fte} full-time operator on ${machines} ${plural(machines, "zero-turn")}, ${hours} h of mowing per season`,
  ztStatus: "Current zero-turns",
  ztReplace: "Due for replacement: purchase avoided",
  ztOwn: "Already owned: sell them",
  ztPrice: "Zero-turn mower price ($)",
  ztResale: "Resale value per zero-turn ($)",
  ztLph: "Fuel use (L/h)",
  gasPrice: "Gas price ($/L)",
  ztFuel: "Gas / season ($), auto",
  fuelHint: (hours, lph, litres) => `≈ ${hours} h × ${lph} L/h = ${litres} L/season`,
  ztMaint: "Maintenance / season per zero-turn ($)",

  incSection: "Grants and tax credits",
  incMode: "Deduct from the robot investment",
  incNone: "None",
  incLow: (amount) => `In force only: ${amount}`,
  incHigh: (amount) => `Including items to confirm: ${amount}`,
  incHint: (profile) =>
    `Grants and tax credit (not write-offs, which only bring the tax saving forward), from the Incentives tab for: ${profile}.`,

  horizon: "Horizon",
  years: "Horizon (years)",

  asOf: {
    price: "Kress pricing, October 2026",
    capacity: "Per Kress (acres per charge)",
    kr238Price: "US$39,999 at a dealer, converted, October 2026",
    kr238Acres: "Per Kress (20 acres every 48 h)",
    install: "Charger, RTK antenna, mapping (estimate)",
    supervision: "Estimate, adjust as needed",
    wage: "2023-2025 median, Québec.ca",
    burden: "2026 rates",
    ztRate: "60 in. at ≈ 12 km/h, 65% efficiency",
    ztPrice: "Converted list prices, October 2026",
    resale: "Estimate, a few seasons old",
    maint: "Estimate",
    gasDefault: "Régie de l'énergie, early October 2026",
    gasLive: (month) => `Statistics Canada, Montréal, ${month} (refreshed daily)`,
    hq: "Hydro-Québec Rate G, April 1, 2026",
  },

  sourcesNote: (approach) =>
    `Default wage ($23/h): Quebec median of $22/h for landscaping labourers (NOC 85121, Québec.ca, 2023-2025 average), adjusted for a commercial mower operator. Default payroll burden (25%): QPP 6.3% + EI ≈ 1.82% + QPIP 0.602% + HSF 1.65 to 4.26% + 4% vacation + statutory holidays + CNESST (landscaping rate to be confirmed). Commercial 60 in. zero-turn ($25,000): Exmark Lazer Z X and Toro Z Master 6000 listed at about US$18,800 to US$21,300, converted to CAD with a dealer discount. Zero-turn output (3 acres/h): 60 in. deck at about 12 km/h with 65% field efficiency. Gas calculated automatically: 5.3 L/h (John Deere Z965M spec sheet, 60 in.) × mowing hours needed × regular gas price (Statistics Canada, Montréal, or $2.00/L, Régie de l'énergie, early October 2026). Zero-turn maintenance ($3,000/season): estimate, not verified. ${
      approach === "stay"
        ? "KR238 ($55,000): US$39,999 at a US dealer (October 2026), converted to CAD like the Voyager prices; 20 acres mowed all over every 48 h per Kress (so 10 acres every day or 30 acres every 3 days), each robot filled to 90% when it takes several. KR238 energy: about 0.3 kWh per acre mowed (estimate, Kress publishes no battery size), billed at Hydro-Québec Rate G (12.388¢/kWh for the first 15,090 kWh each month, in effect April 1, 2026). Installation ($1,500), maintenance ($600/year), checks (1 h/week) and resale value ($8,000): estimates to adjust."
        : "Voyager capacity per Kress: up to 7 acres per charge (KR800, 10 kWh) and 19 acres per charge (KR804, 38 kWh). Voyager energy: one full charge per batch of acreage, billed at Hydro-Québec Rate G (12.388¢/kWh for the first 15,090 kWh each month, in effect April 1, 2026). Supervision (0.5 h/day) and resale value ($8,000): estimates to adjust."
    }`,

  comparison: "Cost comparison",
  colZt: (n) => `Zero-turn ×${n}`,
  colVoy: (name, n) => `${name} ×${n}`,
  equipment: "Equipment",
  energy: "Energy",
  maintenance: "Maintenance",
  labor: "Labour",
  total: "Total",
  doMore: "How much MORE they can do",
  profitTitle: "Profit recovered on existing work",
  perYear: "/ year",
  overHorizon: " over the full horizon",
  cpaTitle: "Cost per acre mowed (annual)",
  ztCrew: "Crew + zero-turn",
  depreciation: "Depreciation",
  ztMaintRow: "Maintenance / repairs",
  fuel: "Gas",
  laborPaid: "Labour (share of paid shifts)",
  voyMaintRow: "Maintenance / blades",
  electricity: "Electricity",
  supervision: "Supervision",
  acresSeason: "Acres mowed / season",
  opCostYear: "Operating cost / year",
  cpaRow: "Cost / acre mowed",
  cpaSaving: (amount, pct) => `Savings: ${amount} per acre mowed (${pct}% less)`,
  cpaMore: (amount) => `The robots cost ${amount} more per acre mowed`,
  depreciationNote:
    "Straight-line depreciation over the chosen horizon, no residual value. Zero-turn labour = the share of paid shifts the mowing takes (mowing hours needed ÷ mowing hours per shift); the rest of the crew's time goes to other work and isn't counted as a saving. Robot supervision is costed at the same loaded wage.",
  paybackTitle: "Payback and return",
  payback: "Payback period",
  roiHorizon: "ROI over the horizon",
  barProfit: "Profit / year",
  barDetails: "See details",
  paybackNote:
    "Net investment = robot price (and installation) − grants and credits deducted − zero-turn purchase avoided (or their resale value if already owned). Operating savings / year = (labour + gas + zero-turn maintenance) − (electricity + robot maintenance and supervision). Payback = net investment ÷ operating savings / year, in years and months. ROI = (operating savings over the horizon − net investment) ÷ net investment.",
};

export const ROI_COPY: Record<RoiLang, RoiCopy> = { fr, en };
