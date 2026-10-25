"use client";

import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { MOWERS } from "@/lib/mowers";
import { predictedHours } from "@/lib/records";
import { useRecords } from "@/lib/records-store";
import type { AcreBasis } from "@/lib/trust";
import { countUse } from "@/lib/usage";
import { Icon } from "./icons";
import { ui } from "./ui";

const ACRE_M2 = 4046.86;
/** The rep's details and team key, as the Proposal tab keeps them on this device. */
const REP_KEY = "calculator.rep";
const savedKey = () => {
  try {
    return (JSON.parse(localStorage.getItem(REP_KEY) ?? "{}") as { teamKey?: string }).teamKey ?? "";
  } catch {
    return "";
  }
};

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * What the field measured, for the rep (never printed): a robot timed on a
 * known area (a field check), or a property's real acreage on the robot's
 * map after installation against ours (an install). Both are saved in the
 * database and make the next quotes surer (records.ts).
 */
export default function RecordActuals({
  lang,
  model,
  acres,
  basis,
  property,
}: {
  lang: Lang;
  /** The robot recommended, chosen first. */
  model: string | null;
  /** Our acreage for the property (before the client's figure). */
  acres: number | null;
  basis: AcreBasis;
  property: string;
}) {
  const a = UI[lang].actuals;
  const records = useRecords();
  const [kind, setKind] = useState<"check" | "install">("check");
  const [robot, setRobot] = useState(model ?? "KR238");
  const [area, setArea] = useState(acres ? acres.toFixed(2) : "");
  const [hours, setHours] = useState("");
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(savedKey);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const mower = MOWERS.find((m) => m.id === robot);
  const areaAc = num(area);
  const predicted = mower && areaAc ? predictedHours(mower, areaAc * ACRE_M2) : null;
  const fmt = (n: number) => n.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 });

  const body =
    kind === "check"
      ? areaAc && predicted && num(hours)
        ? { kind, model: robot, areaM2: areaAc * ACRE_M2, predictedH: predicted, actualH: num(hours), note }
        : null
      : acres && num(actual)
        ? { kind, basis, predictedAcres: acres, actualAcres: num(actual), property, note }
        : null;

  const save = async () => {
    if (!body || !key) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json", "x-team-key": key }, body: JSON.stringify(body) });
      setStatus(res.ok ? "saved" : "failed");
      if (res.ok) countUse("record.add");
    } catch {
      setStatus("failed");
    }
  };

  const input = `${ui.input} py-1.5 text-sm`;
  return (
    <details className="group rounded-lg border border-dashed border-line px-3 py-2 print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink-2">
        <span className="flex items-center gap-1.5">
          <Icon name="ruler" className="h-3.5 w-3.5 text-accent" />
          {a.title}
        </span>
        <Icon name="arrowDown" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2 text-xs">
        <p className="text-[11px] text-muted">{a.lede}</p>
        <p className="text-[11px] text-muted">{a.status(records.checks, records.installs)}</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {(["check", "install"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setStatus("idle");
              }}
              className={`min-h-8 rounded-md px-1 text-xs font-semibold ${kind === k ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
            >
              {k === "check" ? a.check : a.install}
            </button>
          ))}
        </div>
        {kind === "check" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block font-semibold text-ink-2">{a.model}</span>
              <select value={robot} onChange={(e) => setRobot(e.target.value)} className={input}>
                {MOWERS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block font-semibold text-ink-2">{a.area}</span>
              <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={input} />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="block font-semibold text-ink-2">{a.hours}</span>
              <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className={input} />
              {predicted !== null && <span className="block text-[11px] text-muted">{a.predicted(fmt(predicted))}</span>}
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block font-semibold text-ink-2">{a.ours}</span>
              <input value={acres ? fmt(acres) : "–"} readOnly className={`${input} bg-surface-2`} />
            </label>
            <label className="space-y-1">
              <span className="block font-semibold text-ink-2">{a.actual}</span>
              <input inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} className={input} />
            </label>
          </div>
        )}
        <label className="block space-y-1">
          <span className="block font-semibold text-ink-2">{a.note}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>
        {!savedKey() && (
          <label className="block space-y-1">
            <span className="block font-semibold text-ink-2">{a.teamKey}</span>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" className={input} />
          </label>
        )}
        <button type="button" disabled={!body || !key || status === "saving"} onClick={() => void save()} className={`${ui.btnSecondary} w-full`}>
          <Icon name="check" />
          {a.save}
        </button>
        {status === "saved" && <p className="text-accent">{a.saved}</p>}
        {status === "failed" && <p className="text-red-600 dark:text-red-400">{a.failed}</p>}
      </div>
    </details>
  );
}
