# Rapid Optics Studio V1 — Phase 3 Execution Plan

> **Phase:** 3 — Raman + Virtual CCD  
> **Status:** Completed
> **Completed:** 2026-11-08
> **Depends on:** Phase 2E — Editor Completion & Integration Hardening  
> **Phase 2 baseline:** Phase 2 Exit Gate satisfied  
> **Document role:** Phase 3 execution contract. `PRD.md` remains the product requirements authority; `IMPLEMENTATION_PLAN.md` remains the V1 high-level engineering roadmap.

---

## 0. Purpose

Phase 3 reconstructs the scientific signal path on top of the completed Phase 1 Optical Core and Phase 2 2D Studio.

The target pipeline is:

```text
Optical Scene
    ↓
Phase 1 Optical Trace
    ↓
Excitation reaches Sample
    ↓
Excitation Power + Focus Context
    ↓
Raman / Fluorescence / Rayleigh Model
    ↓
Optical Return / Spectrometer Throughput
    ↓
Deterministic Expected Spectrum
    ↓
Virtual CCD
    ↓
Seeded Noisy Preview
    ↓
Studio Spectrum Preview
```

Phase 3 must restore and formalize the Raman behavior already demonstrated by the reference Raman Sandbox while removing known prototype limitations and preserving the architectural boundaries established in Phases 1 and 2.

Phase 3 is **not** a precision spectroscopy engine. Models remain explicitly **Simplified / First-order / Semi-quantitative** where applicable.

---

# 1. Phase 3 Global Boundaries

## 1.1 Must Preserve

Phase 3 must preserve these established rules:

- `src/core/optics` remains generic optical infrastructure.
- Raman-specific physics must not be embedded into React components.
- Raman-specific physics must not turn the Optical Core into a Raman-only core.
- 2D scene state remains the authoritative design state.
- Spectrum and CCD results are derived simulation outputs.
- Phase 1 tracing contracts and Phase 2 editor behavior remain regression protected.
- Real-time simulation remains browser-side pure TypeScript for V1 unless performance evidence later justifies Worker migration.
- No new backend, database, server, monorepo, or workspace architecture is introduced in Phase 3.

## 1.2 Phase 3 Non-goals

The following are explicitly out of scope for Phase 3:

- Acquisition state machine.
- Average-N acquisition.
- `AcquisitionRun` history.
- Immutable acquisition snapshots.
- Raw / processed acquisition workflows.
- Baseline correction.
- Smoothing.
- Normalization.
- Peak detection.
- FWHM analysis UI.
- Spectrum processing history.
- 3D visualization.
- Project Save / Open / Save As.
- General Project I/O infrastructure.
- CSV file import infrastructure.
- Diagnostics rule engine beyond minimal Phase 3 status needed to expose signal state.
- Major visual redesign of the application.

These remain assigned to later V1 phases.

---

# 2. Phase 3 Architecture

Recommended source boundary:

```text
src/core/
├── optics/                  # existing Phase 1 generic optical core
├── raman/                   # Phase 3 Raman domain + deterministic Raman math
├── acquisition/             # Phase 3 only contains minimal Virtual CCD primitives;
│                            # Phase 4 owns acquisition state machine / runs
└── ...
```

The exact file breakdown may evolve during implementation, but the module responsibility must remain stable:

```text
Optical Core
    ↓ TraceResult / lineage / power / focus metadata
Raman Core
    ↓ Deterministic spectral signal
Virtual CCD Core
    ↓ Expected detector counts + seeded preview exposure
Studio Integration
    ↓ Derived UI state
```

Phase 3 should prefer explicit immutable data contracts over anonymous `number[]` values where the semantic distinction matters.

---

# 3. Phase 3A — Raman Domain Model & Material Foundation

## 3A.1 Goal

Create the Raman domain boundary and the minimum stable data contracts required by later Phase 3 work.

This phase establishes data and validation only. It does **not** yet implement full Raman spectrum calculation, CCD simulation, or production UI.

## 3A.2 Required Outputs

Create a dedicated Raman core module, conceptually including contracts such as:

```text
RamanMaterial
RamanPeak
Material Registry / Resolver
SpectrumAxis
ExpectedSpectrum contract foundation
Raman model configuration
```

Names may be adjusted during implementation if a clearer internal API emerges, but the domain separation must remain.

Each Raman material must at minimum support:

```text
Material ID
Material Name
Fluorescence Level
Raman Peaks[]
    Shift (cm⁻¹)
    Relative Intensity
    Width / FWHM (cm⁻¹)
```

Built-in material data must formally include the three reference materials already used by the Raman Sandbox:

- Silicon
- Polystyrene
- Calcite

Existing `Sample.parameters.material_id` must resolve cleanly against the Raman material registry without forcing Raman material data into the generic Optical Scene schema.

## 3A.3 Validation Rules

At minimum:

- IDs must be stable and valid.
- Peak shifts must be finite.
- Relative intensity must be finite and non-negative.
- Width / FWHM must be finite and positive.
- Fluorescence level must be finite and non-negative.
- Material definitions must reject malformed data rather than silently normalizing invalid values.

## 3A.4 Explicit Non-goals

Do not implement in 3A:

- Focus efficiency physics.
- Raman line-shape synthesis.
- Rayleigh profile calculation.
- Fluorescence spectrum generation.
- CCD QE.
- Detector noise.
- Spectrum chart UI.
- CSV file reading.

## 3A.5 Exit Gate — Phase 3A

Phase 3A is complete only when:

- all three built-in materials validate successfully;
- built-in Raman peak data is regression covered;
- invalid material / peak data is rejected deterministically;
- `Sample.material_id` resolves to the intended built-in material;
- Raman domain code remains independent from React;
- Phase 1 Optical Core regression tests still pass unchanged;
- Phase 2 Studio regression tests still pass unchanged;
- `npm run test`, `npm run lint`, and `npm run build` all pass.

---

# 4. Phase 3B — Deterministic Raman Spectrum Math

## 3B.1 Goal

Build the pure deterministic spectral mathematics independently from scene tracing and CCD noise.

This isolates the scientific signal model before it is coupled to optical geometry.

## 3B.2 Required Inputs

The math layer should be testable from explicit inputs such as:

```text
RamanMaterial
Laser wavelength
SpectrumAxis
Signal scale / excitation scale
Spectral broadening configuration
```

## 3B.3 Required Capabilities

Implement deterministic utilities / models for:

- Raman shift ↔ wavelength conversion;
- Lorentzian Raman peak profile;
- intrinsic peak width and configured spectral broadening;
- wavelength-dependent Raman scaling consistent with the current simplified V1 model;
- fluorescence background;
- Rayleigh spectral contribution / leakage profile;
- construction of a deterministic expected spectral signal.

All empirical constants inherited from the reference Demo must be explicit, named, documented, and versionable rather than hidden inside UI code.

## 3B.4 Spectrum Axis

Phase 3B must introduce an explicit spectrum-axis contract.

Raman shift remains the default display / scientific axis unit:

```text
cm⁻¹
```

The old fixed Demo window must not be reintroduced as an unconditional limitation.

Support at least:

```text
Auto / dynamic Raman window
Explicit custom Raman window
```

The default behavior must include all relevant built-in material peaks, including the high-shift Polystyrene peaks that the original Demo main window could omit.

## 3B.5 Determinism

For identical inputs, Phase 3B must always produce identical output.

No random number generation belongs in this phase.

## 3B.6 Exit Gate — Phase 3B

Phase 3B is complete only when automated tests verify:

- Raman shift → wavelength conversion;
- wavelength → Raman shift conversion where mathematically valid;
- conversion round-trip within a documented tolerance;
- Silicon, Polystyrene, and Calcite peaks appear at the expected Raman shifts;
- changing laser wavelength changes wavelength mapping without changing the material's Raman-shift identity;
- fluorescence forms a continuous background according to the simplified model;
- Rayleigh contribution is located correctly relative to the excitation line;
- high-shift Polystyrene peaks are not lost by the default spectrum axis;
- output contains no unexpected `NaN`, `Infinity`, or invalid negative values;
- repeated identical inputs return identical expected spectra;
- all project tests, lint, and build pass.

---

# 5. Phase 3C — Optical Trace → Focus → Raman Coupling

## 3C.1 Goal

Connect the completed Phase 1 Optical Trace to the new Raman domain without weakening the generic Optical Core boundary.

The intended flow is:

```text
Laser excitation
    ↓
Optical Trace
    ↓
Excitation reaches Sample?
    ↓
Power at Sample
    ↓
Objective / Sample lineage context
    ↓
Focus efficiency
    ↓
Effective Raman excitation
```

## 3C.2 Trace Usage

Phase 3C must consume the existing trace records, interaction events, ray lineage, power accounting, and focus metadata.

It must **not** fall back to prototype shortcuts such as:

```text
find the first Objective in the Scene
```

When multiple Objectives or Samples exist, the Raman calculation must use the actual traced optical lineage / interaction context.

## 3C.3 Focus Model

The reference Demo used a simplified focus-efficiency relationship of the form:

```text
η = 1 / (1 + (dz / zR)^2)
```

Phase 3 may preserve the simplified functional behavior, but all quantities must use explicit physical units and named parameters.

The old Demo behavior where `zR` was effectively expressed in canvas pixels must not be retained.

The focus model must be labeled as simplified / first-order and must not imply full Gaussian-beam propagation.

## 3C.4 Raman Optical Context

Phase 3C should produce a stable intermediate context for downstream spectral calculation, conceptually including:

```text
Sample identity
Material identity
Excitation power at Sample
Objective identity / focus lineage
Defocus
Focus efficiency
Effective excitation power
Return-path optical throughput / detected Raman path state
Rayleigh leakage path state
```

The exact type name may differ, but the semantic boundary should exist so that Phase 3B spectral math does not need to understand the entire Optical Scene.

## 3C.5 Broken-path Semantics

The coupling layer must distinguish at least:

```text
No excitation path to Sample
Excitation reaches Sample but no valid return path
Valid signal path
```

A broken excitation path must yield zero Raman generation.

A broken return path must yield zero detector Raman signal even if the Sample is excited.

## 3C.6 Exit Gate — Phase 3C

Automated regression must verify:

- the default Raman scene produces non-zero excitation at Sample;
- the default Raman scene produces non-zero effective Raman excitation;
- correct focus produces maximal or near-maximal simplified focus efficiency;
- moving Objective or Sample away from focus reduces efficiency continuously;
- breaking the excitation path makes Raman generation zero;
- restoring the excitation path restores Raman generation;
- breaking the return path makes detected Raman signal zero;
- restoring the return path restores detector signal;
- filter / dichroic changes correctly influence return-path power / Rayleigh leakage according to current simplified contracts;
- multiple-Objective fixtures do not incorrectly use an unrelated first Objective;
- Phase 1 trace regression still passes;
- Phase 2 editor regression still passes;
- tests, lint, and build pass.

---

# 6. Phase 3D — Virtual Spectrometer + Deterministic CCD

## 3D.1 Goal

Convert the deterministic Raman-domain signal into deterministic expected detector counts.

No stochastic noise is introduced yet.

## 3D.2 Signal Pipeline

The deterministic signal chain should conceptually follow:

```text
Raman Peaks
+
Fluorescence
+
Rayleigh Leakage
    ↓
Return-path optical throughput
    ↓
Spectrometer throughput / broadening
    ↓
Detector QE model
    ↓
Integration time
    ↓
Gain / detector response
    ↓
Dark-current expectation
    ↓
Full-well clipping / saturation model
    ↓
Expected CCD Spectrum
```

## 3D.3 Required Virtual CCD Parameters

At minimum the model must explicitly support the V1 parameters required by the PRD:

```text
Gain
QE Model
Full Well
Read Noise
Dark Current
Integration Time
```

Read noise belongs to the detector contract here but is applied stochastically in Phase 3E.

Existing Spectrometer parameters such as optical throughput must participate in the deterministic signal chain.

## 3D.4 Expected Spectrum Semantics

The expected detector result must be a distinct semantic entity.

It must not be represented in a way that can later be confused with:

```text
Raw acquired spectrum
Processed spectrum
Averaged acquisition
```

The Phase 3 expected spectrum is deterministic derived simulation output.

## 3D.5 Exit Gate — Phase 3D

Automated tests must verify:

- Raman-domain signal converts to expected CCD counts;
- increasing integration time increases expected counts according to the model;
- decreasing optical throughput decreases expected counts;
- QE changes produce wavelength-dependent detector response;
- gain changes detector output according to the chosen V1 convention;
- dark current contributes deterministically to expected detector signal;
- full-well behavior is explicit and saturation / clipping is deterministic;
- expected spectrum is finite and structurally valid;
- expected spectrum remains deterministic;
- expected spectrum is not mutated by downstream code;
- tests, lint, and build pass.

---

# 7. Phase 3E — Seeded Virtual CCD Noise & Preview Exposure

## 3E.1 Goal

Add stochastic detector behavior while preserving deterministic regression testing.

## 3E.2 Required Noise Sources

Implement the V1 detector noise behavior required by the current signal model, including:

- shot noise;
- read noise;
- dark-current noise where applicable to the chosen simplified implementation.

The existing reference Demo noise behavior may be used as behavioral guidance, but constants and approximations must be explicit.

## 3E.3 RNG Policy

The scientific core must not directly depend on uninjectable global randomness for regression behavior.

Tests must be able to provide a seeded / deterministic RNG.

Conceptually:

```text
Expected CCD Spectrum
        +
Injected RNG / Seed
        ↓
Simulated CCD Exposure
```

Production UI may use a non-fixed seed source, but the core API must remain testable.

## 3E.4 Phase Boundary with Acquisition

Phase 3E provides only the primitive required to generate a simulated CCD preview / single exposure.

It must **not** implement:

- Acquire / Stop state machine;
- Average N;
- acquisition run persistence;
- snapshot history;
- automatic completion;
- run metadata;
- acquisition export.

Those belong to Phase 4.

## 3E.5 Exit Gate — Phase 3E

Automated tests must verify:

- same input + same seed produces the same noisy exposure;
- same input + different seed produces a different realization;
- noise statistics are reasonable for the documented simplified detector model;
- zero / near-zero signals remain numerically stable;
- saturated signals remain within valid detector bounds;
- impossible negative detector counts are not emitted after the final detector convention is applied;
- expected spectrum remains unchanged by exposure generation;
- no tests rely on uncontrolled `Math.random()` behavior;
- tests, lint, and build pass.

---

# 8. Phase 3F — Studio Integration & Spectrum Preview UI

## 3F.1 Goal

Integrate the Phase 3 scientific pipeline into the existing React / Zustand application as derived simulation state.

The user should be able to see signal consequences of optical and simulation parameter changes in real time.

## 3F.2 Derived Simulation Pipeline

Extend the current real-time derived flow from:

```text
Scene
  ↓
Trace
```

into:

```text
Scene
  ↓
Trace
  ↓
Raman Optical Context
  ↓
Expected Spectrum
  ↓
Virtual CCD Preview Exposure
```

These outputs must remain derived state and must not become part of editor selection / clipboard / lock / view state.

## 3F.3 Minimum Spectrum UI

Phase 3 requires a functional, engineering-oriented preview UI, not final visual polish.

The UI should expose enough information to verify the pipeline, including at minimum:

```text
Expected Spectrum
CCD Preview Spectrum
Selected Material
Laser wavelength
Integration time
Gain
Basic CCD configuration
Focus efficiency / focus state
Signal / detected power state
Saturation state
Simplified / First-order model label
```

The exact layout may evolve, but the scientific state must be inspectable.

## 3F.4 Real-time Behavior

The following actions should update the relevant derived signal without a separate “Run Simulation” button:

- moving / rotating optical components;
- changing relevant optical parameters;
- changing Sample material;
- changing laser wavelength;
- changing integration time;
- changing detector / spectrometer parameters.

## 3F.5 Material Editing Decision for Phase 3

Phase 3 should support:

- built-in material selection;
- the data contract required for custom materials;
- a minimal manual custom-material editor if practical within the existing UI architecture.

Phase 3 does **not** need to implement CSV file import plumbing.

CSV-based material import is deferred to the formal Project / I/O phase, where import validation and transaction semantics can be handled consistently.

This is an execution-plan decision intended to prevent Phase 3 from prematurely introducing general file-I/O architecture.

## 3F.6 Explicit Non-goals

Do not begin Phase 5 spectrum-analysis features here:

- no baseline correction;
- no smoothing;
- no normalization;
- no peak detection;
- no FWHM measurement workflow;
- no processing pipeline history.

## 3F.7 Exit Gate — Phase 3F

Manual and automated integration checks must demonstrate:

```text
Move optical component
→ Trace changes
→ Raman signal changes
→ Spectrum changes

Change Sample material
→ Raman peak pattern changes

Change laser wavelength
→ wavelength response / detector response changes

Change integration time
→ expected CCD counts change
```

Also verify:

- broken excitation path is reflected in the spectrum state;
- broken return path is reflected in the detector signal state;
- Spectrum preview does not create authoritative duplicate project state;
- Phase 2 editor operations remain responsive and correct;
- tests, lint, and build pass.

---

# 9. Phase 3G — Demo Regression & Integration Hardening

## 3G.1 Goal

Close Phase 3 with regression coverage, numerical hardening, state-boundary checks, documentation, and real-browser validation.

Phase 3G should not introduce a new major feature family.

## 3G.2 Required Regression Coverage

At minimum cover:

### Built-in Materials

- Silicon
- Polystyrene
- Calcite

### Excitation Wavelengths

- 532 nm
- 633 nm
- 785 nm

### Optical / Focus Cases

- default valid Raman path;
- excitation path broken;
- return path broken;
- correct focus;
- controlled defocus;
- filter / dichroic leakage change;
- multi-objective lineage safety where relevant.

### Spectral / CCD Cases

- deterministic expected spectrum;
- dynamic spectrum axis;
- Polystyrene high-shift peaks retained;
- fluorescence background;
- Rayleigh leakage;
- QE response;
- integration-time response;
- dark current;
- full-well saturation;
- seeded CCD noise reproducibility.

### Architecture / State Boundaries

Verify:

- Raman data does not pollute generic Optical Core contracts unnecessarily;
- CCD preview does not mutate the expected spectrum;
- derived spectrum state is not inserted into editor design history;
- editor-only lock state remains outside optical physics;
- Phase 1 core fixtures remain valid;
- Phase 2 editor history / selection / gesture behavior remains valid.

## 3G.3 Browser Validation

Perform real-browser validation of the completed Phase 3 pipeline.

At minimum manually verify:

- default Raman layout loads and displays valid trace + spectrum;
- material switching visibly changes Raman peaks;
- moving a critical optical component can break and restore the signal path;
- Objective / Sample defocus changes signal strength;
- integration time visibly changes CCD counts;
- noisy preview updates according to the intended preview behavior;
- saturation state is visible when intentionally triggered;
- zoom / pan / select / move / lock / undo / redo from Phase 2 still function;
- browser console has no unexpected warnings or errors.

### Phase 3G browser acceptance record

Real-browser acceptance was completed in Microsoft Edge on 2026-11-08. The
default Raman layout and spectrum rendered correctly; material, optical-path,
focus, integration-time, preview, and saturation changes updated as expected;
Phase 2 zoom, pan, selection, movement, locking, undo, and redo interactions
remained operational; and the browser console contained no unexpected errors or
warnings.

## 3G.4 Documentation

At Phase 3 completion:

- update root `README.md` status;
- update the application `CURRENT_PHASE` marker;
- mark this document Phase 3 status as Completed;
- document any model approximations that materially affect interpretation;
- record deferred work rather than silently implementing later phases.

## 3G.5 Exit Gate — Phase 3 / Phase 3G

Phase 3 is complete only when the following end-to-end chain works:

```text
Default Raman Layout
        ↓
Valid excitation path
        ↓
Focus-dependent Raman excitation
        ↓
Raman + fluorescence + Rayleigh signal
        ↓
Spectrometer / detector response
        ↓
Deterministic expected spectrum
        ↓
Seeded noisy CCD preview
        ↓
Real-time Studio display
```

And all of the following are true:

- core Raman Sandbox behavior has been restored in modular production code;
- inherited empirical constants are explicit rather than hidden in UI code;
- major approximations are labeled Simplified / First-order;
- the known Polystyrene high Raman-shift window issue is fixed;
- Phase 1 Optical Core regressions pass;
- Phase 2 Studio regressions pass;
- no Phase 4 acquisition state machine has been started;
- no Phase 5 spectrum analysis has been started;
- no Phase 6 3D implementation has been started;
- no Phase 7 general Project I/O implementation has been started;
- `npm run test` passes;
- `npm run lint` passes;
- `npm run build` passes;
- real-browser acceptance passes.

This satisfies the V1 high-level Phase 3 exit objective:

> Restore the core Raman behavior of the reference Demo in a parameterized, modular Raman + Virtual CCD pipeline.

---

# 10. Execution Order

Phase 3 must proceed in this order unless a documented blocker requires a deliberate revision:

```text
Phase 3A
Raman Domain Model + Materials
        ↓
Phase 3B
Deterministic Raman Spectrum Math
        ↓
Phase 3C
Optical Trace + Focus + Raman Coupling
        ↓
Phase 3D
Virtual Spectrometer + Deterministic CCD
        ↓
Phase 3E
Seeded CCD Noise + Preview Exposure
        ↓
Phase 3F
Studio / Spectrum UI Integration
        ↓
Phase 3G
Regression + Integration Hardening
        ↓
PHASE 3 EXIT GATE
```

Do not automatically continue into the next sub-phase after completing an exit gate. Each sub-phase should stop for review before the next implementation step begins.

---

# 11. Development Rules for Phase 3

1. **Minimal schema first.**  
   Add only the contracts required by the current sub-phase. Do not prematurely design the complete future Project or Acquisition schema.

2. **Pure scientific core.**  
   Raman / CCD math must remain testable outside React and Zustand.

3. **No hidden constants.**  
   Demo-derived constants must be named, documented, and test-covered.

4. **Explicit units.**  
   Do not reintroduce canvas-pixel-as-physics behavior.

5. **Deterministic before stochastic.**  
   Expected signal must be validated before noise is introduced.

6. **Injected randomness.**  
   Noise must support seeded deterministic testing.

7. **Trace lineage over scene shortcuts.**  
   Use actual optical interaction lineage for Objective / Sample / return-path relationships.

8. **Derived state stays derived.**  
   Spectrum and CCD preview are simulation outputs, not authoritative editor state.

9. **Respect phase boundaries.**  
   Do not use Phase 3 as an excuse to begin Acquisition, Spectrum Analysis, 3D, Project I/O, or major visual redesign.

10. **Regression at every sub-phase.**  
    Existing Phase 1 and Phase 2 tests must remain green throughout Phase 3.

---

# 12. Deferred Items Recorded by Phase 3

The following are intentionally deferred:

```text
Phase 4
- Acquisition state machine
- Single / Average N workflow
- AcquisitionRun
- immutable instrument snapshot
- scene-change cancellation behavior

Phase 5
- spectrum zoom / pan / cursor refinement
- baseline correction
- smoothing
- normalization
- peak detection
- FWHM analysis
- processing replay

Phase 6
- synchronized Three.js 3D view

Phase 7
- Project save / open
- structured import / export
- CSV material import plumbing
- JSON / CSV / PNG / SVG export

Phase 8
- full deterministic diagnostics rules
- E2E / release hardening
- broader performance / resilience work

V1 UI/UX Consolidation
- major visual polish and professional workspace styling should occur after the main V1 workspaces are substantially present, rather than during early Phase 3 implementation.
```

---

# 13. Phase 3 Review Checklist

Before approving any Phase 3 sub-phase, verify:

```text
[ ] Scope matches only the current sub-phase
[ ] No unrelated later-phase feature was introduced
[ ] New scientific assumptions are explicit
[ ] Units are explicit
[ ] Core logic is outside React
[ ] Existing Optical Core tests pass
[ ] Existing Studio tests pass
[ ] New regression coverage exists
[ ] npm run test passes
[ ] npm run lint passes
[ ] npm run build passes
[ ] README / phase status is updated only when appropriate
[ ] Work stops at the requested exit gate
```

---

# 14. Document Maintenance Policy

This file is a Phase-specific execution plan.

During Phase 3:

- update it only when an architectural or scope decision materially changes;
- do not duplicate the full PRD into this document;
- do not silently override `PRD.md` requirements;
- if this plan and the PRD appear to conflict, review the conflict explicitly before implementation.

After Phase 3 completion:

- set `Status: Completed`;
- keep the document in the repository as engineering history;
- do not continue expanding it with Phase 4 implementation details.

