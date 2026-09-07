# Virtual Spectrometer / CCD Core

This module owns Phase 3D deterministic detector response only. It remains
pure TypeScript and has no React, DOM, acquisition-run, preview, or random-noise
state.

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
applied only by the seeded Phase 3E single-preview exposure primitive.

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
