"""
Calibrates TURF_PER_GRASS and TURF_RANGE in src/lib/landcover.ts.

Takes the golf courses whose turf is fully mapped in OpenStreetMap (via the
Overture Maps land_use theme on AWS), measures the ESA WorldCover grass inside
each outline the way the app does, and compares it with the mapped turf
(fairways, greens, tees, rough, driving range, merged so overlaps count once).

    python3 -m venv .venv && .venv/bin/pip install pyarrow shapely rasterio numpy
    .venv/bin/python scripts/calibrate-satellite-turf.py

Behind a proxy, HTTPS_PROXY is honoured; set CURL_CA_BUNDLE / AWS_CA_BUNDLE if
it re-signs TLS.
"""
import math
import os
from urllib.parse import urlparse

import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import rasterio
import shapely
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely import wkb
from shapely.ops import unary_union

RELEASE = "2026-10-21.0"  # newest Overture release when this was last run
BBOX = (-80.5, 42.5, -70.5, 47.5)  # west, south, east, north: Ontario, Quebec and nearby states
TURF = {"fairway", "green", "tee", "rough", "driving_range"}
WC_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
GRASS = 30


def s3():
    kw = {}
    if os.environ.get("HTTPS_PROXY"):
        p = urlparse(os.environ["HTTPS_PROXY"])
        kw["proxy_options"] = {"scheme": p.scheme, "host": p.hostname, "port": p.port}
    if os.environ.get("AWS_CA_BUNDLE"):
        kw["tls_ca_file_path"] = os.environ["AWS_CA_BUNDLE"]
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", **kw)


def acres(g, lat):
    k = 111320.0
    flat = shapely.transform(g, lambda c: np.column_stack([c[:, 0] * k * math.cos(math.radians(lat)), c[:, 1] * k]))
    return flat.area * 0.000247105


def golf_features():
    w, s, e, n = BBOX
    dset = ds.dataset(f"overturemaps-us-west-2/release/{RELEASE}/theme=base/type=land_use", filesystem=s3(), format="parquet")
    f = (pc.field("bbox", "xmin") > w) & (pc.field("bbox", "xmax") < e) & (pc.field("bbox", "ymin") > s) & (pc.field("bbox", "ymax") < n)
    rows = dset.to_table(filter=f & (pc.field("subtype") == "golf"), columns=["geometry", "class"]).to_pylist()
    out = [(r["class"], wkb.loads(r["geometry"])) for r in rows]
    return [(c, g) for c, g in out if g.geom_type in ("Polygon", "MultiPolygon")]


def tile_name(lat, lon):
    la, lo = math.floor(lat / 3) * 3, math.floor(lon / 3) * 3
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def worldcover_grass(outline):
    """Acres of WorldCover grassland cells whose centre falls inside the outline (as the app counts)."""
    c = outline.centroid
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open("/vsicurl/" + WC_URL.format(tile_name(c.y, c.x))) as src:
        win = from_bounds(*outline.bounds, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win, boundless=True, fill_value=0)
        tf = src.window_transform(win)
    inside = ~geometry_mask([outline], out_shape=data.shape, transform=tf)
    rows = np.arange(data.shape[0])
    lat = tf.f + (rows + 0.5) * tf.e
    cell = (abs(tf.a) * math.pi / 180 * 6371008.8) * (abs(tf.e) * math.pi / 180 * 6371008.8) * np.cos(np.radians(lat))
    return float(((data == GRASS) & inside).sum(axis=1) @ (cell * 0.000247105))


def main():
    feats = golf_features()
    courses = [g for c, g in feats if c == "golf_course"]
    parts = [(c, g) for c, g in feats if c != "golf_course"]
    tree = shapely.STRtree([g for _, g in parts])
    truth, grass = [], []
    for cg in courses:
        lat = cg.centroid.y
        outline = acres(cg, lat)
        if outline < 30:
            continue
        by = {}
        for i in tree.query(cg, predicate="intersects"):
            c, g = parts[i]
            by.setdefault(c, []).append(g)
        rough = acres(unary_union(by["rough"]).intersection(cg), lat) if by.get("rough") else 0
        # Fully mapped: rough over a quarter of the outline and at least nine fairways.
        if rough < 0.25 * outline or len(by.get("fairway", [])) < 9:
            continue
        turf = acres(unary_union([g for c in TURF for g in by.get(c, [])]).intersection(cg), lat)
        try:
            grass.append(worldcover_grass(cg))
            truth.append(turf)
        except Exception as err:  # a tile that fails to load is skipped, not fatal
            print("skipped a course:", err)
    y, x = np.array(truth), np.array(grass)
    ratio = y / x
    loo = np.array([np.median(np.delete(ratio, i)) for i in range(len(y))]) * x
    rel = y / loo
    print(f"{len(y)} fully mapped courses")
    print(f"TURF_PER_GRASS = {np.median(ratio):.2f}   (left-one-out median error {100 * np.median(np.abs(rel - 1)):.0f}%)")
    print(f"TURF_RANGE = [{np.percentile(rel, 20):.2f}, {np.percentile(rel, 80):.2f}]   (middle 60% of courses)")


if __name__ == "__main__":
    main()
