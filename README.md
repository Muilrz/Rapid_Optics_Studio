# Rapid Optics Studio

Rapid Optics Studio is a Raman-first scientific engineering studio for building, simulating, acquiring from, and diagnosing a virtual optical instrument.

## Status

**V1 complete · Phase 8 — Diagnostics + Hardening Completed.** The Studio workspaces provide direct access to the Bench, 3D Viewer, Spectrum, Acquisition, Analysis and Diagnostics. See [current status](CURRENT_PHASE.md) and the [Phase 8 plan and acceptance record](PHASE8_PLAN.md).

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
npm run test:e2e
npm run benchmark
```

## Directory overview

- `src/app`: application bootstrap and app-level concerns.
- `src/features`: product-facing feature modules, including the 2D Studio, 3D Viewer, Acquisition and Spectrum Analysis.
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
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) owns the Phase 0–8 roadmap, dependencies, exit gates, and detailed-plan index.
- [`PHASE0_PLAN.md`](PHASE0_PLAN.md) and [`PHASE1_PLAN.md`](PHASE1_PLAN.md) preserve the completed early-phase execution plans extracted from the former mixed-role roadmap.
- Phase 2 has no independently retained execution-plan document; the repository does not reconstruct one retrospectively from the implementation.
- [`PHASE3_PLAN.md`](PHASE3_PLAN.md) preserves the completed Phase 3 execution contract and acceptance record.
- [`PHASE4_PLAN.md`](PHASE4_PLAN.md) and [`PHASE5_PLAN.md`](PHASE5_PLAN.md) preserve the Acquisition and Spectrum Analysis acceptance records.
- [`PHASE6_PLAN.md`](PHASE6_PLAN.md) owns the 3D Presentation execution contract and browser acceptance record.
- [`CURRENT_PHASE.md`](CURRENT_PHASE.md) owns current development status and review boundaries.
- [`AGENTS.md`](AGENTS.md) defines agent execution rules and document responsibilities.
- [`reference/raman_sandbox.html`](reference/raman_sandbox.html) is a read-only behavior reference and is not part of the production bundle.
