# Phase 8 — Diagnostics, Hardening and UI/UX Polish

Baseline: Phase 7, `aa4d46e95d61ee53056a86aed999f7654b1f6a06`. Status: Phase 8 complete. PRD §§49–51, 65–78 and 84 remain the acceptance authority. Phase 3–7 records retain their original scientific contracts.

| Stage | Scope and dependency | Exit evidence |
|---|---|---|
| 8A | Pure TypeScript rules over Raman contexts, CCD results and selected frozen acquisition metrics | Stable ordered diagnostics, unavailable values, multi-sample attribution and unit coverage |
| 8B | Render 8A results from derived store subscriptions. Keep historical run telemetry separate from live design | Telemetry, severity and selection-only localization through the Studio |
| 8C | Audit existing trace, cancellation, analysis, files and WebGL boundaries. Repair demonstrated gaps | Targeted failure recovery plus existing frozen-run, file and viewer regressions |
| 8D | Benchmark complex trace, spectrum, diagnostics, store and browser interaction | Median and p95, workload and environment, development versus production. Consider Worker only after measured main-thread contention |
| 8E | Inspect Phase 7 in installed Chrome before UI changes. Keep the bench central and give 3D, spectrum, acquisition, analysis and diagnostics explicit navigation. Preserve library and inspector access | Before/after screenshots and interaction checks at 1920×1080, 1440×900, 1366×768 and 390 px |
| 8F | Final-layout Playwright and offline production tests | A–J matrix, failure artifacts, no external runtime requests. Distinguish native file and hardware limitations |
| 8G | Run final test, lint, build, diff, E2E, Chrome and performance gates | §84 checklist and release decision. Advance the completion marker and push main only when critical gates pass |

## Diagnostics rules v1

Use each upstream Raman context's sample, source and ray lineage. Keep selected acquisition metrics attributed to their frozen context and run. Present unavailable values with reasons. Preserve scientific outputs and use the existing OD algorithm and availability rules. Live preview does not supply an acquisition SNR.

| Code | Trigger |
|---|---|
| OPT_PATH_001 ERROR | Context has no excitation path |
| OPT_PATH_002 ERROR | Excited context has no Raman return path |
| RAMAN_001 WARNING | Available model path OD below a configurable engineering default of 3 OD on a valid signal path |
| CCD_001 WARNING | Expected saturated bins or observed high clipping in the named preview or frozen run |
| FOCUS_001 WARNING | Valid focus lineage with efficiency below 0.5 |
| SNR_001 INFO | Available predicted peak-bin SNR below 3 on a valid frozen signal path |

The OD, focus and SNR thresholds are versioned engineering defaults. They indicate review priorities and do not define calibration or detection limits. Suppress return and quality warnings when the path lacks the data needed to interpret them. Saturation remains reportable from CCD evidence even when SNR is undefined.

## Baseline and evidence plan

Source inspection found a single vertical stack of bench, 3D, spectrum, acquisition and analysis, with editor controls in the header and separate project controls. Validate the resulting navigation and viewport issues in Chrome before modifying UI. Keep desktop sidebars and provide reachable panels on narrow screens. Use a shared surface, text, focus and status palette with visible keyboard states.

Use existing Phase 1 stress fixtures and a Raman fixture extended beyond 30 components with branching and at least 900 spectrum samples. Measure warm runs during continuous transforms, report trace, spectrum, diagnostics, store and rendering scope separately, and identify unmeasured work. Retain scientific regression assertions before any optimization. Targets are typical simulation update <100 ms and editor interaction 30–60 FPS.

E2E matrix: A default signal/Si and 3D, B mirror rotation and diagnostic, C defocus, D filter leakage, E independent branches, F 1 s ×20 acquisition in an unsaturated domain, G cancellation with design changes, H processing replay and raw preservation, I project round trip, J 2D/3D synchronization. Keep each result pending until executed on final code. Record native picker and GPU evidence separately.

## Current gate

Chrome baseline captured before UI edits in installed Google Chrome 157.0.8103.38 at 1440×900 and 390×844. The 1440 center stack had 647 px visible height and 1184 px scroll height. At 390 px it contained 2022 px of content. Desktop screenshots show browser-default project and export controls, a small bench view, and off-screen acquisition and analysis. The navigation and shared form palette address those issues directly.

8A initial full suite: 516 tests passed, lint passed. Type checking exposed branded fixture types, corrected before the successful production build. All final gates remain pending. Preserve the existing untracked Phase 3 regression file and exclude it from staging.

## Implementation record

- **8A–8B**. `src/core/diagnostics/diagnostics.ts` owns the deterministic rule output. The panel subscribes to existing derived contexts and the latest completed run. Focus and Path come from the live Raman lineage. OD calls the existing path-attenuation calculation through a context entry point shared with acquisition. Preview saturation uses expected bins and exposure clipping. SNR and historical clipping stay bound to the completed run that produced them. The footer gives live status across workspaces. Locate selects the current sample and returns to the bench without editing the scene.
- **8C**. The derived boundary captures trace exceptions, clears stale geometry from the render view and exposes the failure explicitly. The project replacement transaction rejects a failed trace before applying any state. The injected failure test covers editing, project rejection and Undo recovery. Existing acquisition cancellation, frozen snapshots, file validation and WebGL recovery retain their established owners. The browser suite exercises invalid open and a forced WebGL 2 failure. Zod was upgraded to 4.6.6 for oversized constrained collection validation. Production dependency audit reports zero findings after the upgrade. The development dependency audit has remaining findings.
- **8E**. Bench, 3D, Spectrum, Acquisition, Analysis and Diagnostics have distinct workspace buttons. The 2D bench uses the available central height, with Library and Inspector alongside at desktop sizes and anchor links in narrow layouts. Acquisition and analysis keep their local selections and form drafts while navigating. Opening 3D remains explicit and leaving its workspace disposes the viewer. Project name, dirty state and save actions remain visible. A disclosure groups I/O and settings. Shared controls and focus rings apply to project, charts and diagnostics. The browser download path still states that it produced a copy.

## Performance evidence

Environment: Windows, Intel Core i7-14650HX with 24 logical CPUs, Node 24.18.0, installed Google Chrome 157.0.8103.38. Browser tests use 1440×900, SVG 2D rendering and WebGL 2 with SwiftShader fallback enabled. Workloads import a serialized product configuration with 35 components and the 1400-bin Raman preview. The typical workload routes three oblique splitters and a reflection loop. The stress workload deliberately reaches the 256 processed-ray cap with eight splitters. Generated ray counts can exceed processed counts under the existing safety limit.

Reproduce with `npm run benchmark` for computation, `npm run test:e2e -- --grep performance` for production, and `$env:ROS_E2E_DEV='1'; npm run test:e2e -- --grep performance` in PowerShell for development. Run separately to reduce contention. The browser path imports the fixture, drags for 45 pointer updates with animation-frame pacing, rotates 12 times, opens the spectrum and creates/disposes 3D. Browser edit times include automation round trips and DOM settlement. Frame intervals are sampled across the gesture, including frames without a new input.

| Node workload | Generated rays | Trace median / p95 ms | Raman + CCD median / p95 ms | Diagnostics median / p95 ms | Store update median / p95 ms |
|---|---:|---:|---:|---:|---:|
| Typical | 65 | 5.96 / 8.07 | 31.44 / 38.62 | 0.034 / 0.123 | 40.35 / 47.84 |
| Stress | 461 | 25.84 / 33.41 | 33.37 / 38.76 | 0.029 / 0.053 | 59.25 / 75.40 |

Thirty measured iterations follow six warm-ups, alternating mirror position and angle. The benchmark compares expected CCD arrays from segmented calculation and the Store for each edit. Raman/CCD dominates typical computation, and trace becomes comparable at the branching cap. Diagnostic overhead is small. No Worker was introduced. The typical computation is below 100 ms and the release decision also requires representative production browser evidence.

| Chrome development | Segments | Frame samples | Frame median / p95 ms | Mean frames/s | Rotation to DOM median / p95 ms | Import / Spectrum / 3D open ms |
|---|---:|---:|---:|---:|---:|---:|
| Typical | 64 | 354 | 5.6 / 55.6 | 84.4 | 115.2 / 201.3 | 338 / 127 / 1095 |
| Stress | 256 | 432 | 5.6 / 83.3 | 63.1 | 133.3 / 276.6 | 478 / 103 / 1252 |

High-refresh frame rates above 60 do not represent the rate of scientific recomputations. Development tails are visibly slower than median frames. No physical GPU claim is made from the software-compatible Chrome run.

## Browser evidence and exit review

Before and after captures are local in `artifacts/phase8/`. The initial captures are `before-1440.png` and `before-390.png`. The responsive tests write `after-{1920,1440,1366,390}-bench.png` and matching diagnostics screenshots. The default scenario also records the spectrum and 3D workspaces. Playwright retains traces and screenshots on failure. The first E test used the wrong sign for world Y. The corrected negative Y placement intersects the incoming laser. H/I compare the actual serialized completed acquisition records.

Native picker permissions and GPU-specific behavior remain manual evidence boundaries. For a native round trip, run the final build on localhost, Save As to a disposable JSON file, edit an optical parameter, use Save and verify the linked filename, then Open the file in a new browser context. Cancel each picker once and verify the current project remains. For hardware recovery, open 3D in normal Chrome, disable graphics support or exercise a context loss, then return to Bench and Acquisition. Automated Chrome covers the shipped compatibility download/file chooser, injected WebGL unavailability and SVG/PNG/CSV export separately.

| Chrome production | Segments | Frame samples | Frame median / p95 ms | Mean frames/s | Rotation to DOM median / p95 ms | Import / Spectrum / 3D open ms |
|---|---:|---:|---:|---:|---:|---:|
| Typical | 64 | 401 | 5.6 / 22.4 | 123.6 | 69.6 / 256.7 | 508 / 107 / 647 |
| Stress | 256 | 463 | 5.6 / 44.4 | 92.2 | 85.8 / 101.2 | 196 / 132 / 707 |

The typical workload meets the simulation update target and stays within a 33.3 ms frame interval at p95 in this production run. Input-to-DOM tails and pathological branching remain slower. The evidence supports retaining the synchronous pipeline for V1. The 3D chunk remains lazy loaded and produces a Vite size advisory. Measurements apply to this host and workload.

| PRD scenario | Result | Final product path and regression evidence |
|---|---|---|
| A | PASS | 532 nm Si default, valid Raman path, expected peak near 520.7 cm⁻¹, 3D and offline assets |
| B | PASS | Rotate mirror, see NO PATH and OPT_PATH_001, locate Sample, undo to SIGNAL |
| C | PASS | Axial Sample motion, FOCUS_001, expected peak counts and model SNR both decrease |
| D | PASS | Filter rotation changes modeled OD, increases spectral background and changes SNR, RAMAN_001 |
| E | PASS | Add and align splitter through the UI, observe additional rays, verify independent branches in tracing regressions |
| F | PASS | 1 s ×20 at 0.1 mW, completed retained frames, available predicted SNR, acquisition contract regressions |
| G | PASS | Change mirror during a run, cancellation and reason in browser, mixed-state prevention in runtime tests |
| H | PASS | Add all three pipeline steps, toggle and reset, compare the original and exported completed runs |
| I | PASS | Export, reopen using the compatibility file chooser, restore analysis and the completed Run. Invalid file preserves workspace. Project I/O tests cover design, metadata and file integrity |
| J | PASS | Edit mirror and Sample in Bench, open WebGL 2, inspect labels and focus, close and return to current 2D design. Geometry and synchronization regressions verify derived transforms |

### PRD §84 release checklist

| Requirement | Result and evidence |
|---|---|
| Formal Project | PASS · project creation and schema/round-trip tests |
| Basic 2D editing | PASS · Bench editing, gestures, selection, history and inspector suites |
| Ten component types | PASS · definitions, renderer and scene regressions |
| Real-time simplified trace | PASS · B and typical benchmark |
| Branching | PASS · E and bounded stress/lineage tests |
| Raman simulation | PASS · A–D and optical coupling/material regressions |
| Virtual CCD | PASS · expected and seeded preview, saturation and detector tests |
| Deterministic expected spectrum | PASS · spectrum synthesis and repeated benchmark equality |
| Simulated acquisition | PASS · F and runtime tests |
| Frozen acquisition snapshot | PASS · F/G and acquisition contract tests |
| Raman spectrum analysis | PASS · H, pipeline and peak/FWHM tests |
| Deterministic diagnostics | PASS · 8A tests and B–D browser evidence |
| Synchronized 3D Viewer | PASS · J, WebGL fault isolation and presentation tests |
| Project Save / Load | PASS · I and project tests |
| JSON / CSV / PNG / SVG | PASS · JSON project and spectrum export, Chrome CSV/PNG/SVG download assertions |
| Undo / Redo | PASS · B and history/clipboard tests |
| Demo regressions | PASS · default layout, focus, spectral PS coverage and branching |
| No external CDN dependency | PASS · production Chrome aborts external requests and opens the lazy 3D panel |
| Modular core | PASS · optical, Raman, CCD, diagnostics, state and UI remain separate |

8A–8G complete. Final engineering commands are `npm run test`, `npm run lint`, `npm run build`, `git diff --check`, `npm run benchmark` and `npm run test:e2e`. The performance suite is run separately to avoid competing with the acquisition resource test. Four Vitest workers bound contention. The final Chrome suite has 18 cases, including four responsive views and two performance workloads. Nonblocking limits include native picker/physical GPU retest coverage, overlapping component labels when zoomed out on narrow screens, pathological branching latency, and development-only audit findings. V1 remains a simplified, first-order, semi-quantitative engineering model.

Final release-marker run on 2026-11-09: Vitest **517 passed**, lint and production build passed, diff check passed, benchmark **2 passed**, production Chrome Playwright **18 passed**, development Chrome performance **2 passed** in the preceding run. Production offline routing detected zero external requests. The local Vitest count includes the pre-existing untracked Phase 3 file, which remains outside the release commit. Logs are saved locally as `artifacts/phase8/release-test.log`, `release-benchmark.log` and `release-e2e.log` in the same directory.
