#!/usr/bin/env bash
# Builds the OSM archive (see build.py) from Geofabrik extracts already in
# WORK: REGION.osm.pbf and REGION.poly for each region (quebec ontario, or
# REGIONS="..."). Writes osm-YYYYMMDD.bin and latest.json to OUT.
#   scripts/osm-archive/build.sh WORK OUT
# Needs osmium-tool, and python3 with osmium (pyosmium) and shapely.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$1
out=$2
read -r -a regions <<< "${REGIONS:-quebec ontario}"
mkdir -p "$out" "$work/tmp"

main=()
woods=()
polys=()
for r in "${regions[@]}"; do
  # What a lot, a course or a run reads (layers_for in build.py picks the rest).
  osmium tags-filter --overwrite "$work/$r.osm.pbf" \
    nwr/building nwr/leisure=golf_course,swimming_pool nwr/golf nwr/amenity=parking,parking_space \
    w/area:highway w/highway -o "$work/$r-main.pbf"
  # Woods and water (build.py keeps them on courses only).
  osmium tags-filter --overwrite "$work/$r.osm.pbf" nwr/natural=wood,scrub,water nwr/landuse=forest -o "$work/$r-woods.pbf"
  main+=("$work/$r-main.pbf")
  woods+=("$work/$r-woods.pbf")
  polys+=("$work/$r.poly")
done

name="osm-$(date -u +%Y%m%d).bin"
python3 "$here/build.py" --main "${main[@]}" --woods "${woods[@]}" --poly "${polys[@]}" \
  --tmp "$work/tmp" --out "$out/$name" --latest "$out/latest.json"
ls -l "$out"
