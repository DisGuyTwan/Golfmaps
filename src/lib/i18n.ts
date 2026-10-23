/**
 * App-wide UI copy in English and Quebec French: tab bar, Acreage tab, search
 * and error page. The Incentives tab keeps its copy in incentives.ts and the
 * ROI tab in roi-copy.ts, next to their logic.
 */
import type { Lang } from "./preferences";

export type { Lang };

export type MeasureErrorKind =
  | "unreachable"
  | "busy"
  | "tooLarge"
  | "http"
  | "sodUnreachable"
  | "sodTooLarge"
  | "noLot"
  | "lotUnreachable";

const en = {
  tabs: { acreage: "Acreage", incentives: "Incentives", roi: "ROI" },
  langGroup: "Language / Langue",
  sections: "Sections",
  toDark: "Switch to dark mode",
  toLight: "Switch to light mode",
  loading: "Loading…",
  printPdf: "Print / PDF",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  copyPrompt: "Copy this link:",
  loadingMap: "Loading map…",
  layers: { satellite: "Satellite", streets: "Streets" },

  panelTitle: "Golf turf acreage",
  sodPanelTitle: "Sod field acreage",
  modeGroup: "What to measure",
  modes: { golf: "Golf course", sod: "Sod farm", lawn: "Lawn" },
  clear: "Clear",
  tapFirst: "Tap one corner of the area to scan",
  tapSecond: "Tap the opposite corner of the scan area",
  cancel: "Cancel",
  measuring: "Measuring…",
  measure: "Measure course in view",
  selectArea: "Select area",
  notFound:
    "No golf course found in view. Search a course above, or pan/zoom so the course fills the screen, then measure again. If the course isn’t in OpenStreetMap, trace its outline.",
  boundaryOnly:
    "Only this course’s outline is mapped in OpenStreetMap, not its fairways, greens and tees. The turf is estimated from satellite land cover inside the outline instead.",
  outlineTraced: "Course outline traced by hand. The turf is estimated from satellite land cover inside it.",
  traceOutline: "Trace the course outline",
  traceField: "Trace a field",
  traceHint: "Tap each corner on the satellite image. Tap the first point again, or Done, to close the shape.",
  tracePoints: (n: number) => (n === 1 ? "1 point" : `${n} points`),
  undoPoint: "Undo point",
  done: "Done",

  satGrass: "Grass",
  satTrees: "Trees",
  satBuilt: "Built",
  satWater: "Water",
  satTotal: "Estimated turf",
  satSeen: "Grass seen by satellite",
  satRange: (low: string, high: string) => `Likely between ${low} and ${high} ac`,
  satLoading: "Counting grass from satellite land cover…",
  satError: "Couldn’t load satellite land cover. Try measuring again, or enter the mowed acreage by hand.",
  satTooLarge: "This outline is too large for the satellite count. Enter the mowed acreage by hand.",
  satNote: (year: number) =>
    `Grass seen in ESA WorldCover ${year} (10 m satellite land cover), with trees, buildings, roads and water left out. It also takes in hay, meadows and native areas: on 45 fully mapped courses in Ontario, Quebec and nearby states, maintained turf was 59% of it, and most fell within the range shown.`,
  grassPct: "Turf mowed by robot (%)",
  grassPctHint: "Estimated turf still holds greens, tees and some rough that robots don’t mow.",

  findSod: "Find sod fields in view",
  sodSearchPlaceholder: "Search a sod farm or address",
  sodNone: (year: number) =>
    `No sod fields in view on Agriculture Canada’s ${year} crop map. Pan or zoom out to the farm, or trace the fields by hand.`,
  sodFields: "Fields",
  sodDetected: "Detected",
  sodTraced: "Traced",
  sodTotal: "Sod fields counted",
  sodLeftOut: (n: number, ac: string) => `Left out: ${n === 1 ? "1 field" : `${n} fields`} (${ac} ac)`,
  sodTapHint: "Tap a field on the map to leave it out of the quote, or to put it back.",
  sodSource: (year: number) =>
    `Detected fields: Agriculture and Agri-Food Canada, Annual Crop Inventory ${year}. Its 30 m pixels put field edges within about 15 m; traced fields are measured exactly.`,
  sodPct: "Sod being mowed (%)",
  sodPctHint: "Fields just harvested or reseeded aren’t mowed.",

  lawnPanelTitle: "Residential lawn",
  lawnSearchPlaceholder: "Search a residential address",
  selectLot: "Select a lot",
  tapLot: "Tap the lot to measure",
  traceLot: "Trace the lot",
  removeArea: "Remove an area",
  removeDriveway: "Remove a driveway",
  drivewayHint: "Tap along the middle of the driveway, from the street to the garage, then Done.",
  drivewayWidthGroup: "Driveway width",
  drivewayWidth: (cars: number, ft: number) => `${cars} car${cars > 1 ? "s" : ""} · ${ft} ft`,
  sqftUnit: "sq ft",
  lawnPaved: "Paving",
  lawnLoading: "Finding the lot and its buildings…",
  lawnLot: "Lot",
  lawnBuilt: "Buildings",
  lawnTracedOut: "Traced out",
  lawnTotal: "Lawn",
  lawnLotNumber: (n: string) => `Lot ${n}, Quebec cadastre (indicative)`,
  lawnLotTraced: "Lot traced by hand",
  lawnNoBuilding:
    "No building is mapped on this lot in OpenStreetMap. Use Remove an area to trace the house out.",
  lawnBuildingsFailed:
    "Couldn’t load the buildings from OpenStreetMap. Use Remove an area to trace the house out.",
  lawnRemoveHint:
    "Remove a driveway: tap along it and pick its width. Remove an area: a patio, garden bed or a house that isn’t mapped. Tap a traced area to put it back.",
  lawnTreesNote: "Lawn under trees counts as lawn.",
  lawnOddLot: (size: string) =>
    `This lot (${size}) looks too big or too narrow for one house: it may be the street. Tap the house itself with Select a lot, or trace the lot.`,
  lawnQuoteTitle: "Lawn for the quote",
  lawnOverride: "Manual override (sq ft)",
  lawnQuoteTotal: "Lawn for quote",
  categories: { fairway: "Fairway", rough: "Rough", green: "Green", tee: "Tee" },
  courseArea: "Course area",
  totalTurf: "Total turf",
  courseBoundary: "Course boundary",
  drivingRange: "Driving range",
  treesRemoved: "Trees removed",
  builtRemoved: "Buildings/parking removed",
  roughNote:
    "*Rough is estimated: course boundary minus fairways, greens, tees, driving range, water, sand, mapped trees and buildings/parking (may still include unmapped trees or paths).",
  attribution: "Imagery © Esri · Map data © OpenStreetMap contributors",
  attributionWorldCover: "Land cover © ESA WorldCover project, contains modified Copernicus Sentinel data",
  attributionAci: "Crop map © Agriculture and Agri-Food Canada, Open Government Licence – Canada",
  attributionCadastre: "Lots © Gouvernement du Québec (cadastre, indicative only)",

  quoteTitle: "Acres for the quote",
  quoteCats: { fairway: "Fairways", rough: "Rough", green: "Greens", tee: "Tees", range: "Driving range" },
  reelHint: "Greens and tees are usually cut with reel mowers, not robots.",
  roughPct: "Rough actually mowed (%)",
  roughPctHint: "Estimated rough still includes cart paths, unmapped trees and native areas.",
  override: "Manual override (ac)",
  overridePlaceholder: "Optional",
  quoteTotal: "Acres for quote",
  needsOverride: "Only the outline is mapped: enter the mowed acreage by hand.",
  sendToRoi: "Send to ROI",
  reportPdf: "PDF report",
  reportTitle: "Turf acreage report",
  reportLede:
    "Turf measured from OpenStreetMap, net of trees, buildings and parking, and the acreage the robotic mowing quote is built on.",
  reportCourse: "Course",
  reportDate: "Date",
  reportCategory: "Category",
  reportMeasured: "Measured",
  reportCounted: "In quote",
  reportRoughAt: (pct: number) => `Rough counted at ${pct}%.`,
  reportOverride: (ac: string) => `Manual override: ${ac} ac replaces the measured total.`,
  reportEmpty: "Measure a course on the Acreage tab first.",
  unnamedCourse: "Area measured on the map",
  reportGrassAt: (pct: number) => `Estimated turf counted at ${pct}%.`,
  reportSodTitle: "Sod field acreage report",
  reportSodLede:
    "Sod fields from Agriculture Canada’s crop map and traced on satellite imagery, and the acreage the robotic mowing quote is built on.",
  reportFarm: "Farm",
  reportSodEmpty: "Find or trace sod fields on the Acreage tab first.",
  reportFieldsDetected: "Fields detected",
  reportFieldsTraced: "Fields traced by hand",
  reportFieldsLeftOut: "Fields left out",
  reportSodAt: (pct: number) => `Sod counted at ${pct}%: fields just harvested or reseeded aren’t mowed.`,
  unnamedFarm: "Farm measured on the map",
  reportLawnTitle: "Lawn area report",
  reportLawnLede:
    "Lawn measured on the lot, net of the buildings, pools and areas traced out, for a robotic mowing quote.",
  reportAddress: "Address",
  reportLawnEmpty: "Select a lot on the Acreage tab first.",
  reportLawnOverride: (v: string) => `Manual override: ${v} replaces the measured lawn.`,
  unnamedLot: "Lot selected on the map",

  searchPlaceholder: "Search a golf course or address",
  clearSearch: "Clear search",

  measureError: {
    unreachable: "Couldn’t reach the OpenStreetMap data servers. They may be busy. Try again in a moment.",
    busy: "The OpenStreetMap data servers are busy right now. Please wait a moment and try again.",
    tooLarge: "That area was too large for the free data API. Zoom in closer to the course and measure again.",
    http: (status: number) => `The data request failed (HTTP ${status}). Please try again.`,
    sodUnreachable: "Couldn’t load Agriculture Canada’s crop map. Try again in a moment, or trace the fields by hand.",
    sodTooLarge: "That area is too large for the crop map. Zoom in on the farm (about 15 km across at most) and try again.",
    noLot: "No lot boundary found here. The Quebec cadastre only covers Quebec: trace the lot instead.",
    lotUnreachable: "Couldn’t reach the Quebec cadastre. Try again in a moment, or trace the lot.",
  },

  errorTitle: "Something went wrong.",
  errorBody:
    "This is usually a public data service, like the Overpass API, being unavailable. Retrying often works; if it doesn’t, wait a minute and try again.",
  tryAgain: "Try again",
  notFoundTitle: "Page not found.",
  notFoundBody: "This address doesn’t exist. The tools are all on the home page.",
  backHome: "Back to Calculator",
};

export type UiStrings = typeof en;

const fr: UiStrings = {
  tabs: { acreage: "Superficie", incentives: "Incitatifs", roi: "ROI" },
  langGroup: "Langue / Language",
  sections: "Sections",
  toDark: "Passer au mode sombre",
  toLight: "Passer au mode clair",
  loading: "Chargement…",
  printPdf: "Imprimer / PDF",
  copyLink: "Copier le lien",
  linkCopied: "Lien copié",
  copyPrompt: "Copiez ce lien :",
  loadingMap: "Chargement de la carte…",
  layers: { satellite: "Satellite", streets: "Plan" },

  panelTitle: "Superficie du gazon",
  sodPanelTitle: "Superficie des champs de gazon",
  modeGroup: "Quoi mesurer",
  modes: { golf: "Terrain de golf", sod: "Gazonnière", lawn: "Pelouse" },
  clear: "Effacer",
  tapFirst: "Touchez un coin de la zone à analyser",
  tapSecond: "Touchez le coin opposé de la zone à analyser",
  cancel: "Annuler",
  measuring: "Mesure en cours…",
  measure: "Mesurer le terrain affiché",
  selectArea: "Choisir une zone",
  notFound:
    "Aucun terrain de golf trouvé dans la vue. Cherchez un terrain ci-dessus, ou déplacez la carte pour que le terrain remplisse l’écran, puis mesurez de nouveau. Si le terrain n’est pas dans OpenStreetMap, tracez son contour.",
  boundaryOnly:
    "Seul le contour de ce terrain est cartographié dans OpenStreetMap, pas ses allées, verts et départs. Le gazon est plutôt estimé à partir de la couverture du sol par satellite à l’intérieur du contour.",
  outlineTraced: "Contour du terrain tracé à la main. Le gazon est estimé à partir de la couverture du sol par satellite à l’intérieur.",
  traceOutline: "Tracer le contour du terrain",
  traceField: "Tracer un champ",
  traceHint: "Touchez chaque coin sur l’image satellite. Touchez de nouveau le premier point, ou Terminé, pour fermer la forme.",
  tracePoints: (n: number) => (n <= 1 ? `${n} point` : `${n} points`),
  undoPoint: "Annuler le point",
  done: "Terminé",

  satGrass: "Gazon",
  satTrees: "Arbres",
  satBuilt: "Bâti",
  satWater: "Eau",
  satTotal: "Gazon entretenu estimé",
  satSeen: "Gazon vu par satellite",
  satRange: (low: string, high: string) => `Probablement entre ${low} et ${high} ac`,
  satLoading: "Comptage du gazon à partir de la couverture du sol par satellite…",
  satError:
    "Impossible de charger la couverture du sol par satellite. Mesurez de nouveau, ou entrez la superficie tondue à la main.",
  satTooLarge: "Ce contour est trop grand pour le comptage par satellite. Entrez la superficie tondue à la main.",
  satNote: (year: number) =>
    `Gazon vu dans ESA WorldCover ${year} (couverture du sol par satellite, 10 m), sans les arbres, bâtiments, routes et plans d’eau. Il inclut aussi du foin, des prés et des zones naturelles : sur 45 terrains entièrement cartographiés en Ontario, au Québec et dans les États voisins, le gazon entretenu en représentait 59 %, et la plupart se situaient dans la fourchette indiquée.`,
  grassPct: "Gazon tondu par robot (%)",
  grassPctHint: "Le gazon entretenu estimé inclut encore les verts, les départs et une partie de l’herbe longue que les robots ne tondent pas.",

  findSod: "Trouver les champs de gazon affichés",
  sodSearchPlaceholder: "Chercher une gazonnière ou une adresse",
  sodNone: (year: number) =>
    `Aucun champ de gazon dans la vue sur la carte des cultures ${year} d’Agriculture Canada. Déplacez la carte ou dézoomez sur la ferme, ou tracez les champs à la main.`,
  sodFields: "Champs",
  sodDetected: "Détectés",
  sodTraced: "Tracés",
  sodTotal: "Champs de gazon comptés",
  sodLeftOut: (n: number, ac: string) => `Exclus : ${n <= 1 ? `${n} champ` : `${n} champs`} (${ac} ac)`,
  sodTapHint: "Touchez un champ sur la carte pour l’exclure de la soumission, ou pour le remettre.",
  sodSource: (year: number) =>
    `Champs détectés : Agriculture et Agroalimentaire Canada, Inventaire annuel des cultures ${year}. Ses pixels de 30 m placent les bords des champs à environ 15 m près; les champs tracés sont mesurés exactement.`,
  sodPct: "Gazon en tonte (%)",
  sodPctHint: "Les champs fraîchement récoltés ou ressemés ne sont pas tondus.",

  lawnPanelTitle: "Pelouse résidentielle",
  lawnSearchPlaceholder: "Chercher une adresse résidentielle",
  selectLot: "Choisir un terrain",
  tapLot: "Touchez le terrain à mesurer",
  traceLot: "Tracer le terrain",
  removeArea: "Retirer une zone",
  removeDriveway: "Retirer une entrée",
  drivewayHint: "Touchez le long du centre de l’entrée de garage, de la rue au garage, puis Terminé.",
  drivewayWidthGroup: "Largeur de l’entrée",
  drivewayWidth: (cars: number, ft: number) => `${cars} auto${cars > 1 ? "s" : ""} · ${ft} pi`,
  sqftUnit: "pi²",
  lawnPaved: "Pavé",
  lawnLoading: "Recherche du terrain et de ses bâtiments…",
  lawnLot: "Terrain",
  lawnBuilt: "Bâtiments",
  lawnTracedOut: "Retiré",
  lawnTotal: "Pelouse",
  lawnLotNumber: (n: string) => `Lot ${n}, cadastre du Québec (à titre indicatif)`,
  lawnLotTraced: "Terrain tracé à la main",
  lawnNoBuilding:
    "Aucun bâtiment n’est cartographié sur ce terrain dans OpenStreetMap. Utilisez Retirer une zone pour tracer la maison.",
  lawnBuildingsFailed:
    "Impossible de charger les bâtiments d’OpenStreetMap. Utilisez Retirer une zone pour tracer la maison.",
  lawnRemoveHint:
    "Retirer une entrée : touchez le long de l’entrée et choisissez sa largeur. Retirer une zone : un patio, une plate-bande ou une maison non cartographiée. Touchez une zone tracée pour la remettre.",
  lawnTreesNote: "La pelouse sous les arbres compte comme pelouse.",
  lawnOddLot: (size: string) =>
    `Ce lot (${size}) semble trop grand ou trop étroit pour une maison : c’est peut-être la rue. Touchez la maison elle-même avec Choisir un terrain, ou tracez le terrain.`,
  lawnQuoteTitle: "Pelouse pour la soumission",
  lawnOverride: "Valeur saisie à la main (pi²)",
  lawnQuoteTotal: "Pelouse pour la soumission",
  categories: { fairway: "Allée", rough: "Herbe longue", green: "Vert", tee: "Départ" },
  courseArea: "Superficie du terrain",
  totalTurf: "Gazon total",
  courseBoundary: "Contour du terrain",
  drivingRange: "Champ de pratique",
  treesRemoved: "Arbres retirés",
  builtRemoved: "Bâtiments et stationnements retirés",
  roughNote:
    "*L’herbe longue est estimée : contour du terrain moins les allées, verts, départs, champ de pratique, eau, sable, arbres et bâtiments ou stationnements cartographiés (peut encore inclure des arbres ou sentiers non cartographiés).",
  attribution: "Imagerie © Esri · Données © les contributeurs d’OpenStreetMap",
  attributionWorldCover: "Couverture du sol © projet ESA WorldCover, contient des données Copernicus Sentinel modifiées",
  attributionAci: "Carte des cultures © Agriculture et Agroalimentaire Canada, Licence du gouvernement ouvert – Canada",
  attributionCadastre: "Lots © Gouvernement du Québec (cadastre, à titre indicatif)",

  quoteTitle: "Acres pour la soumission",
  quoteCats: { fairway: "Allées", rough: "Herbe longue", green: "Verts", tee: "Départs", range: "Champ de pratique" },
  reelHint: "Les verts et les départs sont habituellement coupés avec des tondeuses à cylindres, pas des robots.",
  roughPct: "Herbe longue réellement tondue (%)",
  roughPctHint: "L’herbe longue estimée inclut encore des sentiers, des arbres non cartographiés et des zones naturelles.",
  override: "Valeur saisie à la main (ac)",
  overridePlaceholder: "Facultatif",
  quoteTotal: "Acres pour la soumission",
  needsOverride: "Seul le contour est cartographié : entrez la superficie tondue à la main.",
  sendToRoi: "Envoyer au ROI",
  reportPdf: "Rapport PDF",
  reportTitle: "Rapport de superficie du gazon",
  reportLede:
    "Gazon mesuré à partir d’OpenStreetMap, sans les arbres, bâtiments et stationnements, et superficie retenue pour la soumission de tonte robotisée.",
  reportCourse: "Terrain",
  reportDate: "Date",
  reportCategory: "Catégorie",
  reportMeasured: "Mesuré",
  reportCounted: "Soumission",
  reportRoughAt: (pct: number) => `Herbe longue comptée à ${pct} %.`,
  reportOverride: (ac: string) => `Valeur saisie à la main : ${ac} ac remplace le total mesuré.`,
  reportEmpty: "Mesurez d’abord un terrain dans l’onglet Superficie.",
  unnamedCourse: "Zone mesurée sur la carte",
  reportGrassAt: (pct: number) => `Gazon entretenu estimé compté à ${pct} %.`,
  reportSodTitle: "Rapport de superficie des champs de gazon",
  reportSodLede:
    "Champs de gazon tirés de la carte des cultures d’Agriculture Canada et tracés sur l’imagerie satellite, et superficie retenue pour la soumission de tonte robotisée.",
  reportFarm: "Ferme",
  reportSodEmpty: "Trouvez ou tracez d’abord des champs de gazon dans l’onglet Superficie.",
  reportFieldsDetected: "Champs détectés",
  reportFieldsTraced: "Champs tracés à la main",
  reportFieldsLeftOut: "Champs exclus",
  reportSodAt: (pct: number) =>
    `Gazon compté à ${pct} % : les champs fraîchement récoltés ou ressemés ne sont pas tondus.`,
  unnamedFarm: "Ferme mesurée sur la carte",
  reportLawnTitle: "Rapport de superficie de pelouse",
  reportLawnLede:
    "Pelouse mesurée sur le terrain, sans les bâtiments, piscines et zones retirées, pour une soumission de tonte robotisée.",
  reportAddress: "Adresse",
  reportLawnEmpty: "Choisissez d’abord un terrain dans l’onglet Superficie.",
  reportLawnOverride: (v: string) => `Valeur saisie à la main : ${v} remplace la pelouse mesurée.`,
  unnamedLot: "Terrain choisi sur la carte",

  searchPlaceholder: "Chercher un terrain de golf ou une adresse",
  clearSearch: "Effacer la recherche",

  measureError: {
    unreachable:
      "Impossible de joindre les serveurs de données OpenStreetMap. Ils sont peut-être occupés. Réessayez dans un moment.",
    busy: "Les serveurs de données OpenStreetMap sont occupés en ce moment. Patientez un moment et réessayez.",
    tooLarge:
      "Cette zone est trop grande pour l’API de données gratuite. Rapprochez-vous du terrain et mesurez de nouveau.",
    http: (status: number) => `La requête de données a échoué (HTTP ${status}). Veuillez réessayer.`,
    sodUnreachable:
      "Impossible de charger la carte des cultures d’Agriculture Canada. Réessayez dans un moment, ou tracez les champs à la main.",
    sodTooLarge:
      "Cette zone est trop grande pour la carte des cultures. Rapprochez-vous de la ferme (environ 15 km de large au plus) et réessayez.",
    noLot: "Aucune limite de terrain trouvée ici. Le cadastre du Québec ne couvre que le Québec : tracez plutôt le terrain.",
    lotUnreachable: "Impossible de joindre le cadastre du Québec. Réessayez dans un moment, ou tracez le terrain.",
  },

  errorTitle: "Une erreur est survenue.",
  errorBody:
    "C’est habituellement un service public de données, comme l’API Overpass, qui est indisponible. Réessayer fonctionne souvent; sinon, attendez une minute et réessayez.",
  tryAgain: "Réessayer",
  notFoundTitle: "Page introuvable.",
  notFoundBody: "Cette adresse n’existe pas. Tous les outils sont sur la page d’accueil.",
  backHome: "Retour à Calculator",
};

export const UI: Record<Lang, UiStrings> = { en, fr };

/** Acres, formatted for the language: "12.34" / "12,34". */
export function formatAcres(acres: number, lang: Lang): string {
  return acres.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
