/**
 * App-wide UI copy in English and Quebec French: tab bar, Acreage tab, search
 * and error page. The Incentives tab keeps its copy in incentives.ts and the
 * ROI tab in roi-copy.ts, next to their logic.
 */
import type { Lang } from "./preferences";

export type { Lang };

export type MeasureErrorKind = "unreachable" | "busy" | "tooLarge" | "http";

const en = {
  brand: "Kress",
  tabs: { acreage: "Acreage", incentives: "Incentives", roi: "ROI Voyager" },
  langGroup: "Language / Langue",
  sections: "Sections",
  toDark: "Switch to dark mode",
  toLight: "Switch to light mode",
  loading: "Loading…",
  printPdf: "Print / PDF",
  loadingMap: "Loading map…",
  layers: { satellite: "Satellite", streets: "Streets" },

  panelTitle: "Golf turf acreage",
  clear: "Clear",
  tapFirst: "Tap one corner of the area to scan",
  tapSecond: "Tap the opposite corner of the scan area",
  cancel: "Cancel",
  measuring: "Measuring…",
  measure: "⛳ Measure course in view",
  selectArea: "▭ Select area",
  notFound:
    "No golf course found in view. Search a course above, or pan/zoom so the course fills the screen, then measure again.",
  boundaryOnly:
    "Only this course’s outline is mapped in OpenStreetMap. Its fairways, greens and tees aren’t, so the turf can’t be broken down. Showing the total course boundary only.",
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

  searchPlaceholder: "Search a golf course or address",
  clearSearch: "Clear search",

  measureError: {
    unreachable: "Couldn’t reach the OpenStreetMap data servers. They may be busy. Try again in a moment.",
    busy: "The OpenStreetMap data servers are busy right now. Please wait a moment and try again.",
    tooLarge: "That area was too large for the free data API. Zoom in closer to the course and measure again.",
    http: (status: number) => `The data request failed (HTTP ${status}). Please try again.`,
  },

  errorTitle: "Something went wrong.",
  errorBody:
    "This is usually a public data service, like the Overpass API, being unavailable. Retrying often works; if it doesn’t, wait a minute and try again.",
  tryAgain: "Try again",
  notFoundTitle: "Page not found.",
  notFoundBody: "This address doesn’t exist. The tools are all on the home page.",
  backHome: "Back to Kress",
};

export type UiStrings = typeof en;

const fr: UiStrings = {
  brand: "Kress",
  tabs: { acreage: "Superficie", incentives: "Aides", roi: "ROI Voyager" },
  langGroup: "Langue / Language",
  sections: "Sections",
  toDark: "Passer au mode sombre",
  toLight: "Passer au mode clair",
  loading: "Chargement…",
  printPdf: "Imprimer / PDF",
  loadingMap: "Chargement de la carte…",
  layers: { satellite: "Satellite", streets: "Plan" },

  panelTitle: "Superficie du gazon",
  clear: "Effacer",
  tapFirst: "Touchez un coin de la zone à analyser",
  tapSecond: "Touchez le coin opposé de la zone à analyser",
  cancel: "Annuler",
  measuring: "Mesure en cours…",
  measure: "⛳ Mesurer le terrain affiché",
  selectArea: "▭ Choisir une zone",
  notFound:
    "Aucun terrain de golf trouvé dans la vue. Cherchez un terrain ci-dessus, ou déplacez la carte pour que le terrain remplisse l’écran, puis mesurez de nouveau.",
  boundaryOnly:
    "Seul le contour de ce terrain est cartographié dans OpenStreetMap. Ses allées, verts et départs ne le sont pas, donc le gazon ne peut pas être ventilé. Seule la superficie totale du terrain est affichée.",
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

  searchPlaceholder: "Chercher un terrain de golf ou une adresse",
  clearSearch: "Effacer la recherche",

  measureError: {
    unreachable:
      "Impossible de joindre les serveurs de données OpenStreetMap. Ils sont peut-être occupés. Réessayez dans un moment.",
    busy: "Les serveurs de données OpenStreetMap sont occupés en ce moment. Patientez un moment et réessayez.",
    tooLarge:
      "Cette zone est trop grande pour l’API de données gratuite. Rapprochez-vous du terrain et mesurez de nouveau.",
    http: (status: number) => `La requête de données a échoué (HTTP ${status}). Veuillez réessayer.`,
  },

  errorTitle: "Une erreur est survenue.",
  errorBody:
    "C’est habituellement un service public de données, comme l’API Overpass, qui est indisponible. Réessayer fonctionne souvent; sinon, attendez une minute et réessayez.",
  tryAgain: "Réessayer",
  notFoundTitle: "Page introuvable.",
  notFoundBody: "Cette adresse n’existe pas. Tous les outils sont sur la page d’accueil.",
  backHome: "Retour à Kress",
};

export const UI: Record<Lang, UiStrings> = { en, fr };

/** Acres, formatted for the language: "12.34" / "12,34". */
export function formatAcres(acres: number, lang: Lang): string {
  return acres.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
