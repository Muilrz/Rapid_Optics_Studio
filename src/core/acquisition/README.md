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

## Numerical metrics and validity

`numericalMetrics.ts` supplies versioned model metrics, without changing Raw,
exposures, the CCD noise generator, or the acquisition scheduler. Previous Runs
with undefined metrics remain valid historical data; they are not recalculated.
The numerical union extends metric availability; Exposure/Raw contract versions
and all Preview/RNG results remain unchanged.

Rayleigh path OD is `-log10(T)` for positive modeled transfer T from a unit
Sample Rayleigh return to Spectrometer **input**, at the frozen excitation
wavelength. Context transfer includes the traced filter AOI leakage, dichroic
branch coefficients and passive path losses; it excludes grating/QE/electronics.
It is not the OD of an isolated filter or a calibrated wavelength scan. T=1
gives 0; missing path/wavelength or T=0 gives explicit undefined (not Infinity,
not an epsilon-limited OD). See [NIST TN1715, glossary](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1715.pdf).

Peak SNR is the **predicted Raman signal per bin / Gaussian RMS of the N-frame
mean**, at the strongest frozen Raman-only CCD bin, first index on ties. The
axis must contain a nonzero material reference peak. Signal is reconstructed
through the existing Raman-component synthesis and CCD conversion, applying
QE, throughput, integration and gain once, with no fluorescence/Rayleigh/dark
in the numerator. Let E be the original total expected counts at that bin:

```text
sigma_mean = hypot(sqrt(max(E, existing_variance_floor)), read_noise_rms) / sqrt(N)
predicted_peak_snr = expected_Raman_only_signal_counts / sigma_mean
```

E already includes background and dark. This follows the **existing output
counts Gaussian model**, not a new electron-domain Poisson model; no extra
gain/dark variance is added. Independent variances combine in quadrature;
see [Hamamatsu's SNR guide](https://camera.hamamatsu.com/us/en/learn/technical_information/thechnical_guide/calculating_snr.html).
Using that rule with this repository's counts-domain approximation and N is a
model derivation, not a calibrated hardware SNR formula or empirical estimate
from the noisy maximum. No Phase 5 peak detection/baseline processing is added.

Expected saturation or observed clipping **at the selected peak bin** makes
this linear SNR undefined. No alternative unsaturated bin is chosen to conceal
saturation. Missing Raman source/peak, incomplete N, and numerical range limits
are handled explicitly. Raw is never background-subtracted or modified.

Missing inputs for calibrated physical claims include wavelength/AOI/polarization
dependent filter curves and validated detector conversion/noise calibration.
These do not prevent the explicitly limited model metrics, but cannot be
invented to claim measured filter OD or hardware SNR. The default 10mW,
1s/N=20 Raman peak is saturated and correctly keeps SNR undefined. PRD F fixes
integration and N, not the optical layout/power: the accepted scene uses the
existing Laser at 0.1mW, all other layout/CCD settings unchanged (1s/N=20,
gain 340, full well 60000). It yields an unclipped Raman peak and finite model
metrics. See tests/fixtures/phase4AcceptanceScene.ts and PHASE4_PLAN.md §4.8
for reproducible acceptance and provenance. No default or formula was changed.
Power readings retain their mW/source/model and effective-proxy semantics.
