/**
 * Robotic mower and battery tool incentive checker (Quebec, Ontario, federal).
 *
 * Ported from the dealer handoff checker. Pure: inputs + language in, savings
 * range and program list out, so it can be tested without a browser.
 *
 * Research as of Oct 9, 2026; federal write-off rules re-checked Oct 14, 2026
 * (Bill C-15 in force; Productivity Mega Deduction proposed Sept 15, 2026). Program terms change often: items tagged "warn"
 * or "apply" need confirmation, and only "ok" items count toward the low end.
 */

export type Lang = "fr" | "en";
export type Province = "QC" | "ON";
export type Profile =
  | "landscaper"
  | "golf"
  | "farm"
  | "municipality"
  | "institution"
  | "developer"
  | "homeowner";
export type FarmType = "orchard" | "vineyard" | "berries" | "vegetables" | "nursery" | "field";
export type Mapaq = "yes" | "no" | "unsure";
export type Structure = "corp" | "soleprop" | "exempt";
export type City =
  | "stbruno"
  | "granby"
  | "stlaurent"
  | "terrebonne"
  | "repentigny"
  | "stsauveur"
  | "other";
/** ok = in force, warn = to confirm, apply = on application, off = closed. */
export type Tag = "ok" | "warn" | "apply" | "off" | "info";
export type Link = [label: string, url: string];

export const PROFILES: Profile[] = [
  "landscaper",
  "golf",
  "farm",
  "municipality",
  "institution",
  "developer",
  "homeowner",
];
export const BUSINESS_PROFILES: Profile[] = ["landscaper", "golf", "farm", "developer"];
export const FARM_TYPES: FarmType[] = ["orchard", "vineyard", "berries", "vegetables", "nursery", "field"];
/** Farm types where robotic under-row mowing fits Prime-Vert as herbicide reduction. */
const PRIME_VERT_FARMS: FarmType[] = ["orchard", "vineyard", "berries", "nursery"];
export const CITIES: City[] = ["stbruno", "granby", "stlaurent", "terrebonne", "repentigny", "stsauveur", "other"];
export const STRUCTURES: Structure[] = ["corp", "soleprop", "exempt"];
/** Default tax rates (%) per structure; the user can override. */
export const DEFAULT_TAX_RATE: Record<"corp" | "soleprop", number> = { corp: 12.2, soleprop: 30 };

export interface IncentiveInputs {
  prov: Province;
  who: Profile;
  farm: FarmType;
  mapaq: Mapaq;
  /** Young farmer (relève) or certified organic: +15 points on Prime-Vert. */
  bonus: boolean;
  struct: Structure;
  city: City;
  /** Combined income tax rate as a fraction (0.122 = 12.2%). */
  tax: number;
  buyRobot: boolean;
  buyTools: boolean;
  robotAmt: number;
  toolAmt: number;
  /** Most battery tools cost under $500 each (CCA Class 12). */
  under500: boolean;
}

/** Golf course is preselected because this app is built for golf quoting. */
export const DEFAULT_INCENTIVE_INPUTS: IncentiveInputs = {
  prov: "QC",
  who: "golf",
  farm: "orchard",
  mapaq: "yes",
  bonus: false,
  struct: "corp",
  city: "stbruno",
  tax: DEFAULT_TAX_RATE.corp / 100,
  buyRobot: true,
  buyTools: true,
  robotAmt: 24000,
  toolAmt: 3000,
  under500: true,
};

/**
 * kept = money the buyer keeps (grants, rebates, the refundable tax credit).
 * timing = faster write-offs: less tax now, but the same total deduction over
 * the equipment's life, so it's a cash-flow gain rather than money kept.
 */
export type ItemKind = "kept" | "timing";

export interface IncentiveItem {
  t: string;
  d: string;
  tag: Tag;
  kind: ItemKind;
  low: number;
  high: number;
  links: Link[];
}

export interface ProgramCard {
  t: string;
  p: string;
  tag: Tag;
  info?: boolean;
  links?: Link[];
}

export interface IncentiveResult {
  /** Total purchase, robots, tools. */
  P: number;
  R: number;
  Tl: number;
  items: IncentiveItem[];
  cards: ProgramCard[];
  /** Savings counting only rules in force. */
  low: number;
  /** Savings including items that need confirmation or approval. */
  high: number;
  /** The same totals split by kind (kept + timing = low/high). */
  keptLow: number;
  keptHigh: number;
  timingLow: number;
  timingHigh: number;
}

const LINKS = {
  itc: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/business-tax-credits/clean-economy-itc/clean-technology-itc.html",
  pmd: "https://www.canada.ca/en/department-finance/news/2026/09/government-of-canada-introduces-new-productivity-mega-deduction-to-boost-canadas-advantage-as-the-most-competitive-g7-country-for-new-business-inve.html",
  class56: "https://www.canada.ca/en/department-finance/news/2020/12/expanding-tax-support-for-business-investment-in-zero-emission-vehicles.html",
  cca: "https://www.cra-arc.gc.ca/tx/bsnss/tpcs/slprtnr/rprtng/cptl/clsss-eng.html",
  primevert: "https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/agriculture/aide-financiere/prime-vert/volet1",
  gmfPilot: "https://greenmunicipalfund.ca/funding/pilot-net-zero-transformation",
  gmfCap: "https://greenmunicipalfund.ca/funding/capital-project-municipal-fleet-electrification",
  gmfStudy: "https://greenmunicipalfund.ca/funding/study-municipal-fleet-electrification",
  mfor: "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/administrer-gerer/embauche-gestion-personnel/former-main-oeuvre/developper-competences",
  ojg: "https://www.ontario.ca/page/canada-ontario-job-grant-cojg",
  csbfp: "https://ised-isde.canada.ca/site/canada-small-business-financing-program/en",
  qcBudget: "https://emc-mec.ca/fr/article-de-nouvelles/faits-saillants-du-budget-2025-du-quebec",
  stbruno: "https://www.ctvnews.ca/montreal/article/quebec-town-offering-100-for-gas-powered-tools-to-swap-for-electric/",
  stbrunoCity: "https://www.stbruno.ca",
  granby: "https://biblio.granby.ca/documents/44311/119646/depliant_subventiontondeuse_mars2024_web.pdf",
  stlaurent: "https://montreal.ca/programmes/subvention-pour-lachat-dequipements-dentretien-paysager-residentiel-sans-carburant-saint-laurent",
  terrebonne: "https://terrebonne.ca",
  terrebonneNpo: "https://terrebonne.ca/wp-content/uploads/2023/08/Programme_aide_financiere_soutien_achat_entretien_equipement_ou_materiel_durable_2022_VF.pdf",
  repentigny: "https://www.repentigny.ca",
  stsauveur: "https://www.vss.ca/storage/app/media/Environnement/Subventions%20et%20programmes/demande-de-subvention-pour-lachat-dequipements-de-jardinage-ecologiques.pdf",
};

const fr = {
  eyebrow: "Québec · Ontario · Fédéral · à jour au 14 octobre 2026",
  h1: "Combien pouvez-vous récupérer sur vos tondeuses robots et outils à batterie?",
  lede: "Subventions, crédits d’impôt et radiations offerts la première année sur les tondeuses robots et les outils à batterie, avec le lien officiel de chaque programme.",
  s1: "Où êtes-vous?",
  s2: "Vous êtes",
  s2farm: "Type de ferme",
  s2mapaq: "Ferme enregistrée au MAPAQ?",
  bonus: "Relève agricole ou production certifiée biologique",
  s2struct: "Structure de l’organisation",
  taxLabel: "Taux d’imposition estimé",
  taxHelp: "Exemple : 12,2 % pour une petite société, 30 % pour un travailleur autonome. Votre comptable peut préciser.",
  s2city: "Votre municipalité",
  s3: "Que voulez-vous acheter?",
  robotLabel: "Tondeuses robots",
  robotHelp: "Montant total avant taxes",
  toolLabel: "Outils à batterie",
  toolHelp: "Coupe-bordures, souffleurs, taille-haies, tondeuses poussées. Montant total avant taxes",
  under500: "La plupart coûtent moins de 500 $ chacun",
  exampleNote: "Montants d’exemple. Remplacez-les par votre soumission.",
  prov_QC: "Québec",
  prov_ON: "Ontario",
  who_landscaper: "Paysagiste",
  who_golf: "Terrain de golf",
  who_farm: "Ferme ou pépinière",
  who_municipality: "Municipalité",
  who_institution: "École, OBNL ou cimetière",
  who_developer: "Promoteur ou gestion immobilière",
  who_homeowner: "Propriétaire résidentiel",
  farm_orchard: "Verger",
  farm_vineyard: "Vignoble",
  farm_berries: "Petits fruits",
  farm_vegetables: "Maraîcher",
  farm_nursery: "Pépinière, arbres et arbustes",
  farm_field: "Grandes cultures ou autre",
  yes: "Oui",
  no: "Non",
  unsure: "Je ne sais pas",
  struct_corp: "Société par actions (inc.)",
  struct_soleprop: "Travailleur autonome ou société de personnes",
  struct_exempt: "Exempt d’impôt (municipal, OBNL)",
  city_stbruno: "Saint-Bruno-de-Montarville",
  city_granby: "Granby",
  city_stlaurent: "Saint-Laurent (Montréal)",
  city_terrebonne: "Terrebonne",
  city_repentigny: "Repentigny",
  city_stsauveur: "Saint-Sauveur",
  city_other: "Autre ville",
  kicker: "Économies estimées la 1re année",
  keptLabel: "Argent conservé (subventions et crédit d’impôt)",
  keptHelp: "Montant que l’acheteur garde.",
  timingLabel: "Impôt reporté (radiations accélérées)",
  timingHelp: "Moins d’impôt dès la 1re année, mais la déduction totale sur la durée de vie de l’équipement reste la même.",
  totalLabel: "Effet total la 1re année",
  kind: { kept: "Argent conservé", timing: "Impôt reporté" } as Record<ItemKind, string>,
  ofPurchase: (p: string, range: string) => `sur un achat de ${p}${range}`,
  pctRange: (a: string, b: string) => (a === b ? ` (${a} de l’achat)` : ` (${a} à ${b} de l’achat)`),
  none: "Aucune aide trouvée pour ce profil et cet achat.",
  enterAmt: "Entrez un montant d’achat pour voir l’estimation.",
  legendLow: "Règles en vigueur",
  legendHigh: "À confirmer ou sur demande",
  rangeNote: "Le bas de la fourchette ne compte que les règles en vigueur. Le haut ajoute ce qui doit être confirmé ou approuvé.",
  breakdown: "Détail",
  programs: "Autres programmes utiles",
  copy: "Copier mon résumé",
  copied: "Résumé copié. Collez-le dans un texto à votre conseiller.",
  copyFail: "Copie bloquée. Sélectionnez le texte ci-dessous.",
  bar_label: "Effet total 1re année",
  bar_btn: "Voir le détail",
  timing: "L’amortissement accéléré réduit l’impôt dès la 1re année. Sur la durée de vie de l’équipement, la déduction totale reste la même. Le crédit d’impôt et les subventions sont des gains nets.",
  watch: "À surveiller : adoption de la Mégadéduction à la productivité (proposée le 15 septembre 2026, pas encore adoptée) et décision de Québec de l’appliquer ou non, nouvelle version de Prime-Vert en vigueur depuis le 13 octobre 2026 (taux à revalider), nouveau gouvernement du Québec élu le 5 octobre 2026, réouverture des remises municipales au début de 2027.",
  disclaimer: "Estimation à titre informatif seulement, pas un avis fiscal ou juridique. Les programmes changent souvent et les fonds s’épuisent. Confirmez avec votre comptable ou le responsable du programme avant d’acheter.",
  tag: { ok: "En vigueur", warn: "À confirmer", apply: "Sur demande", off: "Fermé", info: "Info" } as Record<Tag, string>,
  linkOfficial: "Page officielle",
  linkClasses: "Catégories d’amortissement (ARC)",
  linkClass56: "Catégorie 56 (Finances Canada)",
  linkNews: "Article",
  linkCity: "Site de la ville",
  linkPdf: "Document de la ville",
  linkBudget: "Résumé du budget 2025-2026",
  linkPmd: "Mégadéduction (Finances Canada)",
  i_itc: "Crédit d’impôt pour technologies propres (30 %, remboursable)",
  d_itc: "Tondeuses robots, si reconnues comme véhicules hors route à zéro émission (catégorie 56). Les exemples officiels visent surtout l’équipement lourd des mines et de la construction : l’admissibilité d’un robot de tonte n’est pas confirmée. Sociétés imposables seulement.",
  i_ccaR: "Radiation accélérée des tondeuses robots",
  d_ccaR: "Bas : catégorie 8 avec incitatif accéléré, 30 % la 1re année (en vigueur). Haut : 100 % la 1re année avec la Mégadéduction à la productivité proposée pour les achats à compter du 15 septembre 2026 (pas encore adoptée), ou avec la catégorie 56 si le robot est reconnu comme équipement automoteur entièrement électrique.",
  i_ccaT: "Radiation des outils à batterie",
  d_ccaT12: "Outils de moins de 500 $ chacun : catégorie 12, 100 % la 1re année.",
  d_ccaT8: "Outils de 500 $ et plus : catégorie 8 avec incitatif accéléré, 30 % la 1re année (en vigueur). Haut : 100 % avec la Mégadéduction à la productivité proposée (achats à compter du 15 septembre 2026, pas encore adoptée).",
  i_pv: "Prime-Vert (MAPAQ) : équipement de désherbage",
  d_pv: (rate: number) =>
    `Jusqu’à ${rate} % de l’achat, max. 40 000 $ par ferme. La tonte robotisée sous les rangs doit être justifiée comme réduction d’herbicides. Obtenez l’accord de votre direction régionale du MAPAQ avant d’acheter.`,
  i_gmfPilot: "Fonds municipal vert : projet pilote",
  d_gmfPilot: "Jusqu’à 50 %, max. 500 000 $, pour tester une solution innovante de réduction des GES, comme la tonte robotisée des parcs. Période de dépôt à confirmer avec le FMV.",
  i_tbNpo: "Terrebonne : équipement durable pour organismes reconnus",
  d_tbNpo: "Jusqu’à 30 %, max. 5 000 $, une fois par année. Dépôt au plus tard le 15 avril.",
  i_stbruno: "Saint-Bruno : échange d’un outil à essence",
  d_stbruno: "Jusqu’à 100 $ par ménage. Rapportez l’outil à essence à l’écocentre avant le 30 novembre 2026 et achetez l’outil électrique avant la fin de 2026. Tondeuse robot : à confirmer avec la Ville.",
  i_granby: "Granby : remise tondeuse écologique",
  d_granby: "Tondeuse à batterie : 50 % jusqu’à 75 $. Achat chez un commerçant de Granby. Demande avant le 1er mai de l’année suivante. Tondeuse robot : à confirmer avec la Ville.",
  i_stlaurent: "Saint-Laurent : équipement d’entretien sans carburant",
  d_stlaurent: "Programme 2026 fermé, fonds épuisés. À surveiller en 2027 : 50 % jusqu’à 200 $.",
  i_terrebonne: "Terrebonne : remise équipement électrique",
  d_terrebonne: "Remise de 50 % rapportée. Plafond et statut 2026 à confirmer auprès de la Ville. Non incluse dans le calcul.",
  i_repentigny: "Repentigny : remise tondeuse ou coupe-bordure électrique",
  d_repentigny: "Remise jusqu’à 75 % rapportée, achat au Québec. Plafond et statut 2026 à confirmer. Non incluse dans le calcul.",
  i_stsauveur: "Saint-Sauveur : équipement de jardinage écologique",
  d_stsauveur: "50 % jusqu’à 50 $ par article, une subvention par adresse. Demande dans les 12 mois suivant l’achat.",
  c_gmfCap: "Fonds municipal vert : électrification de flotte",
  p_gmfCap: "Prêt et subvention jusqu’à 80 % des coûts, max. 10 M$. La subvention vaut 15 % du prêt. Équipements électriques évalués au cas par cas. Au Québec, dépôt via le MAMH.",
  c_gmfStudy: "Fonds municipal vert : étude de flotte",
  p_gmfStudy: "Jusqu’à 50 %, max. 200 000 $, pour planifier l’électrification des équipements de parcs et espaces verts.",
  c_pvTrial: "Prime-Vert : essais à la ferme",
  p_pvTrial: "Jusqu’à 70 %, max. 15 000 $ par essai (30 000 $ par ferme). Idéal pour comparer la tonte robotisée et l’herbicide, avec un conseiller.",
  c_mfor: "Services Québec : formation de la main-d’œuvre",
  p_mfor: "Aide pour former votre équipe sur de nouveaux équipements, souvent jusqu’à 50 % des coûts admissibles. Contactez votre bureau régional avant la formation.",
  c_ojg: "Ontario Job Grant (formation)",
  p_ojg: "Jusqu’à 10 000 $ par employé formé. Les employeurs de moins de 100 employés paient 1/6 des coûts. Formation par un fournisseur externe admissible.",
  c_csbfp: "Programme de financement des petites entreprises du Canada",
  p_csbfp: "Prêt bancaire garanti par le fédéral : jusqu’à 1,15 M$, dont 500 000 $ max. pour l’équipement. Revenus de 10 M$ ou moins. Fermes exclues.",
  c_qcHarm: "Impôt du Québec",
  p_qcHarm: "Québec a prolongé ses radiations accélérées en s’harmonisant en partie au fédéral. Il n’a rien annoncé pour la Mégadéduction à la productivité en date du 14 octobre 2026. Faites confirmer par votre comptable avant de produire votre déclaration.",
  c_noItc: "Crédit de 30 % : sociétés seulement",
  p_noItc: "Un travailleur autonome ou une société de personnes ne peut pas le demander, mais profite quand même de la radiation accélérée.",
  c_exempt: "Organisme exempt d’impôt",
  p_exempt: "Les radiations et le crédit d’impôt ne s’appliquent pas. Visez les subventions et la formation.",
  c_lease: "Location ou abonnement",
  p_lease: "C’est le propriétaire de l’équipement qui réclame la radiation et le crédit d’impôt, pas le client qui loue.",
  c_onHome: "Ontario : aucune remise trouvée",
  p_onHome: "Aucune remise provinciale ou municipale pour tondeuses ou outils électriques n’a été trouvée en 2026.",
  c_otherCity: "Vérifiez votre ville",
  p_otherCity: "Plusieurs villes du Québec remboursent de 50 $ à 200 $ sur une tondeuse ou un outil électrique. Consultez le site de votre ville; les fonds s’épuisent vite.",
  c_mapaqReg: "Enregistrement au MAPAQ requis",
  p_mapaqReg: "Prime-Vert exige une exploitation agricole enregistrée au MAPAQ. Enregistrez la ferme avant de déposer une demande.",
  c_farmFit: "Prime-Vert : moins adapté à ce type de ferme",
  p_farmFit: "La tonte robotisée comme solution de rechange aux herbicides cadre mieux dans les vergers, vignobles, petits fruits et pépinières.",
  sumTitle: "Estimation : tondeuses robots et outils à batterie",
  sumProfile: "Profil",
  sumBuy: "Achat",
  sumRobots: "robots",
  sumTools: "outils",
  sumDetail: "Détail",
  sumFoot: "Estimation seulement, à confirmer avec votre comptable. Recherche au 14 octobre 2026.",
};

export type IncentiveStrings = typeof fr;

const en: IncentiveStrings = {
  eyebrow: "Quebec · Ontario · Federal · updated October 14, 2026",
  h1: "How much can you recover on robotic mowers and battery tools?",
  lede: "First-year grants, tax credits and write-offs on robotic mowers and battery tools, with the official link for each program.",
  s1: "Where are you?",
  s2: "You are",
  s2farm: "Type of farm",
  s2mapaq: "Farm registered with MAPAQ?",
  bonus: "Young farmer (relève) or certified organic",
  s2struct: "Organization structure",
  taxLabel: "Estimated tax rate",
  taxHelp: "Example: 12.2% for a small corporation, 30% for a sole proprietor. Your accountant can confirm.",
  s2city: "Your municipality",
  s3: "What are you buying?",
  robotLabel: "Robotic mowers",
  robotHelp: "Total amount before tax",
  toolLabel: "Battery tools",
  toolHelp: "Trimmers, blowers, hedge trimmers, push mowers. Total amount before tax",
  under500: "Most cost under $500 each",
  exampleNote: "Example amounts. Replace them with your quote.",
  prov_QC: "Quebec",
  prov_ON: "Ontario",
  who_landscaper: "Landscaper",
  who_golf: "Golf course",
  who_farm: "Farm or nursery",
  who_municipality: "Municipality",
  who_institution: "School, non-profit or cemetery",
  who_developer: "Property developer or manager",
  who_homeowner: "Homeowner",
  farm_orchard: "Orchard",
  farm_vineyard: "Vineyard",
  farm_berries: "Berries",
  farm_vegetables: "Vegetables",
  farm_nursery: "Nursery, trees and shrubs",
  farm_field: "Field crops or other",
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
  struct_corp: "Corporation (inc.)",
  struct_soleprop: "Sole proprietor or partnership",
  struct_exempt: "Tax-exempt (municipal, non-profit)",
  city_stbruno: "Saint-Bruno-de-Montarville",
  city_granby: "Granby",
  city_stlaurent: "Saint-Laurent (Montreal)",
  city_terrebonne: "Terrebonne",
  city_repentigny: "Repentigny",
  city_stsauveur: "Saint-Sauveur",
  city_other: "Other city",
  kicker: "Estimated first-year savings",
  keptLabel: "Money kept (grants and tax credit)",
  keptHelp: "Money the buyer keeps.",
  timingLabel: "Tax deferred (faster write-offs)",
  timingHelp: "Less tax in year one, but the total deduction over the equipment’s life stays the same.",
  totalLabel: "Total first-year effect",
  kind: { kept: "Money kept", timing: "Tax timing" },
  ofPurchase: (p, range) => `on a ${p} purchase${range}`,
  pctRange: (a, b) => (a === b ? ` (${a} of the purchase)` : ` (${a} to ${b} of the purchase)`),
  none: "No support found for this profile and purchase.",
  enterAmt: "Enter a purchase amount to see the estimate.",
  legendLow: "Rules in force",
  legendHigh: "Needs confirmation or approval",
  rangeNote: "The low end counts only rules in force. The high end adds items that need confirmation or approval.",
  breakdown: "Breakdown",
  programs: "Other useful programs",
  copy: "Copy my summary",
  copied: "Summary copied. Paste it in a text to your dealer.",
  copyFail: "Copy blocked. Select the text below.",
  bar_label: "Total first-year effect",
  bar_btn: "See details",
  timing: "Accelerated write-offs cut tax in year one. Over the life of the equipment, the total deduction stays the same. The tax credit and grants are net gains.",
  watch: "Watch for: passage of the Productivity Mega Deduction (proposed September 15, 2026, not yet law) and whether Quebec matches it, the new Prime-Vert version in force since October 13, 2026 (rates to re-verify), Quebec’s new government after the October 5, 2026 election, and municipal rebates reopening in early 2027.",
  disclaimer: "Estimate for information only, not tax or legal advice. Programs change often and funds run out. Confirm with your accountant or the program officer before you buy.",
  tag: { ok: "In force", warn: "To confirm", apply: "Application", off: "Closed", info: "Info" },
  linkOfficial: "Official page",
  linkClasses: "CCA classes (CRA)",
  linkClass56: "Class 56 (Finance Canada)",
  linkNews: "News article",
  linkCity: "City website",
  linkPdf: "City document",
  linkBudget: "2025-26 budget summary",
  linkPmd: "Mega Deduction (Finance Canada)",
  i_itc: "Clean Technology Investment Tax Credit (30%, refundable)",
  d_itc: "Robotic mowers, if accepted as non-road zero-emission vehicles (Class 56). Official examples are mostly heavy mining and construction equipment, so a robotic mower’s eligibility is not confirmed. Taxable corporations only.",
  i_ccaR: "Accelerated write-off on robotic mowers",
  d_ccaR: "Low: Class 8 with the accelerated incentive, 30% in year one (in force). High: 100% in year one under the Productivity Mega Deduction proposed for purchases from September 15, 2026 (not yet law), or under Class 56 if the robot is accepted as self-propelled, fully electric equipment.",
  i_ccaT: "Write-off on battery tools",
  d_ccaT12: "Tools under $500 each: Class 12, 100% in year one.",
  d_ccaT8: "Tools $500 and over: Class 8 with the accelerated incentive, 30% in year one (in force). High: 100% under the proposed Productivity Mega Deduction (purchases from September 15, 2026, not yet law).",
  i_pv: "Prime-Vert (MAPAQ): weeding equipment",
  d_pv: (rate) =>
    `Up to ${rate}% of the purchase, max. $40,000 per farm. Robotic under-row mowing must be justified as herbicide reduction. Get your MAPAQ regional office to agree before you buy.`,
  i_gmfPilot: "Green Municipal Fund: pilot project",
  d_gmfPilot: "Up to 50%, max. $500,000, to test an innovative GHG-reduction solution such as robotic mowing in parks. Confirm the intake with GMF.",
  i_tbNpo: "Terrebonne: durable equipment for recognized organizations",
  d_tbNpo: "Up to 30%, max. $5,000, once a year. Apply by April 15.",
  i_stbruno: "Saint-Bruno: gas tool trade-in",
  d_stbruno: "Up to $100 per household. Drop the gas tool at the Ecocentre by November 30, 2026 and buy the electric tool before the end of 2026. Robotic mower: confirm with the city.",
  i_granby: "Granby: eco-mower rebate",
  d_granby: "Battery mower: 50% up to $75. Buy from a Granby merchant. Claim by May 1 of the following year. Robotic mower: confirm with the city.",
  i_stlaurent: "Saint-Laurent: fuel-free yard equipment",
  d_stlaurent: "2026 program closed, funds exhausted. Watch for 2027: 50% up to $200.",
  i_terrebonne: "Terrebonne: electric equipment rebate",
  d_terrebonne: "A 50% rebate is reported. Cap and 2026 status to confirm with the city. Not included in the estimate.",
  i_repentigny: "Repentigny: electric mower or trimmer rebate",
  d_repentigny: "A rebate of up to 75% is reported for purchases in Quebec. Cap and 2026 status to confirm. Not included in the estimate.",
  i_stsauveur: "Saint-Sauveur: green gardening equipment",
  d_stsauveur: "50% up to $50 per item, one rebate per address. Claim within 12 months of purchase.",
  c_gmfCap: "Green Municipal Fund: fleet electrification",
  p_gmfCap: "Loan plus grant up to 80% of costs, max. $10M. The grant equals 15% of the loan. Electric equipment is assessed case by case. Quebec municipalities apply through MAMH.",
  c_gmfStudy: "Green Municipal Fund: fleet study",
  p_gmfStudy: "Up to 50%, max. $200,000, to plan electrification of parks and grounds equipment.",
  c_pvTrial: "Prime-Vert: on-farm trials",
  p_pvTrial: "Up to 70%, max. $15,000 per trial ($30,000 per farm). A good way to compare robotic mowing with herbicide, with an advisor.",
  c_mfor: "Services Québec: workforce training",
  p_mfor: "Help to train your team on new equipment, often up to 50% of eligible costs. Contact your regional office before training starts.",
  c_ojg: "Ontario Job Grant (training)",
  p_ojg: "Up to $10,000 per trainee. Employers with fewer than 100 staff pay 1/6 of costs. Training by an eligible third-party provider.",
  c_csbfp: "Canada Small Business Financing Program",
  p_csbfp: "Federally guaranteed bank loan: up to $1.15M, with max. $500,000 for equipment. Revenue of $10M or less. Farms excluded.",
  c_qcHarm: "Quebec income tax",
  p_qcHarm: "Quebec extended its accelerated write-offs, partly matching the federal rules. As of October 14, 2026 it had announced nothing for the Productivity Mega Deduction. Have your accountant confirm before you file.",
  c_noItc: "30% credit: corporations only",
  p_noItc: "A sole proprietor or partnership can’t claim it, but still gets the accelerated write-off.",
  c_exempt: "Tax-exempt organization",
  p_exempt: "Write-offs and the tax credit don’t apply. Focus on grants and training.",
  c_lease: "Leasing or subscription",
  p_lease: "The owner of the equipment claims the write-off and the tax credit, not the customer who rents it.",
  c_onHome: "Ontario: no rebate found",
  p_onHome: "No provincial or municipal rebate for electric mowers or yard tools was found in Ontario for 2026.",
  c_otherCity: "Check your city",
  p_otherCity: "Many Quebec cities rebate $50 to $200 on an electric mower or tool. Check your city’s website; funds run out fast.",
  c_mapaqReg: "MAPAQ registration required",
  p_mapaqReg: "Prime-Vert requires a farm registered with MAPAQ. Register the farm before you apply.",
  c_farmFit: "Prime-Vert: weaker fit for this farm type",
  p_farmFit: "Robotic mowing as an herbicide alternative fits best in orchards, vineyards, berries and nurseries.",
  sumTitle: "Estimate: robotic mowers and battery tools",
  sumProfile: "Profile",
  sumBuy: "Purchase",
  sumRobots: "robots",
  sumTools: "tools",
  sumDetail: "Breakdown",
  sumFoot: "Estimate only, to confirm with your accountant. Research as of October 14, 2026.",
};

export const STRINGS: Record<Lang, IncentiveStrings> = { fr, en };

export function formatMoney(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function formatPct(x: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(x);
}

export function rangeText(low: number, high: number, lang: Lang): string {
  return Math.round(low) === Math.round(high)
    ? formatMoney(high, lang)
    : `${formatMoney(low, lang)} – ${formatMoney(high, lang)}`;
}

/** Tax structure that actually applies: only business profiles pick one. */
function effectiveStructure(s: IncentiveInputs): Structure | "personal" {
  if (BUSINESS_PROFILES.includes(s.who)) return s.struct;
  return s.who === "homeowner" ? "personal" : "exempt";
}

/**
 * Grants and rebates are computed first because they reduce the cost base for
 * both the Clean Tech ITC and CCA; the ITC in turn reduces the CCA base.
 */
export function computeIncentives(s: IncentiveInputs, lang: Lang): IncentiveResult {
  const L = STRINGS[lang];
  const R = s.buyRobot ? Math.max(0, s.robotAmt) : 0;
  const Tl = s.buyTools ? Math.max(0, s.toolAmt) : 0;
  const P = R + Tl;
  const qc = s.prov === "QC";
  const struct = effectiveStructure(s);
  const taxable = struct === "corp" || struct === "soleprop";
  const items: IncentiveItem[] = [];
  const cards: ProgramCard[] = [];
  const add = (item: Omit<IncentiveItem, "kind">, kind: ItemKind = "kept") => items.push({ ...item, kind });
  const card = (c: ProgramCard) => cards.push(c);

  // Grants and rebates
  let pvHigh = 0;
  if (s.who === "farm" && qc) {
    const fits = PRIME_VERT_FARMS.includes(s.farm);
    if (s.mapaq === "no") {
      card({ t: L.c_mapaqReg, p: L.p_mapaqReg, tag: "info", info: true, links: [[L.linkOfficial, LINKS.primevert]] });
    }
    if (!fits) card({ t: L.c_farmFit, p: L.p_farmFit, tag: "info", info: true });
    if (R > 0 && fits && s.mapaq !== "no") {
      const rate = 0.5 + (s.bonus ? 0.15 : 0);
      pvHigh = Math.min(rate * R, 40000);
      add({ t: L.i_pv, d: L.d_pv(Math.round(rate * 100)), tag: "apply", low: 0, high: pvHigh, links: [[L.linkOfficial, LINKS.primevert]] });
    }
    card({ t: L.c_pvTrial, p: L.p_pvTrial, tag: "apply", links: [[L.linkOfficial, LINKS.primevert]] });
  }
  if (s.who === "municipality" && P > 0) {
    add({ t: L.i_gmfPilot, d: L.d_gmfPilot, tag: "apply", low: 0, high: Math.min(0.5 * P, 500000), links: [[L.linkOfficial, LINKS.gmfPilot]] });
  }
  if (s.who === "municipality" || s.who === "institution") {
    card({ t: L.c_gmfCap, p: L.p_gmfCap, tag: "apply", links: [[L.linkOfficial, LINKS.gmfCap]] });
    if (s.who === "municipality") {
      card({ t: L.c_gmfStudy, p: L.p_gmfStudy, tag: "apply", links: [[L.linkOfficial, LINKS.gmfStudy]] });
    }
  }
  if (s.who === "institution" && qc && s.city === "terrebonne" && P > 0) {
    add({ t: L.i_tbNpo, d: L.d_tbNpo, tag: "apply", low: 0, high: Math.min(0.3 * P, 5000), links: [[L.linkPdf, LINKS.terrebonneNpo]] });
  }
  if (s.who === "homeowner") {
    if (!qc) {
      card({ t: L.c_onHome, p: L.p_onHome, tag: "info", info: true });
    } else if (P > 0) {
      switch (s.city) {
        case "stbruno":
          add({ t: L.i_stbruno, d: L.d_stbruno, tag: "ok", low: Tl > 0 ? Math.min(100, Tl) : 0, high: Math.min(100, P), links: [[L.linkNews, LINKS.stbruno], [L.linkCity, LINKS.stbrunoCity]] });
          break;
        case "granby": {
          const base = R > 0 ? R : Tl;
          add({ t: L.i_granby, d: L.d_granby, tag: "warn", low: 0, high: Math.min(0.5 * base, 75), links: [[L.linkPdf, LINKS.granby]] });
          break;
        }
        case "stlaurent":
          add({ t: L.i_stlaurent, d: L.d_stlaurent, tag: "off", low: 0, high: 0, links: [[L.linkOfficial, LINKS.stlaurent]] });
          break;
        case "terrebonne":
          add({ t: L.i_terrebonne, d: L.d_terrebonne, tag: "warn", low: 0, high: 0, links: [[L.linkCity, LINKS.terrebonne]] });
          break;
        case "repentigny":
          add({ t: L.i_repentigny, d: L.d_repentigny, tag: "warn", low: 0, high: 0, links: [[L.linkCity, LINKS.repentigny]] });
          break;
        case "stsauveur":
          add({ t: L.i_stsauveur, d: L.d_stsauveur, tag: "ok", low: Tl > 0 ? Math.min(0.5 * Tl, 50) : 0, high: Math.min(0.5 * P, 50), links: [[L.linkPdf, LINKS.stsauveur]] });
          break;
        case "other":
          card({ t: L.c_otherCity, p: L.p_otherCity, tag: "info", info: true });
          break;
      }
    }
  }

  // Tax measures
  if (taxable && P > 0) {
    if (R > 0) {
      const baseHigh = R - pvHigh;
      const itc = struct === "corp" ? 0.3 * baseHigh : 0;
      if (struct === "corp") {
        add({ t: L.i_itc, d: L.d_itc, tag: "warn", low: 0, high: itc, links: [[L.linkOfficial, LINKS.itc]] });
      }
      add({
        t: L.i_ccaR,
        d: L.d_ccaR,
        tag: "warn",
        low: 0.3 * R * s.tax,
        high: (baseHigh - itc) * s.tax,
        links: [[L.linkPmd, LINKS.pmd], [L.linkClass56, LINKS.class56], [L.linkClasses, LINKS.cca]],
      }, "timing");
    }
    if (Tl > 0) {
      if (s.under500) {
        add({ t: L.i_ccaT, d: L.d_ccaT12, tag: "ok", low: Tl * s.tax, high: Tl * s.tax, links: [[L.linkClasses, LINKS.cca]] }, "timing");
      } else {
        // 30% is law; 100% depends on the proposed Mega Deduction passing.
        add({ t: L.i_ccaT, d: L.d_ccaT8, tag: "warn", low: 0.3 * Tl * s.tax, high: Tl * s.tax, links: [[L.linkPmd, LINKS.pmd], [L.linkClasses, LINKS.cca]] }, "timing");
      }
    }
  }

  // Other useful programs
  if (struct === "soleprop" && R > 0) {
    card({ t: L.c_noItc, p: L.p_noItc, tag: "info", info: true, links: [[L.linkOfficial, LINKS.itc]] });
  }
  if (struct === "exempt" && s.who !== "homeowner") card({ t: L.c_exempt, p: L.p_exempt, tag: "info", info: true });
  if (s.who !== "homeowner" && s.who !== "municipality") {
    if (qc) card({ t: L.c_mfor, p: L.p_mfor, tag: "apply", links: [[L.linkOfficial, LINKS.mfor]] });
    else card({ t: L.c_ojg, p: L.p_ojg, tag: "apply", links: [[L.linkOfficial, LINKS.ojg]] });
  }
  if (taxable && s.who !== "farm") card({ t: L.c_csbfp, p: L.p_csbfp, tag: "apply", links: [[L.linkOfficial, LINKS.csbfp]] });
  if (taxable && qc) card({ t: L.c_qcHarm, p: L.p_qcHarm, tag: "warn", links: [[L.linkBudget, LINKS.qcBudget]] });
  if (taxable) card({ t: L.c_lease, p: L.p_lease, tag: "info", info: true });

  const sum = (kind: ItemKind, end: "low" | "high") =>
    items.reduce((total, i) => (i.kind === kind ? total + i[end] : total), 0);
  const keptLow = sum("kept", "low");
  const keptHigh = sum("kept", "high");
  const timingLow = sum("timing", "low");
  const timingHigh = sum("timing", "high");
  return {
    P, R, Tl, items, cards,
    low: keptLow + timingLow,
    high: keptHigh + timingHigh,
    keptLow, keptHigh, timingLow, timingHigh,
  };
}

/** True when an item has no dollar value to show (closed or unconfirmed). */
export function isZeroItem(i: IncentiveItem): boolean {
  return i.tag === "off" || (i.high === 0 && i.low === 0);
}

/** "Golf course, Quebec, Corporation (inc.)" and "$27,000 (robots $24,000, tools $3,000)". */
export function describeInputs(s: IncentiveInputs, r: IncentiveResult, lang: Lang): { profile: string; purchase: string } {
  const L = STRINGS[lang];
  const bits = [L[`who_${s.who}`], L[`prov_${s.prov}`]];
  if (s.who === "farm") bits.push(L[`farm_${s.farm}`]);
  if (BUSINESS_PROFILES.includes(s.who)) bits.push(L[`struct_${s.struct}`]);
  if (s.prov === "QC" && (s.who === "homeowner" || s.who === "institution")) bits.push(L[`city_${s.city}`]);

  const buy: string[] = [];
  if (r.R > 0) buy.push(`${L.sumRobots} ${formatMoney(r.R, lang)}`);
  if (r.Tl > 0) buy.push(`${L.sumTools} ${formatMoney(r.Tl, lang)}`);
  return { profile: bits.join(", "), purchase: `${formatMoney(r.P, lang)} (${buy.join(", ")})` };
}

/** Plain-text summary for pasting into a proposal or a text message. */
export function summaryText(s: IncentiveInputs, r: IncentiveResult, lang: Lang): string {
  const L = STRINGS[lang];
  const { profile, purchase } = describeInputs(s, r, lang);
  const sep = lang === "fr" ? " : " : ": ";

  const lines = [
    L.sumTitle,
    `${L.sumProfile}${sep}${profile}`,
    `${L.sumBuy}${sep}${purchase}`,
    `${L.keptLabel}${sep}${rangeText(r.keptLow, r.keptHigh, lang)}`,
    `${L.timingLabel}${sep}${rangeText(r.timingLow, r.timingHigh, lang)}`,
    `${L.totalLabel}${sep}${r.high > 0 ? rangeText(r.low, r.high, lang) : formatMoney(0, lang)}`,
    "",
    `${L.sumDetail}${sep.trimEnd()}`,
  ];
  for (const i of r.items) {
    const amount = isZeroItem(i) ? "–" : rangeText(i.low, i.high, lang);
    lines.push(`- ${i.t} [${L.tag[i.tag]} · ${L.kind[i.kind]}]: ${amount}${i.links[0] ? ` ${i.links[0][1]}` : ""}`);
  }
  for (const c of r.cards) {
    if (c.links?.[0]) lines.push(`- ${c.t}: ${c.links[0][1]}`);
  }
  lines.push("", L.sumFoot);
  return lines.join("\n");
}
