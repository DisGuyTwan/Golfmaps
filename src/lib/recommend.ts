import { KRESS_MODELS, type KressModel } from "./kress-catalog";

/**
 * Plan each unit at 80% of its rated area: golf turf is split into separate
 * holes, so mowers lose time travelling between zones and working edges.
 */
export const PLANNING_FACTOR = 0.8;

export interface UnitOption {
  model: KressModel;
  units: number;
  /** Planned area the fleet can cover (units x capacity x factor). */
  plannedAcres: number;
  /** Share of the planned capacity the course uses (0-1). */
  utilization: number;
  totalPrice: number | null;
}

/**
 * Ranks models for a target mowing area. With prices for every model it ranks
 * by total cost; otherwise by fewest units, then best capacity utilization.
 */
export function recommendUnits(
  areaAcres: number,
  models: KressModel[] = KRESS_MODELS,
  factor: number = PLANNING_FACTOR,
): UnitOption[] {
  if (!(areaAcres > 0)) return [];

  const options = models
    .filter((model) => model.capacityAcres > 0)
    .map((model): UnitOption => {
      const perUnit = model.capacityAcres * factor;
      const units = Math.max(1, Math.ceil(areaAcres / perUnit));
      return {
        model,
        units,
        plannedAcres: units * perUnit,
        utilization: areaAcres / (units * perUnit),
        totalPrice: model.price != null ? units * model.price : null,
      };
    });

  const allPriced = options.length > 0 && options.every((o) => o.totalPrice != null);
  return options.sort((a, b) =>
    allPriced
      ? a.totalPrice! - b.totalPrice! || a.units - b.units
      : a.units - b.units || b.utilization - a.utilization,
  );
}
