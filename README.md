# Rapid Optics Studio

Rapid Optics Studio is a Raman-first scientific engineering studio for building, simulating, acquiring from, and diagnosing a virtual optical instrument.

## Status

V1 under development. The repository is currently at **Phase 1D — Remaining Optical Components**: all 10 V1 component types participate in the common deterministic Optical Core tracer, and the formal default Raman scene reaches Spectrometer detection. Raman signal physics and product UI have not started.

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
- `src/features`: future product-facing feature modules.
- `src/core`: pure TypeScript scientific computation modules; currently contains the Phase 1A data model, Phase 1B geometry layer, and Phase 1C/1D tracing interactions.
- `src/project`: future project defaults, schema, serialization, and migration.
- `src/store`: future Zustand state composition.
- `src/types`: stable cross-module application types.
- `src/utils`: genuinely shared utilities.
- `tests/fixtures`: future reference and regression fixtures.
- `tests/regression`: future Demo behavior regression tests.
- `reference`: read-only product behavior reference material.

## Authoritative documents

- [`PRD.md`](PRD.md) is the authoritative product and V1 requirements baseline.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the current engineering implementation plan.
- [`reference/raman_sandbox.html`](reference/raman_sandbox.html) is a read-only behavior reference and is not part of the production bundle.
