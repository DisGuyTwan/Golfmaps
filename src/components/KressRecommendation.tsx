"use client";

import { useMemo, useState } from "react";
import { KRESS_MODELS, PRICE_CURRENCY } from "@/lib/kress-catalog";
import { PLANNING_FACTOR, recommendUnits } from "@/lib/recommend";
import type { CourseMeasurement } from "@/lib/types";

type TurfKey = "fairway" | "rough" | "green" | "tee";

const TURF_LABELS: Record<TurfKey, string> = {
  fairway: "Fairway",
  rough: "Rough",
  green: "Green",
  tee: "Tee",
};

interface Props {
  result: CourseMeasurement;
  installed: { uuid: string; name: string }[] | null;
}

export default function KressRecommendation({ result, installed }: Props) {
  // Robotic fleets on golf courses usually take fairways and rough; greens
  // and tees are opt-in.
  const [included, setIncluded] = useState<Record<TurfKey, boolean>>({
    fairway: true,
    rough: true,
    green: false,
    tee: false,
  });

  const area = (Object.keys(included) as TurfKey[]).reduce(
    (sum, key) => sum + (included[key] ? result[key].acres : 0),
    0,
  );
  const options = useMemo(() => recommendUnits(area), [area]);
  const best = options[0];

  return (
    <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-violet-900">Kress unit recommendation</h3>
        {installed && (
          <span className="text-[11px] font-medium text-violet-700">
            Installed here: {installed.length}
          </span>
        )}
      </div>

      {installed && installed.length > 0 && (
        <p className="truncate text-[11px] text-violet-700">
          {installed.map((unit) => unit.name).join(", ")}
        </p>
      )}

      {result.boundaryOnly ? (
        <p className="text-[11px] text-violet-800">
          This course&apos;s turf isn&apos;t mapped, so a unit count can&apos;t be
          calculated reliably.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TURF_LABELS) as TurfKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setIncluded((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                  included[key]
                    ? "bg-violet-600 text-white ring-violet-600"
                    : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                {TURF_LABELS[key]} {result[key].acres.toFixed(1)}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-violet-800">
            Area to mow: <span className="font-semibold">{area.toFixed(2)} ac</span>
          </p>

          {KRESS_MODELS.length === 0 ? (
            <p className="text-[11px] text-violet-800">
              No Kress models configured yet. Add the models you sell (capacity,
              and optionally price) to see which unit fits best.
            </p>
          ) : !best ? (
            <p className="text-[11px] text-violet-800">Select at least one turf type.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-violet-950">
                {best.units} × {best.model.name}
                {best.totalPrice != null &&
                  ` · ${best.totalPrice.toLocaleString()} ${PRICE_CURRENCY}`}
              </p>
              <p className="text-[11px] text-violet-800">
                {Math.round(best.utilization * 100)}% of planned capacity used (
                {best.plannedAcres.toFixed(1)} ac)
              </p>
              {options.slice(1, 3).map((option) => (
                <p key={option.model.name} className="text-[11px] text-slate-500">
                  Alt: {option.units} × {option.model.name}
                  {option.totalPrice != null &&
                    ` · ${option.totalPrice.toLocaleString()} ${PRICE_CURRENCY}`}
                </p>
              ))}
              <p className="text-[10px] text-slate-400">
                Planned at {Math.round(PLANNING_FACTOR * 100)}% of rated capacity to
                allow for travel between holes. Slope isn&apos;t checked.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
