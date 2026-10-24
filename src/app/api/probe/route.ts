/** Temporary research probe (branch claude/imagery-probe only): fetches an allow-listed URL and returns it. */
export const maxDuration = 60;

const HOSTS = [
  "servicesmatriciels.mern.gouv.qc.ca",
  "servicesmatriciels.mrnf.gouv.qc.ca",
  "servicescarto.mern.gouv.qc.ca",
  "servicescarto.mrnf.gouv.qc.ca",
  "geoegl.msp.gouv.qc.ca",
  "www.donneesquebec.ca",
  "donneesquebec.ca",
  "open.canada.ca",
  "mrnf.gouv.qc.ca",
  "geo.environnement.gouv.qc.ca",
  "observatoire.cmm.qc.ca",
  "datacube.services.geo.ca",
  "geoappext.nrcan.gc.ca",
  "maps.geogratis.gc.ca",
  "overpass-api.de",
  "overpass.kumi.systems",
];

const LAYERS: Record<string, string> = {
  gq: "https://servicesmatriciels.mern.gouv.qc.ca/erdas-iws/ogc/wmts/Imagerie_Continue/Imagerie_GQ/default/GoogleMapsCompatibleExt2:epsg:3857",
  ieqm: "https://servicesmatriciels.mern.gouv.qc.ca/erdas-iws/ogc/wmts/Inventaire_Ecoforestier/Inventaire_Ecoforestier/default/GoogleMapsCompatibleExt2:epsg:3857",
};

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (q.get("z")) {
    // Several imagery tiles at once: z, x0..x1, y0..y1 (at most 36).
    const [z, x0, x1, y0, y1] = ["z", "x0", "x1", "y0", "y1"].map((k) => Number(q.get(k)));
    const TILE = LAYERS[q.get("layer") ?? "gq"] ?? LAYERS.gq;
    const jobs: Promise<{ x: number; y: number; status: number; base64: string }>[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (jobs.length >= 36) break;
        jobs.push(
          fetch(`${TILE}/${z}/${y}/${x}.jpg`, { signal: AbortSignal.timeout(40000) }).then(async (r) => ({
            x,
            y,
            status: r.status,
            base64: Buffer.from(await r.arrayBuffer()).toString("base64"),
          })),
        );
      }
    }
    return Response.json({ z, tiles: await Promise.all(jobs) }, { headers: { "Cache-Control": "no-store" } });
  }
  const u = q.get("u");
  if (!u) return Response.json({ error: "u required" }, { status: 400 });
  const target = new URL(u);
  if (!HOSTS.includes(target.hostname)) return Response.json({ error: "host not allowed" }, { status: 400 });
  const t0 = Date.now();
  try {
    const r = await fetch(target, { headers: { "User-Agent": "Prodig-e Calculator research probe" }, signal: AbortSignal.timeout(50000) });
    const type = r.headers.get("content-type") ?? "";
    const buf = Buffer.from(await r.arrayBuffer());
    const textual = /text|json|xml|html/.test(type);
    return Response.json(
      {
        status: r.status,
        type,
        ms: Date.now() - t0,
        bytes: buf.length,
        headers: Object.fromEntries(r.headers.entries()),
        ...(textual ? { text: buf.toString("utf8").slice(0, 400000) } : { base64: buf.toString("base64") }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json({ error: String(err), ms: Date.now() - t0 }, { status: 502 });
  }
}
