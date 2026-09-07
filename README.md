# Rapid Optics Studio

Rapid Optics Studio is a Raman-first scientific engineering studio for building, simulating, acquiring from, and diagnosing a virtual optical instrument.

## Status

V1 under development. The repository has completed **Phase 3B — Deterministic Raman Spectrum Math**. The pure TypeScript Raman core now provides validated material data, shift/wavelength conversion, Lorentzian profiles, configured broadening, versioned simplified wavelength/fluorescence/Rayleigh models, dynamic or custom Raman-shift axes, and immutable deterministic expected Raman-domain spectra. Focus and optical-trace coupling, Virtual CCD behavior, spectrum UI, acquisition, 3D, and Project I/O remain deferred to their documented later phases.

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
- `src/features`: product-facing feature modules; currently contains the 2D Studio camera, deterministic click/box selection and group-move helpers, align/distribution math, editability policy, and interactive SVG bench layers.
- `src/core`: pure TypeScript scientific computation modules; contains the hardened Phase 1 generic optical core and the separate Phase 3B deterministic Raman material/spectrum core.
- `src/project`: product defaults and component definitions/factories; currently owns the formal default Raman scene and ten-type Studio creation registry.
- `src/store`: Zustand application state composition with separate authoritative, editor clipboard/selection/lock, bounded design history, view, and derived boundaries.
- `src/types`: stable cross-module application types.
- `src/utils`: genuinely shared utilities.
- `tests/fixtures`: reference, regression, stress, and performance fixtures.
- `tests/regression`: deterministic Optical Core and Demo behavior regressions.
- `tests/studio`: camera, click/box selection and group-move math, lock/align/distribution commands, component definitions/factory, clipboard/history, scene mutations, Inspector validation, state-boundary, and interactive bench rendering tests.
- `tests/performance`: non-flaky diagnostic Optical Core performance baselines.
- `reference`: read-only product behavior reference material.

## Authoritative documents

- [`PRD.md`](PRD.md) is the authoritative product and V1 requirements baseline.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the current engineering implementation plan.
- [`PHASE3_PLAN.md`](PHASE3_PLAN.md) is the Phase 3 execution contract and sub-phase boundary.
- [`reference/raman_sandbox.html`](reference/raman_sandbox.html) is a read-only behavior reference and is not part of the production bundle.
