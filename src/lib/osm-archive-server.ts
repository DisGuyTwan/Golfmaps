/**
 * Reading the OSM archive behind /api/overpass: the file the nightly
 * GitHub Action publishes on the repository's "osm-data" release
 * (scripts/osm-archive), range-read a few tiles at a time. latest.json names
 * the current file; each build is a new file, so an instance still reading
 * yesterday's never mixes the two. Per instance the header and the block
 * indexes it has read stay in memory. Null whenever the archive can't answer
 * (not published yet, a box outside Quebec and Ontario, too many tiles):
 * the route then asks the Overpass mirrors as before.
 */
import { gunzipSync } from "node:zlib";
import { LAYERS_FOR, MAX_TILES, covered, mergeRanges, tilesFor, toOverpass, type ArchiveHeader, type ArchiveRecord } from "./osm-archive";
import type { OverpassQuery } from "./overpass";
import type { BBox } from "./types";

/** Reads `length` bytes at `offset`. */
export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

export interface OpenArchive {
  header: ArchiveHeader;
  read: ReadRange;
  /** Where the block indexes and the tiles start. */
  indexBase: number;
  tileBase: number;
  blocks: Map<string, Promise<Record<string, [number, number]>>>;
}

const MAGIC = "OSMTILE1";
/** The first read: the header usually fits. */
const FIRST_BYTES = 65536;
/** Block indexes kept per instance (a dense 1° block's is about 100 kB). */
const MAX_BLOCKS = 200;

const json = (bytes: Uint8Array) => JSON.parse(gunzipSync(bytes).toString("utf8"));

export async function openArchive(read: ReadRange): Promise<OpenArchive> {
  const first = await read(0, FIRST_BYTES);
  if (new TextDecoder().decode(first.subarray(0, 8)) !== MAGIC) throw new Error("Not an OSM archive");
  const size = new DataView(first.buffer, first.byteOffset, first.byteLength).getUint32(8, true);
  const head = first.length >= 16 + size ? first.subarray(16, 16 + size) : await read(16, size);
  const header = json(head) as ArchiveHeader;
  return { header, read, indexBase: 16 + size, tileBase: 16 + size + header.indexBytes, blocks: new Map() };
}

function blockIndex(a: OpenArchive, name: string): Promise<Record<string, [number, number]>> {
  const at = a.header.blocks[name];
  if (!at) return Promise.resolve({});
  let index = a.blocks.get(name);
  if (!index) {
    index = a.read(a.indexBase + at[0], at[1]).then(json);
    index.catch(() => a.blocks.delete(name)); // Read again next time.
    if (a.blocks.size >= MAX_BLOCKS) a.blocks.delete(a.blocks.keys().next().value!);
    a.blocks.set(name, index);
  }
  return index;
}

/** The lookup answered from the archive, as Overpass would; null when the archive can't (see above). */
export async function queryArchive(a: OpenArchive, kind: OverpassQuery, bbox: BBox): Promise<unknown | null> {
  if (!covered(a.header, bbox)) return null;
  const wanted: { block: string; tile: string }[] = [];
  for (const layer of LAYERS_FOR[kind]) {
    const tiles = tilesFor(a.header, layer, bbox);
    if (!tiles) return null;
    wanted.push(...tiles);
  }
  if (wanted.length > MAX_TILES) return null;
  const indexes = new Map<string, Record<string, [number, number]>>();
  await Promise.all([...new Set(wanted.map((t) => t.block))].map(async (b) => indexes.set(b, await blockIndex(a, b))));
  const ranges = wanted.map((t) => indexes.get(t.block)?.[t.tile]).filter((r): r is [number, number] => !!r);
  const records: ArchiveRecord[] = [];
  await Promise.all(
    mergeRanges(ranges).map(async ({ start, end, parts }) => {
      const bytes = await a.read(a.tileBase + start, end - start);
      for (const [offset, length] of parts) records.push(...(json(bytes.subarray(offset - start, offset - start + length)) as ArchiveRecord[]));
    }),
  );
  return toOverpass(records, kind, bbox, a.header);
}

/** Range reads over HTTP: GitHub's release link redirects to a signed address, reused for a few minutes. */
export function httpRange(url: string): ReadRange {
  let target: { url: string; until: number } | null = null;
  const resolve = async () => {
    if (target && target.until > Date.now()) return target.url;
    // A GET (of one byte): GitHub signs the address it redirects to for the method asked, and a HEAD's won't read.
    const first = await fetch(url, { headers: { Range: "bytes=0-0" }, redirect: "manual", signal: AbortSignal.timeout(5000) });
    await first.body?.cancel();
    const location = first.status >= 300 && first.status < 400 ? first.headers.get("location") : null;
    target = { url: location ? new URL(location, url).toString() : url, until: Date.now() + 4 * 60_000 };
    return target.url;
  };
  const get = async (offset: number, length: number) => {
    const response = await fetch(await resolve(), {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 206) {
      // A whole small file (past its end) is fine; a whole big one is a server ignoring Range.
      const small = response.status === 200 && Number(response.headers.get("content-length") ?? Infinity) <= FIRST_BYTES;
      if (!small) throw new Error(`OSM archive read failed (HTTP ${response.status})`);
      return new Uint8Array(await response.arrayBuffer()).subarray(offset, offset + length);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  return async (offset, length) => {
    try {
      return await get(offset, length);
    } catch (err) {
      if (!target) throw err;
      target = null; // The signed address may have expired: once more from the release link.
      return get(offset, length);
    }
  };
}

/** latest.json on the archive's release; OSM_ARCHIVE_URL points elsewhere (another fork's release). */
const LATEST_URL = process.env.OSM_ARCHIVE_URL ?? "https://github.com/DisGuyTwan/Golfmaps/releases/download/osm-data/latest.json";
/** How often an instance checks for a newer build, and waits after finding none. */
const RECHECK_MS = 15 * 60_000;
const RETRY_MS = 5 * 60_000;

let current: { file: string; archive: Promise<OpenArchive> } | null = null;
let checkedAt = 0;
let checking: Promise<void> | null = null;

async function checkLatest() {
  try {
    const response = await fetch(LATEST_URL, { signal: AbortSignal.timeout(4000) });
    const latest = response.ok ? ((await response.json()) as { file?: string }) : null;
    if (!latest?.file) {
      checkedAt = Date.now() - RECHECK_MS + RETRY_MS;
      return;
    }
    if (latest.file !== current?.file) {
      const archive = openArchive(httpRange(new URL(latest.file, LATEST_URL).toString()));
      archive.catch(() => {
        if (current?.archive === archive) current = null;
      });
      current = { file: latest.file, archive };
    }
    checkedAt = Date.now();
  } catch {
    checkedAt = Date.now() - RECHECK_MS + RETRY_MS;
  }
}

/** The current archive, or null while there's none to read. */
export async function currentArchive(): Promise<OpenArchive | null> {
  if (Date.now() - checkedAt > RECHECK_MS) {
    checking ??= checkLatest().finally(() => (checking = null));
    // The first time, wait for it; afterwards a newer build is picked up in the background.
    if (!current) await checking;
  }
  return current ? current.archive.catch(() => null) : null;
}
