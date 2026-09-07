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

`read_noise_rms_counts` is deliberately contract-only in Phase 3D. Applying a
noise realization, seeded or otherwise, belongs to Phase 3E.

`ExpectedCcdSpectrum` is a deterministic derived result and is intentionally
distinct from a raw acquisition, noisy preview, averaged acquisition, or
processed spectrum.
