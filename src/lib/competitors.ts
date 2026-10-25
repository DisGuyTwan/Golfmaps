/**
 * The robots a client is most often comparing with Kress, for the rep only
 * (never in the client's PDF): what each maker publishes (area, slope,
 * cutting height, price where there is one), dated and sourced, and how
 * each would do on the property measured. Researched Oct 25, 2026 from the
 * makers' own pages where they publish figures, else retailers (noted);
 * ratings aren't on the same basis from one maker to the next, so unit
 * counts are rough. Toro publishes no commercial robot as of that date.
 * Update `COMPETITORS_AS_OF` with the figures.
 */
import type { Site } from "./site";

export const COMPETITORS_AS_OF = "2026-10-25";

export interface Competitor {
  id: string;
  name: string;
  /** Who it's for: house lawns, or commercial grounds and courses. */
  segment: "residential" | "commercial";
  /** Published working area (m²) and slope limit (%). */
  areaM2: number;
  slopePct: number;
  /** Lowest cutting height (mm), where published. */
  minCutMm: number | null;
  /** Price as published (currency and market as given), or null when only dealers quote it. */
  price: string | null;
  source: string;
}

export const COMPETITORS: Competitor[] = [
  {
    id: "ceora546",
    name: "Husqvarna CEORA 546 EPOS",
    segment: "commercial",
    // 48,000 m² (RZ 43L) to 50,000 m² (RZ 43M) for a cut every 2 days; 15 % at the boundary, 20 % inside.
    areaM2: 48_000,
    slopePct: 20,
    minCutMm: 20,
    price: null,
    source: "https://www.husqvarna.com/uk/robotic-lawn-mowers/ceora-546epos-rz43l-cs4",
  },
  {
    id: "echo2050",
    name: "ECHO Robotics TM-2050",
    segment: "commercial",
    // 15 acres at most, 12 recommended; 30 % on the US sheet (45 % on the European one).
    areaM2: 12 * 4046.86,
    slopePct: 30,
    minCutMm: null,
    price: null,
    source: "https://www.echo-usa.com/robotics/tm-2050-turf-mower",
  },
  {
    id: "terranox240",
    name: "Segway Navimow Terranox CM240M1",
    segment: "commercial",
    // Up to 24,000 m² within 72 h, 40° (84 %), AWD (retailers; no US price announced).
    areaM2: 24_000,
    slopePct: 84,
    minCutMm: null,
    price: "CM120M1 £4,999 (UK retail)",
    source: "https://mowerpower.co.uk/shop/new-machinery/lawnmowers/robotic-mowers/segway-terronox-cm240m1-commercial-series-robotic-mower-24000sqm/",
  },
  {
    id: "navimowX390",
    name: "Segway Navimow X390",
    segment: "residential",
    areaM2: 10_000,
    slopePct: 50,
    minCutMm: 20,
    price: "US$4,499 to 4,999",
    source: "https://navimow.segway.com/en-be/pages/navimow-x3-specs",
  },
  {
    id: "automower550",
    name: "Husqvarna Automower 550 EPOS",
    segment: "residential",
    areaM2: 10_000,
    slopePct: 45,
    minCutMm: null,
    price: null,
    source: "https://husqvarna.com/ca-en/robotic-lawn-mowers/automower-550epos",
  },
  {
    id: "automower535",
    name: "Husqvarna Automower 535 AWD EPOS",
    segment: "residential",
    areaM2: 3_500,
    slopePct: 70,
    minCutMm: null,
    price: "£5,199 RRP (UK)",
    source: "https://husqvarna.com/ca-en/robotic-lawn-mowers/automower-535awd-epos",
  },
  {
    id: "luba2",
    name: "Mammotion LUBA 2 AWD 5000",
    segment: "residential",
    areaM2: 5_000,
    slopePct: 80,
    minCutMm: 25,
    price: "about US$2,300 to 3,000",
    source: "https://www.techradar.com/home/small-appliances/mammotion-luba-2-awd-robot-lawn-mower-review",
  },
];

/** How one competitor would do on the property measured. */
export interface Matchup {
  competitor: Competitor;
  /** Units at its published area (rough: ratings aren't on Kress's basis). */
  units: number;
  /** Share of the property steeper than it climbs (the LiDAR's nearest band at or under its limit); null without LiDAR. */
  steepShare: number | null;
  /** It can't cut fairway height (10 to 15 mm) where the quote has fairways. */
  noFairway: boolean;
}

/** Steep ground past `limitPct`: the LiDAR's shares are at 25, 36, 47 and 84 %, so a limit between bands reads the band below (at least that much). */
function steepPast(site: Site, limitPct: number): number | null {
  const t = site.terrain;
  if (!t || t.coverage < 0.5) return null;
  return limitPct >= 84 ? t.over84 : limitPct >= 47 ? t.over47 : limitPct >= 36 ? t.over36 : t.over25;
}

/**
 * The competitors for this kind of property (house lawns against the home
 * robots, the rest against the commercial ones), each on this property.
 */
export function matchups(site: Site): Matchup[] {
  const segment = site.kind === "lawn" ? "residential" : "commercial";
  return COMPETITORS.filter((c) => c.segment === segment || (site.kind === "site" && c.segment === "residential")).map((c) => ({
    competitor: c,
    units: Math.max(1, Math.ceil(site.areaM2 / c.areaM2 - 1e-9)),
    steepShare: steepPast(site, c.slopePct),
    noFairway: site.kind === "golf" && site.fairwayM2 > 0 && (c.minCutMm === null || c.minCutMm > 15),
  }));
}
