/** Tracing-level tolerances; geometry tolerances remain in geometry/epsilon.ts. */
export const TRACING_NUMERIC_POLICY = Object.freeze({
  relativePower: 1e-12,
  angleBoundary_deg: 1e-10,
})
