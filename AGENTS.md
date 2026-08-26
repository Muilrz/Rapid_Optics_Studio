# Rapid Optics Studio — Agent Development Guide

This file defines how coding agents should work inside the Rapid Optics Studio repository.

It is an **agent execution guide**, not a replacement for the product requirements, implementation plan, or project README.

Do not infer detailed product requirements from this file. Follow the authoritative repository documents defined below.

---

## 1. Sources of Truth

Use the repository documents according to the following responsibilities.

### `PRD.md`

Authoritative for:

- product definition;
- V1 product goals;
- functional requirements;
- non-goals;
- expected user behavior;
- acceptance expectations;
- scientific and product-level constraints.

When deciding **what the product must do**, use `PRD.md`.

### `IMPLEMENTATION_PLAN.md`

Authoritative for:

- the current engineering baseline;
- repository architecture;
- technical implementation decisions;
- development phases and sub-phases;
- implementation order;
- phase scope;
- phase exit gates;
- current engineering constraints.

When deciding **how and when the product should be implemented**, use `IMPLEMENTATION_PLAN.md`.

### `README.md`

Use as the repository entry point for:

- current development status;
- current technology stack;
- development commands;
- high-level directory overview;
- links to authoritative documents.

Do not treat README summaries as a replacement for the detailed PRD or implementation plan.

### `reference/`

`reference/` contains legacy/demo product material used as a behavior and algorithm reference.

In particular, `reference/raman_sandbox.html` is a reference implementation from the earlier prototype.

It is **not production source code**.

---

## 2. Resolving Documentation Differences

The repository may contain product-level recommendations in `PRD.md` that have been refined by later engineering decisions in `IMPLEMENTATION_PLAN.md`.

Resolve these according to responsibility:

- For product behavior, V1 requirements, non-goals, and acceptance criteria, follow `PRD.md`.
- For repository structure, architecture implementation, dependencies, development order, and current technical baseline, follow `IMPLEMENTATION_PLAN.md`.
- A later engineering decision may simplify implementation without silently changing the product requirement.
- Do not reinterpret an engineering simplification as permission to remove a product requirement.
- If a real contradiction would require changing product scope, stop and report the conflict instead of silently choosing one interpretation.

---

## 3. Current V1 Engineering Baseline

Follow the current engineering baseline defined by `IMPLEMENTATION_PLAN.md`.

Unless explicitly instructed otherwise:

- keep V1 as a single npm project;
- use React + TypeScript + Vite;
- keep V1 browser-only;
- do not introduce a Node.js application backend;
- do not introduce a database;
- do not introduce a server architecture;
- do not convert the repository into a monorepo or workspace;
- do not introduce internal npm packages solely for architectural appearance;
- do not create infrastructure for hypothetical future requirements.

Add new infrastructure only when required by the current implementation scope or explicitly requested.

---

## 4. Architecture Invariants

Preserve the architectural boundaries already established by the project.

### Scientific Core

Code under `src/core` is the reusable scientific computation layer.

It must:

- remain pure TypeScript where intended by the implementation plan;
- remain independent from React;
- remain independent from the DOM;
- remain independent from Three.js;
- avoid UI state and rendering concerns.

Scientific or optical physics logic must not be implemented inside React components when it belongs in the reusable core.

### Coordinate Model

Physical optical world coordinates use millimeters.

Keep these concepts separate:

```text
Physical / World Coordinates
        ≠
Screen / Pixel Coordinates
```

Screen-space values must not become physical quantities inside the Optical Core.

### State Ownership

Maintain a single authoritative project/design state.

Derived data such as:

- ray traces;
- expected spectra;
- telemetry;
- diagnostics;
- visualization results;

must remain derived results rather than becoming independent authoritative copies of project state.

### Incremental Architecture

Prefer the smallest implementation that satisfies the current phase and preserves known boundaries.

Do not create:

- speculative abstraction layers;
- premature plugin systems;
- generalized frameworks without a current requirement;
- placeholder infrastructure for distant phases.

Future extensibility should come from clean boundaries, not unused complexity.

---

## 5. Reference Material Rules

Treat `reference/` as read-only unless the user explicitly requests a modification.

When using the legacy demo:

- use it to understand intended behavior;
- use it to identify validated interaction ideas;
- extract fixtures, formulas, defaults, constants, or regression cases when required;
- preserve useful product behavior when consistent with the PRD.

Do not:

- treat demo architecture as production architecture;
- directly migrate its global mutable-state design;
- copy its monolithic implementation structure into production code;
- preserve pixel-based physical assumptions where the formal architecture uses world units;
- modify the reference file as part of normal implementation work.

If demo behavior conflicts with the PRD, the PRD takes precedence.

---

## 6. Phase Discipline

Development follows the phases defined in `IMPLEMENTATION_PLAN.md`

A user task may divide a documented phase into narrower execution batches
or sub-phases for review and implementation control without changing the
overall product scope or implementation plan.

When such a batch is explicitly assigned, the current task defines that
batch's scope and exit boundary.

For every implementation task:

1. Identify the documented phase and the explicitly assigned execution batch or sub-phase, if any.
2. Read the relevant section of `IMPLEMENTATION_PLAN.md`.
3. Inspect the existing implementation before editing.
4. Determine the smallest required change set.
5. Implement only the requested scope.
6. Add or update relevant tests.
7. Run the required validation.
8. Report the completed work.
9. Stop.

### Hard Rule

**Do not automatically begin the next phase or sub-phase.**

For example:

```text
Requested Phase
      ↓
Inspect
      ↓
Implement
      ↓
Test
      ↓
Validate
      ↓
Report
      ↓
STOP
```

Do not continue with:

```text
Next Phase
```

unless explicitly instructed.

Work assigned to a later phase may be acknowledged as future work, but must not be implemented preemptively.

---

## 7. Scope Control

Keep changes tightly related to the current task.

Do not perform unrelated:

- refactors;
- dependency upgrades;
- file reorganizations;
- naming migrations;
- architecture rewrites;
- UI redesigns;
- schema redesigns;

unless they are required to complete the requested task or explicitly requested.

When an unrelated problem is discovered:

- report it;
- explain whether it blocks the current task;
- do not automatically fix it if fixing it materially expands scope.

Avoid modifying already validated earlier-phase behavior unless necessary.

If earlier code must change, preserve its existing contracts where practical and explain the reason for the change.

---

## 8. Repository Areas

Use the existing repository structure rather than reorganizing it without a demonstrated need.

Current high-level responsibilities include:

```text
src/app
    Application bootstrap and app-level concerns

src/features
    Product-facing feature modules as they are introduced

src/core
    Reusable scientific and simulation computation

src/project
    Project defaults, schema, serialization, and migration as introduced

src/store
    Application state composition as introduced

src/types
    Stable cross-module application types

src/utils
    Genuinely shared utilities

tests/fixtures
    Reference and regression fixtures

tests/regression
    Product/demo behavior regression tests

reference
    Read-only legacy/demo reference material
```

Do not create files merely to populate currently empty or future-facing directories.

Introduce files when real implementation work requires them.

---

## 9. Testing Expectations

Tests are part of the implementation, especially for scientific core behavior.

For deterministic core logic:

- prefer deterministic automated tests;
- test public contracts and observable behavior;
- include meaningful edge cases;
- preserve regression behavior where applicable.

When changing existing core behavior, inspect relevant existing tests before modifying the implementation.

Do not weaken or remove tests simply to make a change pass unless the expected behavior has intentionally changed.

When expected behavior must change, explain why.

---

## 10. Validation

For normal code changes, run the relevant repository validation.

The default completion gate is:

```shell
npm run test
npm run lint
npm run build
```

For changes affecting interactive runtime behavior, also inspect the application through:

```shell
npm run dev
```

when practical and relevant.

Rules:

- Do not claim a command passed unless it was actually run.
- If validation fails, investigate failures related to the change.
- If a required validation cannot be run, clearly report that fact and the reason.
- Do not hide pre-existing failures; distinguish them from failures introduced by the current task.

---

## 11. Generated and Dependency Files

Do not manually edit generated or installed dependency contents such as:

```text
node_modules/
dist/
```

Modify source or configuration instead.

Do not modify `package-lock.json` unless a dependency operation legitimately changes it.

Do not add dependencies when existing project capabilities are sufficient.

When introducing a dependency is necessary, explain why it is needed for the current task.

---

## 12. Documentation Changes

Keep documentation responsibilities separated.

Do not duplicate large sections of `PRD.md` or `IMPLEMENTATION_PLAN.md` into other files.

Update documentation only where its responsibility requires an update.

Typical responsibility:

```text
Product requirement changed
    → PRD.md

Engineering plan / phase / architecture changed
    → IMPLEMENTATION_PLAN.md

Current repository status or setup changed
    → README.md

Agent working rules changed
    → AGENTS.md
```

If an implementation task completes a documented phase or changes the repository's current status, update `README.md` when appropriate.

Do not rewrite historical or authoritative requirements merely to make documentation match an accidental implementation.

---

## 13. Agent Execution Behavior

Before making substantial changes:

- inspect relevant files;
- understand existing contracts;
- check relevant tests;
- check the requested phase boundaries.

Prefer editing the existing architecture over introducing parallel implementations.

Do not create a second implementation of an existing subsystem merely because replacing it appears easier.

When uncertainty exists:

- derive what can be established from repository sources;
- avoid inventing missing requirements;
- surface important unresolved decisions instead of silently deciding them.

---

## 14. Subagents and Parallel Work

Permanent repository-specific subagent roles are not required by this project at this stage.

Subagents, parallel agents, or isolated worktrees may be used as execution techniques when a task is genuinely decomposable, but they must follow the same repository rules and phase boundaries.

Parallelization must not cause:

- duplicated implementations;
- conflicting architectural decisions;
- work from later phases to begin early;
- independent changes to the same contract without coordination.

The repository documents and current task remain the common source of truth regardless of how many agents participate.

---

## 15. Completion Report

At the end of an implementation task, provide a concise completion report containing:

### Scope completed

What was implemented for the requested phase/task.

### Files changed

List important files added, modified, or removed.

### Tests

Describe tests added or updated.

### Validation

Report the actual result of relevant commands, normally:

```text
npm run test
npm run lint
npm run build
```

### Architectural impact

State whether any architecture, schema, dependency, or public contract changed.

If none changed, say so.

### Remaining work

List known limitations or intentionally deferred work relevant to the current task.

### Phase boundary

Explicitly confirm whether work remained within the requested phase and that later-phase implementation was not started.

---

## 16. Guiding Principle

Rapid Optics Studio is a long-term scientific engineering application.

Optimize development for:

```text
Correctness
    +
Clear scientific contracts
    +
Deterministic behavior where appropriate
    +
Stable module boundaries
    +
Testability
    +
Incremental development
    +
Long-term maintainability
```

Prefer a small, understandable, validated implementation over a more elaborate architecture built for hypothetical future needs.