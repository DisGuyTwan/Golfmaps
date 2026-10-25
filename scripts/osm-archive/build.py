#!/usr/bin/env python3
"""
Packs the OpenStreetMap features the app reads, for Quebec and Ontario, into
one tiled file that /api/overpass range-reads (src/lib/osm-archive.ts)
instead of waiting on the Overpass mirrors, which queue Vercel's addresses
for half a minute. Built nightly by .github/workflows/osm-archive.yml, after
build.sh has cut Geofabrik's extracts down with osmium-tool.

  build.py --main MAIN.pbf... [--woods WOODS.pbf...] --poly REGION.poly...
           --tmp DIR --out FILE [--latest latest.json]

Woods and water are only kept within each golf course's box (plus a margin),
clipped to it, since they only count inside a course (area.ts): Quebec's
forests alone would otherwise outweigh everything else.

Three layers of tiles, each a square of `deg` degrees:
  f  (0.01°) what's on a lot or a course: buildings, pools, parking, paved
     areas, service roads, golf courses and their features, woods and water
     on courses;
  s  (0.02°) every street a car drives (a grass run's stops, a lot's road
     allowance);
  r  (0.1°)  the main roads across a run.
A feature goes in every tile its box touches; the reader keeps one of each.

File (integers little-endian):
  0               "OSMTILE1", uint32 header length H, uint32 0
  16              gzip(JSON header): built, osm (the extracts' date), layers
                  {name: {deg, per}}, blocks {"layer/by/bx": [offset, length]}
                  into the block indexes, indexBytes, and cover {"by/bx": "F",
                  or 25 hex digits: which 0.1° cells of that 1° block are in
                  the regions, bit row * 10 + column from the south-west}
  16 + H          block indexes, one per layer and 1° block:
                  gzip(JSON {"iy,ix": [offset, length]}) into the tiles
  16 + H + index  tiles: gzip(JSON [record, ...])
Tile ix = floor((lon + 180) / deg), iy = floor((lat + 90) / deg); block
bx = ix // per, by = iy // per (per = tiles per degree).
Records: ["w", id, tags, coords] for a way and ["r", id, tags, [[role,
coords], ...]] for a multipolygon (its rings, in place of member ways);
coords [lat, lon, dlat, dlon, ...] in 1e-7 degrees, each pair after the
first relative to the one before.
"""
import argparse
import datetime as dt
import gzip
import json
import os
import shutil
import struct
import subprocess
import sys

import osmium
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

LAYERS = {"f": 0.01, "s": 0.02, "r": 0.1}
E7 = 10_000_000
STREETS = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "road"}
MAIN = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified"}
# Only the tags something in the app reads (area.ts, lawn.ts, roads.ts, detect.ts, estimated-lot.ts).
KEEP = {
    "type", "building", "leisure", "golf", "natural", "landuse", "amenity", "area:highway", "highway", "area",
    "name", "ref", "oneway", "junction", "maxspeed", "access", "motorcar", "motor_vehicle", "width", "service",
}
# A course's box reaches this far past its outline (degrees): what a scan box takes in.
GOLF_MARGIN = 0.002
# Woods clipped to a course keep ids of their own, out of OSM's range (and under 2^53).
SYNTH = 7 * 10**15
# A feature over more tiles than this is a mapping error, not a lot.
MAX_TILES = 2500


def keep_tags(tags):
    return {t.k: t.v for t in tags if t.k in KEEP}


def layers_for(tags):
    """The layers a way (or multipolygon) belongs to, from its tags."""
    out = []
    hw = tags.get("highway")
    if hw and tags.get("area") != "yes":
        base = hw[:-5] if hw.endswith("_link") else hw
        if base in STREETS:
            out.append("s")
        if base in MAIN:
            out.append("r")
    if (
        "building" in tags
        or tags.get("leisure") in ("golf_course", "swimming_pool")
        or "golf" in tags
        or tags.get("amenity") in ("parking", "parking_space")
        or "area:highway" in tags
        or (hw and tags.get("area") == "yes")
        or hw == "service"
    ):
        out.append("f")
    return out


def delta(points):
    """[(lat7, lon7), ...] as [lat, lon, dlat, dlon, ...]."""
    out = []
    plat = plon = 0
    for i, (lat, lon) in enumerate(points):
        out += [lat, lon] if i == 0 else [lat - plat, lon - plon]
        plat, plon = lat, lon
    return out


class Emitter:
    """Writes "key<TAB>record" lines, one per tile a feature touches, for sort to group."""

    def __init__(self, path):
        self.out = open(path, "w", encoding="utf-8", buffering=1 << 22)
        self.count = 0
        self.skipped = 0

    def emit(self, layer, record, lats, lons):
        deg = round(LAYERS[layer] * E7)
        per = round(1 / LAYERS[layer])
        x0 = (min(lons) + 180 * E7) // deg
        x1 = (max(lons) + 180 * E7) // deg
        y0 = (min(lats) + 90 * E7) // deg
        y1 = (max(lats) + 90 * E7) // deg
        if (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES:
            self.skipped += 1
            return
        line = json.dumps(record, separators=(",", ":"), ensure_ascii=False)
        for iy in range(y0, y1 + 1):
            for ix in range(x0, x1 + 1):
                self.out.write(f"{layer}{iy // per:03d}{ix // per:03d}{iy:06d}{ix:06d}\t{line}\n")
                self.count += 1

    def close(self):
        self.out.close()


def way_points(w):
    pts = []
    for n in w.nodes:
        if not n.location.valid():
            return None
        pts.append((n.y, n.x))
    return pts if len(pts) >= 2 else None


def area_rings(a):
    """[(role, [(lat7, lon7), ...]), ...] of an assembled multipolygon."""
    rings = []
    for outer in a.outer_rings():
        rings.append(("outer", [(n.y, n.x) for n in outer]))
        for inner in a.inner_rings(outer):
            rings.append(("inner", [(n.y, n.x) for n in inner]))
    return rings


WKB = osmium.geom.WKBFactory()


def area_shape(a):
    """An assembled area as a shapely geometry (built in C++, so a whole province's woods stay quick); None if broken."""
    try:
        g = shapely.from_wkb(WKB.create_multipolygon(a))
    except Exception:
        return None
    return g if g.is_valid else g.buffer(0)


def read_poly(path):
    """A Geofabrik .poly file as a shapely geometry (rings starting with ! are holes)."""
    shells, holes = [], []
    with open(path) as f:
        lines = [l.strip() for l in f]
    i = 1
    while i < len(lines) and lines[i] != "END":
        hole = lines[i].startswith("!")
        ring = []
        i += 1
        while lines[i] != "END":
            lon, lat = map(float, lines[i].split()[:2])
            ring.append((lon, lat))
            i += 1
        (holes if hole else shells).append(Polygon(ring))
        i += 1
    g = unary_union(shells)
    return g.difference(unary_union(holes)) if holes else g


def cover_of(polys):
    region = unary_union(polys)
    inside = prep(region)
    w, s, e, n = region.bounds
    cover = {}
    # Cells shrunk a hair, so one that only touches the region's edge isn't in it.
    cell = lambda w0, s0, size: box(w0 + 1e-7, s0 + 1e-7, w0 + size - 1e-7, s0 + size - 1e-7)
    for by in range(int((s + 90) // 1), int((n + 90) // 1) + 1):
        for bx in range(int((w + 180) // 1), int((e + 180) // 1) + 1):
            lat0, lon0 = by - 90, bx - 180
            if not inside.intersects(cell(lon0, lat0, 1)):
                continue
            if inside.contains(cell(lon0, lat0, 1)):
                cover[f"{by}/{bx}"] = "F"
                continue
            bits = 0
            for r in range(10):
                for c in range(10):
                    if inside.intersects(cell(lon0 + c / 10, lat0 + r / 10, 0.1)):
                        bits |= 1 << (r * 10 + c)
            cover[f"{by}/{bx}"] = f"{bits:025x}"
    return cover


def osm_date(path):
    h = osmium.io.Reader(path, osmium.osm.osm_entity_bits.NOTHING).header()
    return h.get("osmosis_replication_timestamp") or None


def pack(args):
    os.makedirs(args.tmp, exist_ok=True)
    lines = os.path.join(args.tmp, "records.txt")
    em = Emitter(lines)
    courses = []

    for path in args.main:
        for obj in osmium.FileProcessor(path).with_locations().with_areas():
            if obj.is_area() and obj.tags.get("leisure") == "golf_course":
                g = area_shape(obj)
                if g is not None and not g.is_empty:
                    w, s, e, n = g.bounds
                    courses.append(box(w - GOLF_MARGIN, s - GOLF_MARGIN, e + GOLF_MARGIN, n + GOLF_MARGIN))
            if obj.is_way():
                tags = keep_tags(obj.tags)
                layers = layers_for(tags)
                if not layers:
                    continue
                pts = way_points(obj)
                if not pts:
                    continue
                record = ["w", obj.id, tags, delta(pts)]
                for layer in layers:
                    em.emit(layer, record, [p[0] for p in pts], [p[1] for p in pts])
            elif obj.is_area() and not obj.from_way():
                tags = keep_tags(obj.tags)
                if "f" not in layers_for(tags):
                    continue
                rings = area_rings(obj)
                if not rings:
                    continue
                tags["type"] = "multipolygon"
                record = ["r", obj.orig_id(), tags, [[role, delta(pts)] for role, pts in rings]]
                pts = [p for _, ring in rings for p in ring]
                em.emit("f", record, [p[0] for p in pts], [p[1] for p in pts])

    print(f"{len(courses)} golf courses", file=sys.stderr)
    tree = STRtree(courses)
    for path in args.woods if courses else []:
        for obj in osmium.FileProcessor(path).with_locations().with_areas():
            if not obj.is_area():
                continue
            tags = keep_tags(obj.tags)
            if "golf" in tags or tags.get("leisure") == "golf_course":
                continue  # In the main layer already.
            if not (tags.get("natural") in ("wood", "scrub", "water") or tags.get("landuse") == "forest"):
                continue
            g = area_shape(obj)
            if g is None or g.is_empty:
                continue
            near = tree.query(box(*g.bounds))
            if len(near) == 0:
                continue
            clipped = unary_union([shapely.clip_by_rect(g, *courses[i].bounds) for i in near])
            polys = [p for p in getattr(clipped, "geoms", [clipped]) if isinstance(p, Polygon) and not p.is_empty]
            if not polys:
                continue
            rings = []
            for p in polys:
                rings.append(["outer", delta([(round(y * E7), round(x * E7)) for x, y in p.exterior.coords])])
                for hole in p.interiors:
                    rings.append(["inner", delta([(round(y * E7), round(x * E7)) for x, y in hole.coords])])
            tags["type"] = "multipolygon"
            w, s, e, n = unary_union(polys).bounds
            em.emit("f", ["r", SYNTH + obj.id, tags, rings], [round(s * E7), round(n * E7)], [round(w * E7), round(e * E7)])
    em.close()
    print(f"{em.count} tile records, {em.skipped} features too big", file=sys.stderr)

    # Group by tile; -u drops the copies of what both regions' extracts hold.
    ordered = os.path.join(args.tmp, "sorted.txt")
    env = {**os.environ, "LC_ALL": "C"}
    subprocess.run(["sort", "-u", "-S", "40%", "-T", args.tmp, "-o", ordered, lines], check=True, env=env)
    os.remove(lines)

    tiles_path = os.path.join(args.tmp, "tiles.bin")
    blocks = {}
    offset = 0
    with open(ordered, encoding="utf-8") as src, open(tiles_path, "wb") as tiles:
        current, records = None, []

        def flush():
            nonlocal offset
            if current is None:
                return
            layer, by, bx, iy, ix = current[0], int(current[1:4]), int(current[4:7]), int(current[7:13]), int(current[13:19])
            data = gzip.compress(("[" + ",".join(records) + "]").encode(), compresslevel=6, mtime=0)
            tiles.write(data)
            blocks.setdefault(f"{layer}/{by}/{bx}", {})[f"{iy},{ix}"] = [offset, len(data)]
            offset += len(data)

        for line in src:
            key, record = line.rstrip("\n").split("\t", 1)
            if key != current:
                flush()
                current, records = key, []
            records.append(record)
        flush()
    os.remove(ordered)

    index_path = os.path.join(args.tmp, "index.bin")
    block_ranges = {}
    with open(index_path, "wb") as index:
        at = 0
        for name, entries in blocks.items():
            data = gzip.compress(json.dumps(entries, separators=(",", ":")).encode(), mtime=0)
            index.write(data)
            block_ranges[name] = [at, len(data)]
            at += len(data)
        index_bytes = at

    dates = [d for d in (osm_date(p) for p in args.main) if d]
    header = {
        "v": 1,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "osm": min(dates) if dates else None,
        "layers": {k: {"deg": v, "per": round(1 / v)} for k, v in LAYERS.items()},
        "blocks": block_ranges,
        "indexBytes": index_bytes,
        "cover": cover_of([read_poly(p) for p in args.poly]),
    }
    head = gzip.compress(json.dumps(header, separators=(",", ":")).encode(), mtime=0)
    with open(args.out, "wb") as out:
        out.write(b"OSMTILE1" + struct.pack("<II", len(head), 0))
        out.write(head)
        for part in (index_path, tiles_path):
            with open(part, "rb") as f:
                shutil.copyfileobj(f, out, 1 << 22)
            os.remove(part)
    size = os.path.getsize(args.out)
    print(f"{len(blocks)} blocks, {sum(len(b) for b in blocks.values())} tiles, {size / 1e6:.1f} MB", file=sys.stderr)
    if args.latest:
        with open(args.latest, "w") as f:
            json.dump({"file": os.path.basename(args.out), "built": header["built"], "osm": header["osm"], "bytes": size}, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", nargs="+", required=True)
    ap.add_argument("--woods", nargs="*", default=[])
    ap.add_argument("--poly", nargs="+", required=True)
    ap.add_argument("--tmp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--latest")
    pack(ap.parse_args())


if __name__ == "__main__":
    main()
