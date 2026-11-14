/**
 * Cloudflare D1 rejects any statement with more than 100 bound parameters
 * (https://developers.cloudflare.com/d1/platform/limits/), and every value
 * in an `inArray(...)` list is one parameter.
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Split a value list into slices that each fit in one D1 statement. Callers
 * run one query per slice and join the results.
 */
export function chunkForD1<T>(items: readonly T[]): T[][] {
  const slices: T[][] = [];
  for (let i = 0; i < items.length; i += D1_MAX_BOUND_PARAMS) {
    slices.push(items.slice(i, i + D1_MAX_BOUND_PARAMS));
  }
  return slices;
}
