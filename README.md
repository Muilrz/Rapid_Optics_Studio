# Rapid Optics Studio

Rapid Optics Studio is a Raman-first scientific engineering studio for building, simulating, acquiring from, and diagnosing a virtual optical instrument.

## Status

V1 under development. The repository has completed **Phase 2A — Studio Foundation + Camera + Read-only Bench**. The hardened Phase 1 Optical Core now drives a read-only, millimeter-based 2D Studio with deterministic derived traces, an independent pan/zoom camera, formal breadboard rendering, and explicit visual representations for all ten component types. Editing, Raman signal physics, CCD simulation, acquisition, and 3D remain future phases.

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
- `src/features`: product-facing feature modules; currently contains the read-only 2D Studio camera and SVG bench layers.
- `src/core`: pure TypeScript scientific computation modules; currently contains the hardened Phase 1 data model, geometry, and 10-component tracing core.
- `src/project`: product defaults and future serialization/migration; currently owns the formal default Raman scene.
- `src/store`: Zustand application state composition with separate authoritative, editor, view, and derived boundaries.
- `src/types`: stable cross-module application types.
- `src/utils`: genuinely shared utilities.
- `tests/fixtures`: reference, regression, stress, and performance fixtures.
- `tests/regression`: deterministic Optical Core and Demo behavior regressions.
- `tests/studio`: camera, state-boundary, component registry, and read-only rendering tests.
- `tests/performance`: non-flaky diagnostic Optical Core performance baselines.
- `reference`: read-only product behavior reference material.

## Authoritative documents

- [`PRD.md`](PRD.md) is the authoritative product and V1 requirements baseline.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the current engineering implementation plan.
- [`reference/raman_sandbox.html`](reference/raman_sandbox.html) is a read-only behavior reference and is not part of the production bundle.
