/**
 * Kress models the recommender can suggest.
 *
 * Fill this in from Kress's official spec sheets / your dealer price list.
 * The recommender stays disabled until at least one model is listed, so a
 * quote is never based on made-up capacities.
 *
 * Example entry (values are placeholders, NOT real specs):
 *   {
 *     code: "XYZ789",          // product.code as reported by the Kress API
 *     name: "Kress <model>",
 *     capacityAcres: 5,        // rated maximum working area per unit
 *     maxSlopePct: 35,
 *     cutWidthCm: 56,
 *     price: 12000,            // optional; enables cost-based ranking
 *   },
 */
export interface KressModel {
  /** Product code from the API (`product.code`); used to label fleet units. */
  code?: string;
  name: string;
  /** Rated maximum working area per unit, in acres. */
  capacityAcres: number;
  maxSlopePct?: number;
  cutWidthCm?: number;
  /** Unit price in PRICE_CURRENCY; enables cost-based ranking. */
  price?: number;
  notes?: string;
}

export const PRICE_CURRENCY = "CAD";

export const KRESS_MODELS: KressModel[] = [];

export function modelForCode(code: string | null | undefined): KressModel | undefined {
  if (!code) return undefined;
  return KRESS_MODELS.find((model) => model.code === code);
}
