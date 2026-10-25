/**
 * A sheet of addresses for a grass run: an Excel workbook (.xlsx) or a CSV,
 * read in the browser (no upload), its address columns found by their
 * headers in English or French, and each address placed with Photon (the
 * geocoder the search box uses), in Quebec or Ontario. An .xlsx is a zip of
 * XML files: the zip is read here and inflated with the browser's
 * DecompressionStream, so no spreadsheet library is needed. Older .xls files (a binary format)
 * aren't read: the rep saves the sheet as .xlsx or .csv.
 * Pure except `geocodeAddress`, so the reading is tested without a browser.
 */

/** Why a sheet couldn't be read. */
export class SheetError extends Error {
  constructor(public reason: "xls" | "read") {
    super(reason === "xls" ? "An .xls workbook (save it as .xlsx or .csv)" : "Not a sheet");
    this.name = "SheetError";
  }
}

// ---- Zip (an .xlsx) ----

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a zip whose names pass `wanted`, by name. */
export async function unzip(zip: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  // The end of central directory record: within the last 64 KB (its comment), read backwards.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (u32(zip, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SheetError("read");
  const count = u16(zip, end + 10);
  let at = u32(zip, end + 16);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (u32(zip, at) !== 0x02014b50) throw new SheetError("read");
    const method = u16(zip, at + 10);
    const size = u32(zip, at + 20);
    const nameLength = u16(zip, at + 28);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = u32(zip, at + 42);
    at += 46 + nameLength + u16(zip, at + 30) + u16(zip, at + 32);
    if (!wanted(name)) continue;
    // The local header's own name and extra field lengths can differ from the central directory's.
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
    const data = zip.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
  }
  return files;
}

// ---- Workbook XML ----

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );
/** An element's attributes, by name. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}
/** The text of every <t> in a string item (rich text runs joined; phonetic hints left out). */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

/** "C12" → column 2 (0-based). */
function columnOf(ref: string): number {
  let col = 0;
  for (const ch of ref.toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    col = col * 26 + ch.charCodeAt(0) - 64;
  }
  return col - 1;
}

/** The rows of a worksheet's XML, as text, row 1 first (empty rows kept, so row numbers match Excel's). */
export function worksheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attributes(row[1]).r) || rows.length + 1;
    const cells: string[] = [];
    for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attributes(c[1]);
      const body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const text =
        a.t === "s" ? (shared[Number(v)] ?? "") : a.t === "inlineStr" ? textOf(body) : a.t === "e" ? "" : v !== undefined ? unescapeXml(v) : "";
      cells[a.r ? columnOf(a.r) : cells.length] = text;
    }
    rows[r - 1] = Array.from(cells, (cell) => cell ?? "");
  }
  return Array.from(rows, (row) => row ?? []);
}

/** The first visible worksheet of an .xlsx, as rows of text. */
async function xlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(bytes, (name) => name.startsWith("xl/"));
  const text = (name: string) => (files.has(name) ? new TextDecoder().decode(files.get(name)) : null);
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => (m[1] ? textOf(m[1]) : ""));
  // The workbook lists its sheets in tab order; its relationships say which file each is.
  let sheetFile = "xl/worksheets/sheet1.xml";
  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => attributes(m[0])).find((s) => s.state !== "hidden" && s.state !== "veryHidden");
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => attributes(m[0])).find((r) => sheet && r.Id === sheet["r:id"]);
    if (rel?.Target) sheetFile = rel.Target.startsWith("/") ? rel.Target.slice(1) : `xl/${rel.Target.replace(/^\.\//, "")}`;
  }
  const xml = text(sheetFile);
  if (xml === null) throw new SheetError("read");
  return worksheetRows(xml, shared);
}

// ---- CSV ----

/** Rows of a CSV (or a tab- or semicolon-separated export: French Excel saves CSV with semicolons). */
export function csvRows(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delimiter = counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A CSV's text: UTF-8, else Windows-1252 (Excel on Windows saves accents that way). */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** A sheet's rows of text, from an .xlsx or a CSV (by its content, whatever its name says). */
export async function readSheet(bytes: Uint8Array): Promise<string[][]> {
  if (u32(bytes, 0) === 0x04034b50) return xlsxRows(bytes);
  // An old binary workbook (.xls) starts with the OLE signature.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new SheetError("xls");
  const text = decodeText(bytes);
  if (text.includes("\u0000")) throw new SheetError("read");
  return csvRows(text);
}

// ---- Address columns ----

/** An address to place: its row in the sheet (1 = the first), what's searched, and what the stop is called. */
export interface SheetAddress {
  row: number;
  /** The address searched: the street address, then the city, province and postal code where the sheet has them. */
  query: string;
  /** The street address as written (the stop's name without a name column). */
  address: string;
  /** From a name or client column. */
  name: string | null;
}

type Field = "address" | "number" | "street" | "city" | "province" | "postal" | "name";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();

/** What a header names, in English or French (an email or phone column is no address). */
function fieldOf(header: string): Field | null {
  const h = norm(header);
  if (!h || /courriel|e ?mail|\bweb\b|url|\btel\b|telephone|phone|cell/.test(h)) return null;
  if (/^(no|n|num|numero|number|#|no civique|numero civique|civique|civic|civic number|civic no|house number|house no|street number|no de porte)$/.test(h)) return "number";
  if (/code postal|postal|^zip|^cp$/.test(h)) return "postal";
  if (/^(rue|street|street name|nom de rue|nom de la rue|voie)$/.test(h)) return "street";
  if (/adresse|address/.test(h)) return "address";
  if (/^(ville|city|municipalite|municipality|town|localite|locality|village)$/.test(h)) return "city";
  if (/^(province|prov|state|etat)$/.test(h)) return "province";
  if (/^(nom|name|client|clients|customer|nom du client|nom client|client name|customer name|propriete|property|site|compte|account|contact)$/.test(h))
    return "name";
  return null;
}

const POSTAL = /^[a-z]\d[a-z]\s?\d[a-z]\d$/i;
const looksLikePhone = (s: string) => /^[\d\s().+-]{7,}$/.test(s);
const hasLetters = (s: string) => /[a-zA-ZÀ-ÿ]/.test(s);
/** Starts with a civic number: "123 rue X", "12A, boul. Y", "1200-1210 chemin Z". */
const looksLikeAddress = (s: string) => /^\d+[a-zA-Z]?(?:[-–]\d+)?,?\s+\S/.test(s) && hasLetters(s);

/** The parts not already in the address, joined into what's searched. */
function query(address: string, ...more: string[]): string {
  const seen = norm(address);
  return [address, ...more.filter((p) => p && !seen.includes(norm(p)))].join(", ");
}

/**
 * The addresses in a sheet's rows. With a header row (in the first ten),
 * its columns say what's what: an address column, or number and street
 * columns, then city, province and postal code, and a name or client column
 * for the stop's name. Without one, each row's first cell that starts with a
 * civic number is the address, with the city or postal code after it.
 * The same address twice is placed once.
 */
export function sheetAddresses(rows: string[][]): SheetAddress[] {
  const clean = rows.map((r) => r.map((c) => (c ?? "").trim()));
  const out: SheetAddress[] = [];
  const seen = new Set<string>();
  const add = (row: number, address: string, q: string, name: string | null) => {
    const key = norm(q);
    if (!address || seen.has(key)) return;
    seen.add(key);
    out.push({ row, query: q, address, name: name || null });
  };

  const headerAt = clean.slice(0, 10).findIndex((r) => r.some((c) => fieldOf(c) === "address" || fieldOf(c) === "street"));
  if (headerAt >= 0) {
    const col: Partial<Record<Field, number>> = {};
    clean[headerAt].forEach((c, i) => {
      const f = fieldOf(c);
      if (f && col[f] === undefined) col[f] = i;
    });
    const get = (r: string[], f: Field) => (col[f] === undefined ? "" : (r[col[f]!] ?? ""));
    clean.slice(headerAt + 1).forEach((r, k) => {
      const number = get(r, "number");
      let address = get(r, "address") || [number, get(r, "street")].filter(Boolean).join(" ");
      if (number && get(r, "address") && !/^\d/.test(address)) address = `${number} ${address}`;
      if (!hasLetters(address)) return;
      add(headerAt + k + 2, address, query(address, get(r, "city"), get(r, "province"), get(r, "postal")), get(r, "name"));
    });
    return out;
  }

  clean.forEach((r, k) => {
    const cells = r.filter(Boolean);
    let at = r.findIndex(looksLikeAddress);
    if (at < 0) {
      // A sheet of one column of addresses, with or without civic numbers.
      if (cells.length === 1 && hasLetters(cells[0]) && !cells[0].includes("@")) add(k + 1, cells[0], cells[0], null);
      return;
    }
    const after: string[] = [];
    for (const c of r.slice(at + 1)) {
      if (!c) continue;
      if (c.includes("@") || looksLikePhone(c) || !(hasLetters(c) || POSTAL.test(c)) || after.length === 3) break;
      after.push(c);
    }
    let name = "";
    while (--at >= 0 && !name) if (r[at] && hasLetters(r[at]) && !r[at].includes("@")) name = r[at];
    const address = r.find(looksLikeAddress)!;
    add(k + 1, address, query(address, ...after), name);
  });
  return out;
}

// ---- Placing an address ----

const PHOTON_URL = "https://photon.komoot.io/api/";
/** Quebec and Ontario, as Photon's bbox (west, south, east, north): where a run's stops get a lot (cadastre or estimated). */
const SERVED_BBOX = "-95.2,41.6,-57.1,62.6";

/** Where an address is: [lat, lon], and whether only its street was found (the house number isn't in OpenStreetMap). */
export interface PlacedAddress {
  point: [number, number];
  onStreet: boolean;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { housenumber?: string };
}

/**
 * The first Photon answer for an address, or null. It's on the street unless
 * it's a house with the civic number asked (Photon offers a neighbour's when
 * the one asked isn't mapped).
 */
export function photonPlace(data: unknown, q: string): PlacedAddress | null {
  const f = (data as { features?: PhotonFeature[] } | null)?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!c) return null;
  const asked = q.match(/^\s*(\d+)/)?.[1];
  const found = f.properties?.housenumber?.match(/^\s*(\d+)/)?.[1];
  return { point: [c[1], c[0]], onStreet: !found || (!!asked && asked !== found) };
}

/**
 * Places an address with Photon, in Quebec or Ontario, near the map: a house first
 * (`layer=house`), else whatever it finds (usually the street), flagged.
 * Null when nothing is found.
 */
export async function geocodeAddress(q: string, lang: "en" | "fr", near: { lat: number; lon: number } | null, signal?: AbortSignal): Promise<PlacedAddress | null> {
  const ask = async (house: boolean) => {
    const url = new URL(PHOTON_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", lang);
    url.searchParams.set("bbox", SERVED_BBOX);
    if (near) {
      url.searchParams.set("lat", String(near.lat));
      url.searchParams.set("lon", String(near.lon));
    }
    if (house) url.searchParams.set("layer", "house");
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Photon ${response.status}`);
    return photonPlace(await response.json(), q);
  };
  return (await ask(true)) ?? (await ask(false));
}
