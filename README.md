# Rapid Optics Studio

Rapid Optics Studio is a Raman-first scientific engineering studio for building, simulating, acquiring from, and diagnosing a virtual optical instrument.

## Status

V1 under development. The repository has completed **Phase 3 — Raman + Virtual CCD**, including Phase 3G regression and real-browser integration acceptance in Microsoft Edge. The React/Zustand Studio derives the complete Scene → Trace → Raman optical context → expected Raman spectrum → deterministic Expected CCD Spectrum → seeded single-preview exposure chain without duplicating project state. The live Spectrum Preview overlays expected and noisy detector curves, exposes the built-in materials and detector controls, and reports focus, path, power, and saturation telemetry. Acquisition runs and averaging, spectrum analysis, 3D, and Project I/O remain deferred to their documented later phases.

Phase 3 remains an explicitly **Simplified / First-order** engineering model. Material intensities are relative and phenomenological; focus uses a provisional millimetre-based defocus model; optical and spectrometer throughput are simplified; QE follows the documented Gaussian approximation; and preview noise uses a seeded Gaussian approximation rather than an exact Poisson detector model. The preview is not an acquisition run or processed spectrum.

## Technology

- React 19
- TypeScript
- Vite
- Three.js
- Zustand
- Zod
- Vitest
- Node.js 24.18.0
- npm

V1 is browser-only. It has no Node.js backend, database, server, monorepo, or workspace setup.

## Development

Install dependencies:

```shell
npm install
```

Start the development server:

```shell
npm run dev
```

Create a production build:

```shell
npm run build
```

Run tests and lint checks:

```shell
npm run test
npm run lint
```

## Directory overview

- `src/app`: application bootstrap and app-level concerns.
- `src/features`: product-facing feature modules; currently contains the 2D Studio camera and interactive bench layers plus the completed Phase 3 Spectrum Preview.
- `src/core`: pure TypeScript scientific computation modules; contains the hardened Phase 1 generic optical core, the separate Raman material/spectrum/focus/trace-coupling core, and the minimal Virtual Spectrometer / deterministic CCD / seeded single-preview exposure core.
- `src/project`: product defaults and component definitions/factories; currently owns the formal default Raman scene and ten-type Studio creation registry.
- `src/store`: Zustand application state composition with separate authoritative, editor clipboard/selection/lock, bounded design history, view, and derived simulation boundaries. Trace, Raman context, expected spectra, and preview exposure remain recomputable derived results.
- `src/types`: stable cross-module application types.
- `src/utils`: genuinely shared utilities.
- `tests/fixtures`: reference, regression, stress, and performance fixtures.
- `tests/regression`: deterministic Optical Core and Demo behavior regressions.
- `tests/studio`: camera, editing commands, component definitions/factory, clipboard/history, scene mutations, Inspector validation, state boundaries, interactive bench rendering, and Spectrum Preview integration/rendering tests.
- `tests/performance`: non-flaky diagnostic Optical Core performance baselines.
- `reference`: read-only product behavior reference material.

## Authoritative documents

- [`PRD.md`](PRD.md) is the authoritative product and V1 requirements baseline.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the current engineering implementation plan.
- [`PHASE3_PLAN.md`](PHASE3_PLAN.md) is the Phase 3 execution contract and sub-phase boundary.
- [`reference/raman_sandbox.html`](reference/raman_sandbox.html) is a read-only behavior reference and is not part of the production bundle.
