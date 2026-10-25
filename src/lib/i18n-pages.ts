/**
 * Copy for the error and not-found pages, EN and FR. Kept out of i18n.ts on
 * purpose: Next loads both pages' boundaries with every page, and each would
 * otherwise bundle its own copy of the whole app's text.
 */
import type { Lang } from "./preferences";

const en = {
  errorTitle: "Something went wrong.",
  errorBody:
    "This is usually a public data service, like the Overpass API, being unavailable. Retrying often works; if it doesn’t, wait a minute and try again.",
  tryAgain: "Try again",
  notFoundTitle: "Page not found.",
  notFoundBody: "This address doesn’t exist. The tools are all on the home page.",
  backHome: "Back to Calculator",
};

const fr: typeof en = {
  errorTitle: "Une erreur est survenue.",
  errorBody:
    "C’est habituellement un service public de données, comme l’API Overpass, qui est indisponible. Réessayer fonctionne souvent; sinon, attendez une minute et réessayez.",
  tryAgain: "Réessayer",
  notFoundTitle: "Page introuvable.",
  notFoundBody: "Cette adresse n’existe pas. Tous les outils sont sur la page d’accueil.",
  backHome: "Retour à Calculator",
};

export const PAGE_COPY: Record<Lang, typeof en> = { en, fr };
