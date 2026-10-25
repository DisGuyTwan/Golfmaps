import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { csvRows, photonPlace, readSheet, sheetAddresses, SheetError, worksheetRows } from "./addresses";

/** A zip of these files (deflated, as Excel writes them; the reader doesn't check CRCs). */
function zip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const header = (size: number) => new DataView(new ArrayBuffer(size));
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = deflateRawSync(enc.encode(text));
    const local = header(30);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, text.length, true);
    local.setUint16(26, nameBytes.length, true);
    const dir = header(46);
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, 8, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, text.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dirSize = central.reduce((t, p) => t + p.length, 0);
  const end = header(22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("reading a sheet", () => {
  it("reads the first visible sheet of an Excel workbook: shared and inline text, numbers, skipped cells", async () => {
    const xlsx = zip({
      "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="Old" sheetId="1" state="hidden" r:id="rId1"/><sheet name="Clients" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Target="worksheets/sheet2.xml" Id="rId2" Type="ws"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>Nom</t></si><si><t>Adresse</t></si><si><r><t>Ville</t></r></si><si><t>Tremblay &amp; fils</t></si><si><t>rue Lionel-Daunais</t></si><si><t xml:space="preserve">Boucherville</t><rPh><t>x</t></rPh></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hidden</t></is></c></row></sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
        <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="inlineStr"><is><t>1225 rue Lionel-Daunais</t></is></c><c r="D3" t="s"><v>5</v></c></row>
        <row r="4"><c r="B4"><v>640</v></c><c r="C4" t="e"><v>#N/A</v></c></row>
        <row r="5"/>
      </sheetData></worksheet>`,
    });
    expect(await readSheet(xlsx)).toEqual([
      ["Nom", "Adresse", "", "Ville"],
      [],
      ["Tremblay & fils", "1225 rue Lionel-Daunais", "", "Boucherville"],
      ["", "640", ""],
      [],
    ]);
  });

  it("reads CSV with commas, semicolons (French Excel) or tabs, quotes and a BOM", () => {
    expect(csvRows('﻿Nom,Adresse\r\n"Tremblay, Jean","12 rue ""A"""\r\n')).toEqual([
      ["Nom", "Adresse"],
      ["Tremblay, Jean", '12 rue "A"'],
    ]);
    expect(csvRows("Adresse;Ville\n12 rue A;Boucherville")).toEqual([
      ["Adresse", "Ville"],
      ["12 rue A", "Boucherville"],
    ]);
    expect(csvRows("Adresse\tVille\n12 rue A\tLongueuil\n")).toEqual([
      ["Adresse", "Ville"],
      ["12 rue A", "Longueuil"],
    ]);
  });

  it("reads a CSV saved by Excel on Windows (accents in Windows-1252)", async () => {
    // "Montréal" with é as the single byte 0xE9.
    const bytes = Uint8Array.from([...new TextEncoder().encode("Adresse;Ville\n1 rue A;Montr"), 0xe9, ...new TextEncoder().encode("al\n")]);
    expect((await readSheet(bytes))[1]).toEqual(["1 rue A", "Montréal"]);
  });

  it("asks for .xlsx or .csv instead of an old .xls workbook", async () => {
    await expect(readSheet(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).rejects.toEqual(new SheetError("xls"));
  });

  it("keeps Excel's row numbers when rows are empty", () => {
    expect(worksheetRows(`<row r="2"><c r="B2" t="inlineStr"><is><t>x</t></is></c></row>`, [])).toEqual([[], ["", "x"]]);
  });
});

describe("finding the addresses", () => {
  it("uses the header row: address, city, postal code and a client name, in French", () => {
    expect(
      sheetAddresses([
        ["Liste de tonte"],
        ["Client", "Adresse", "Ville", "Code postal", "Téléphone", "Courriel"],
        ["Tremblay", "1225 rue Lionel-Daunais", "Boucherville", "J4B 8N4", "450-555-1234", "a@b.ca"],
        ["", "", "", "", "", ""],
        ["Gagnon", "640 boul. De Montarville, Boucherville", "Boucherville", "", "", ""],
      ]),
    ).toEqual([
      { row: 3, query: "1225 rue Lionel-Daunais, Boucherville, J4B 8N4", address: "1225 rue Lionel-Daunais", name: "Tremblay" },
      // The city is already in the address: not twice.
      { row: 5, query: "640 boul. De Montarville, Boucherville", address: "640 boul. De Montarville, Boucherville", name: "Gagnon" },
    ]);
  });

  it("joins civic number and street columns, in English", () => {
    expect(
      sheetAddresses([
        ["Customer", "Civic number", "Street", "City", "Province"],
        ["Smith", "12", "Main Street", "Hudson", "QC"],
        ["Jones", "12", "Main Street", "Hudson", "QC"],
      ]),
    ).toEqual([{ row: 2, query: "12 Main Street, Hudson, QC", address: "12 Main Street", name: "Smith" }]);
  });

  it("without a header, takes each row's address and the city after it, and the name before", () => {
    expect(
      sheetAddresses([
        ["Tremblay", "1225 rue Lionel-Daunais", "Boucherville", "J4B 8N4", "450 555-1234"],
        ["2 chemin du Lac, Lac-Beauport"],
        ["Notes", "to call back"],
      ]),
    ).toEqual([
      { row: 1, query: "1225 rue Lionel-Daunais, Boucherville, J4B 8N4", address: "1225 rue Lionel-Daunais", name: "Tremblay" },
      { row: 2, query: "2 chemin du Lac, Lac-Beauport", address: "2 chemin du Lac, Lac-Beauport", name: null },
    ]);
  });

  it("finds nothing in a sheet without addresses", () => {
    expect(sheetAddresses([["Name", "Phone"], ["Smith", "450-555-1234"]])).toEqual([]);
  });
});

describe("placing an address", () => {
  const answer = (housenumber?: string) => ({ features: [{ geometry: { coordinates: [-73.43, 45.6] }, properties: { housenumber } }] });

  it("is at the house when Photon has the civic number asked", () => {
    expect(photonPlace(answer("1225"), "1225 rue Lionel-Daunais, Boucherville")).toEqual({ point: [45.6, -73.43], onStreet: false });
  });

  it("is only on the street when Photon has another number, or none", () => {
    expect(photonPlace(answer("1227"), "1225 rue Lionel-Daunais")?.onStreet).toBe(true);
    expect(photonPlace(answer(), "1225 rue Lionel-Daunais")?.onStreet).toBe(true);
    expect(photonPlace({ features: [] }, "x")).toBeNull();
  });
});
