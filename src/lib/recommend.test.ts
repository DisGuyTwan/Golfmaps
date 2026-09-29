import { describe, it, expect } from "vitest";
import { PLANNING_FACTOR, recommendUnits } from "./recommend";

const small = { name: "Small", capacityAcres: 2, price: 5000 };
const large = { name: "Large", capacityAcres: 10, price: 30000 };

describe("recommendUnits", () => {
  it("sizes each model at the planning factor, rounding units up", () => {
    const [option] = recommendUnits(10, [large]);
    // 10 ac rated -> 8 ac planned per unit -> 2 units for 10 ac.
    expect(PLANNING_FACTOR).toBe(0.8);
    expect(option.units).toBe(2);
    expect(option.plannedAcres).toBeCloseTo(16);
    expect(option.utilization).toBeCloseTo(10 / 16);
    expect(option.totalPrice).toBe(60000);
  });

  it("ranks by total cost when every model has a price", () => {
    const ranked = recommendUnits(7, [large, small]);
    expect(ranked.map((o) => [o.model.name, o.units])).toEqual([
      ["Small", 5],
      ["Large", 1],
    ]);
  });

  it("ranks by fewest units when prices are missing", () => {
    const ranked = recommendUnits(7, [{ name: "Small", capacityAcres: 2 }, { name: "Large", capacityAcres: 10 }]);
    expect(ranked[0].model.name).toBe("Large");
    expect(ranked[0].totalPrice).toBeNull();
  });

  it("returns nothing for an empty area, an empty catalog, or zero-capacity models", () => {
    expect(recommendUnits(0, [large])).toEqual([]);
    expect(recommendUnits(12, [])).toEqual([]);
    expect(recommendUnits(12, [{ name: "Broken", capacityAcres: 0 }])).toEqual([]);
  });
});
