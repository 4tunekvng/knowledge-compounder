/**
 * Cloudflare D1 rejects any statement with more than 100 bound parameters
 * (https://developers.cloudflare.com/d1/platform/limits/), and every value
 * in an `inArray(...)` list is one parameter.
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Split a value list into slices that each fit in one D1 statement. Callers
 * run one query per slice and join the results. `otherParams` counts the
 * statement's other bound values (an owner id, say), which share the limit.
 */
export function chunkForD1<T>(items: readonly T[], otherParams = 0): T[][] {
  const size = D1_MAX_BOUND_PARAMS - otherParams;
  const slices: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    slices.push(items.slice(i, i + size));
  }
  return slices;
}
