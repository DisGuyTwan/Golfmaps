import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import osmtogeojson from "osmtogeojson";
import { processOverpassData } from "./area";
import { golfCourseAt } from "./detect";
import { lotInputs } from "./estimated-lot";
import { aroundPoint, mappedOnLot } from "./lawn";
import { covered, mergeRanges, selects, tilesFor, type ArchiveHeader } from "./osm-archive";
import { openArchive, queryArchive, type OpenArchive } from "./osm-archive-server";
import { buildRoadGraph, routeAll } from "./roads";

/*
 * fixture.bin is what scripts/osm-archive/build.py makes of fixture.osm (a
 * course near Saint-Bruno with a fairway, a water hazard and a forest around
 * it; a house lot with a pool, parking, a driveway and a building with a
 * courtyard; a street, a road and a highway; a footway and a far-off wood it
 * drops). Rebuild it after changing the format:
 *   osmium cat fixture.osm --output-header=osmosis_replication_timestamp=2026-10-24T20:21:02Z -o WORK/fixture.osm.pbf
 *   cp fixture.poly WORK/ && REGIONS=fixture ../build.sh WORK OUT && cp OUT/osm-*.bin fixture.bin
 */
const FIXTURE = readFileSync(join(__dirname, "../../scripts/osm-archive/fixture/fixture.bin"));
const reads: [number, number][] = [];
const open = () =>
  openArchive(async (offset, length) => {
    reads.push([offset, length]);
    return new Uint8Array(FIXTURE.subarray(offset, offset + length));
  });
const ids = (json: unknown, type: string) =>
  ((json as { elements: { type: string; id: number; tags?: Record<string, string> }[] }).elements ?? []).filter((e) => e.type === type && e.tags);

describe("OSM archive", () => {
  let archive: OpenArchive;

  it("opens with one read and knows its date and regions", async () => {
    reads.length = 0;
    archive = await open();
    expect(reads).toHaveLength(1);
    expect(archive.header.osm).toBe("2026-10-24T20:21:02Z");
    expect(covered(archive.header, aroundPoint(45.51, -73.31))).toBe(true);
    // Past the region's edge (-72.5), and outside it altogether.
    expect(covered(archive.header, { south: 45.5, west: -72.55, north: 45.51, east: -72.45 })).toBe(false);
    expect(covered(archive.header, aroundPoint(43.7, -79.4))).toBe(false);
  });

  it("answers a course lookup as Overpass would: the course measured the same way", async () => {
    const box = { south: 45.497, west: -73.307, north: 45.506, east: -73.297 };
    const json = await queryArchive(archive, "golf", box);
    const m = processOverpassData(json);
    expect(m.found).toBe(true);
    expect(m.boundaryOnly).toBe(false);
    expect(m.fairway.acres).toBeGreaterThan(5); // 111 × 312 m
    // The forest around the course, clipped to it, takes everything but the turf: no rough left.
    expect(m.treesAcres).toBeGreaterThan(m.courseAcres * 0.9);
    // The water hazard once, not again from the woods and water layer; no streets in a course lookup.
    const json2 = json as { elements: { tags?: Record<string, string> }[] };
    expect(json2.elements.filter((e) => e.tags?.golf === "water_hazard")).toHaveLength(1);
    expect(json2.elements.some((e) => e.tags?.highway)).toBe(false);
  });

  it("answers a lot lookup: what's on the lot, the streets, and the course only around the middle", async () => {
    const json = await queryArchive(archive, "lawn", aroundPoint(45.5102, -73.3103, 150));
    const lot = { type: "Polygon" as const, coordinates: [[[-73.3115, 45.5088], [-73.3095, 45.5088], [-73.3095, 45.5115], [-73.3115, 45.5115], [-73.3115, 45.5088]]] };
    const kinds = mappedOnLot(json, lot).map((a) => a.kind).sort();
    expect(kinds).toEqual(["building", "building", "paving", "paving", "pool"]);
    // The street and the road (the highway passes 1.3 km off: not in the box, as with Overpass).
    expect(lotInputs(json).streets.map((s) => s.halfM).sort()).toEqual([10, 13]);
    expect(golfCourseAt(json, 45.5102, -73.3103)).toBeNull();
    expect(ids(json, "way").some((w) => w.tags?.highway === "footway")).toBe(false);
    const onCourse = await queryArchive(archive, "lawn", aroundPoint(45.5015, -73.302));
    expect(golfCourseAt(onCourse, 45.5015, -73.302)?.name).toBe("Club de golf Fixture");
    // The building with a courtyard keeps its hole.
    const courtyard = osmtogeojson(json).features.find((f) => f.id === "relation/1002");
    expect(courtyard?.geometry.type).toBe("Polygon");
    expect((courtyard?.geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2);
  });

  it("answers road lookups with streets that meet where they cross", async () => {
    const streets = await queryArchive(archive, "streets", { south: 45.5, west: -73.32, north: 45.52, east: -73.3 });
    expect(ids(streets, "way").map((w) => w.tags?.highway).sort()).toEqual(["motorway", "residential", "tertiary"]);
    const g = buildRoadGraph(streets);
    const [[, leg]] = routeAll(g, [[45.5085, -73.314], [45.512, -73.3103]]);
    expect(leg?.via).toEqual(expect.arrayContaining(["Rue des Érables", "Chemin Fixture"]));
    const roads = await queryArchive(archive, "roads", { south: 45.45, west: -73.4, north: 45.55, east: -73.2 });
    expect(ids(roads, "way").map((w) => w.tags?.highway).sort()).toEqual(["motorway", "tertiary"]);
  });

  it("leaves to the mirrors a box past the tile limit", async () => {
    expect(await queryArchive(archive, "golf", { south: 45.3, west: -73.7, north: 45.6, east: -73.4 })).toBeNull();
  });
});

describe("archive helpers", () => {
  const header = { layers: { f: { deg: 0.01, per: 100 }, s: { deg: 0.02, per: 50 }, r: { deg: 0.1, per: 10 } } } as ArchiveHeader;

  it("finds the tiles under a box, block by block", () => {
    const tiles = tilesFor(header, "f", { south: 45.505, west: -73.305, north: 45.515, east: -73.295 })!;
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toEqual({ block: "f/135/106", tile: "13550,10669" });
  });

  it("reads neighbouring tiles at once", () => {
    expect(mergeRanges([[500, 100], [0, 100], [100, 50], [200_000, 10]], 1000)).toEqual([
      { start: 0, end: 600, parts: [[0, 100], [100, 50], [500, 100]] },
      { start: 200_000, end: 200_010, parts: [[200_000, 10]] },
    ]);
  });

  it("selects what each lookup's query does", () => {
    expect(selects("golf", "w", { natural: "scrub" })).toBe(true);
    expect(selects("golf", "r", { natural: "scrub" })).toBe(false);
    expect(selects("lawn", "w", { highway: "footway" })).toBe(false);
    expect(selects("lawn", "w", { highway: "primary_link" })).toBe(true);
    expect(selects("lawn", "r", { leisure: "golf_course" })).toBe(true);
    expect(selects("streets", "w", { highway: "footway" })).toBe(false);
    expect(selects("roads", "w", { highway: "residential" })).toBe(false);
  });
});
