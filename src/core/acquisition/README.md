# Virtual Spectrometer / CCD Core

This module owns deterministic CCD response, Preview and formal exposure
realization, immutable acquisition contracts, target snapshots, means, and
metric provenance. It remains pure TypeScript with no React, DOM, Zustand,
timer, or browser randomness dependency. Application runtime lives in src/store.

The integrated Phase 3C → 3B → 3D helper synthesizes the Raman-domain signal at
the Spectrometer input. The Virtual Spectrometer then applies its component
throughput exactly once, together with the versioned Sandbox grating throughput
and instrument broadening.

For every sampled wavelength, the V1 deterministic convention is:

```text
QE = max(QE floor, QE peak × exp(-((wavelength - center) / width)^2))

signal counts = Raman-domain relative intensity
              × incident-photon scale
              × component optical throughput
              × grating throughput
              × QE
              × integration time
              × gain counts per photoelectron

dark counts = dark-current counts per second per bin × integration time

expected counts = min(signal counts + dark counts, full-well counts)
```

`read_noise_rms_counts` remains absent from deterministic expected counts. It is
applied by the shared realization used by Preview and formal acquisition.

The Phase 3E preview follows the Sandbox's explicitly versioned approximation:

```text
counting noise = sqrt(max(expected counts, 1 count)) × N(0, 1)
read noise     = configured read-noise RMS counts × independent N(0, 1)
preview counts = clip(expected counts + counting noise + read noise,
                      0, full-well counts)
```

Because deterministic expected counts already contain dark-current expectation,
the counting-noise term represents combined signal-shot and dark-current
counting variance. This is a simplified Gaussian approximation, not an exact
Poisson detector model. Standard-normal samples use the Sandbox's Box-Muller
cosine branch, driven by an injected RNG. The included seeded implementation is
versioned Mulberry32 and no scientific-core path calls global `Math.random()`.

`ExpectedCcdSpectrum` is a deterministic derived result and is intentionally
distinct from a raw acquisition, noisy preview, averaged acquisition, or
processed spectrum.

## Formal acquisition

`ccdRealization.ts` preserves the Phase 3 arithmetic and draw order; Preview
keeps its public API/kind. `acquire.ts` uses an independent Run stream: exposures
and bins in ascending order, counting noise before read noise, two uniform
draws per Box–Muller cosine sample (four per bin). Seed 0 is valid. Resetting a
seed for every frame is not the acquisition algorithm.

`averageAcquisitionExposures` validates Run/index/axis/RNG/detector identity,
requires exactly N frames, then uses the stable incremental arithmetic mean.
Raw uses clipped, unprocessed counts; it is not a sum or a longer single
integration. Retained masks preserve saturation evidence even when the mean
is below full well. Snapshot, counts, mean, and provenance are detached/frozen.

`instrumentInput.ts` recomputes from one captured design and rejects ambiguous
source/sample/detector chains. A dark-only context needs real instrument
identities and the existing CCD pipeline. The scientific projection excludes
editor/display information; changed/deleted components must still be comparable
without revalidating stale target lineage.

SNR and Rayleigh OD remain explicitly undefined (`null` plus reason), so the
final numerical PRD acceptance has not passed. Recorded power readings retain
Phase 3 detected effective-power proxy semantics, mW, source, and model version;
they are not absolute Raman radiant power.
