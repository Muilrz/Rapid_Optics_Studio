# Tracer Foundation

Phase 1C adds the first optical propagation runtime above the pure geometry
layer. It is browser-independent TypeScript and does not implement Raman
spectroscopy, detector physics, or Phase 1D component interactions.

## Runtime contracts

- `Ray2D` remains geometry-only. `OpticalRay` composes it with wavelength in
  nm, power in mW, a minimal ray kind, and deterministic lineage.
- Initial rays have `parentRayId = null` and `generation = 0`. Every child
  points to its actual parent, inherits its source component, and increments
  generation by one.
- Ray IDs are allocated in deterministic source/queue order inside one trace.
- Enabled sources are ordered by component ID. Propagation uses a FIFO queue;
  geometry candidates and nearest-hit ties use the stable component ID.

## Safety limits

- `max_rays` limits the number of rays processed. Already-created queued rays
  beyond that limit receive `max-ray-count` termination events.
- A ray whose generation is equal to `max_generations` terminates before its
  next intersection.
- Rays strictly below `min_ray_power_mw` terminate before propagation.
- `ray_origin_offset_mm` offsets every child forward from its hit point to
  avoid immediate self-intersection without changing geometry epsilon policy.

## Implemented interactions

- Laser: one ideal collimated source ray along the component's rotation.
- Mirror: ideal geometric reflection with configured reflectivity loss.
- Objective: direction-preserving simplified pass with lineage-carried focal
  distance context and Sample distance/defocus metadata.
- Dichroic: kind-aware deterministic transmission/reflection. Transmitted is
  always the first semantic branch, followed by reflected. The oriented normal
  classifies front/back incidence for diagnostics; this V1 coating model uses
  the same configured coefficients on both sides.
- Sample: strict backward elastic placeholder return used only to establish
  the tracer path. It is explicitly not Raman emission or Raman physics.
- Filter: Raman-placeholder transmission plus reference-derived, parameterized
  AOI leakage for excitation rays.
- Beam Splitter: transmitted then reflected deterministic branches.
- Prism: configurable signed simplified deflection relative to surface tangent.
- Pinhole: pass/block using the generic aperture-plane hit.
- Spectrometer: terminal acceptance about either direction of its surface
  normal; the configured half-angle boundary is inclusive.

Every interaction event records incoming, outgoing, detected, and lost power.
The four terms are expressed in mW and no interaction may increase total power.

Other component types intentionally have no Phase 1C geometry candidate and
are not treated as transparent optical elements.
