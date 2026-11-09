# Phase 6 — 3D Presentation

Baseline 373944c. Full Phase 6 is authorized for continuous implementation with one submission gate at 6F. PRD §§52–54, 77–78 define acceptance.

| Batch | Deliverable | Targeted evidence |
| --- | --- | --- |
| 6A | Pure presentation mapping from current Scene, Trace and Raman contexts | Coordinate, rotation, board extent, input immutability |
| 6B | Three.js board, holes, optical bodies, posts, holders and labels | Exhaustive geometry registry, aperture and resource tests |
| 6C | Trace segments, modeled return channels, focus and sample markers | Default, broken, split and no-return paths, exact segment endpoints |
| 6D | OrbitControls, fitted presets, display controls and responsive sizing | Camera tests and browser interaction |
| 6E | Lazy side-by-side Studio presentation, error recovery, reconciliation and teardown | Resource disposal, stable identities, UI/science isolation |
| 6F | Consolidated engineering and browser exit gate | Scenario J, acceptance matrix and status updates |

## Implementation contract

- Three.js lives under the presentation feature. The 2D Cartesian point (x, y) maps to (x, height, -y) in Three.js, in mm. Positive 2D rotation becomes positive Y-axis yaw. Local X is the surface tangent or laser emission axis. Local -Z is the oriented surface normal. Board origin is its upper-left corner, and its top is at elevation 0.
- Use the existing visualization height, depth, post and holder fields. Optical aperture is full width/diameter. Hardware thickness, material and mounts are illustrative. Hole centers follow the 2D grid. Bound hole instance counts on pathological grids, preserving pitch alignment.
- Trace XY endpoints and ray identity are authoritative. Display elevation is interpolated between interaction heights. Escape segments retain the starting height. Excitation color follows wavelength. Return geometry is the core sample-return probe. Raman and Rayleigh share that geometry wherever the context models those channels. Distinguish the shared path with a dashed Rayleigh overlay and report model status separately. Use sample interaction and objective lineage for the spot and schematic cone. Display widths are illustrative.
- Use keyed presentation resources for boards, components, labels, segments and focus objects. Transform, selection and name updates reuse optical bodies. Each entry owns its GPU resources. Reconcile only current inputs. Render on demand with bounded pixel ratio and dispose resources, observers, controls and pending frames on teardown.
- Keep the authoritative 2D editor visible when the optional 3D panel opens. Keep camera and visibility local. Isolate lazy loading and render failures. Show a retry action and recover restored contexts. No Store write is needed for 3D.
- Default framing uses physical board and hardware bounds. Pan and zoom limits scale with the scene. Small viewports use wrapping controls. Main performance risks are dense hole grids, long traces, and high-DPI fill. Validate the default scene and repeated mounting without claiming unmeasured GPU metrics.

## Exit gate

- Run targeted presentation and affected optical/store tests during development.
- Run npm test, lint, build and git diff --check on the final submission.
- Use a real browser for Scenario J and the requested coverage of geometry, trace states, cameras, toggles, lifecycle, WebGL failure, narrow layouts and acquisition/analysis isolation.
- Record evidence and limitations here. Update stage/status and submit only after the gate is satisfied. Preserve the pre-existing untracked phase3PipelineRegression test and keep Git history non-destructive.

## Implementation and acceptance record

6A through 6F completed. Implementation is isolated in `src/features/presentation`, with the optional viewer mounted by Studio. Added `@types/three` for TypeScript support of the existing Three.js npm runtime. HTML labels use projected mesh anchors and own no GPU resources. Meshes, instanced hole markers and path entries own their geometries and materials. Changed entries release their resources, pose and name changes preserve the body, and closing the viewer releases its WebGL context.

### Chrome Scenario J and supplemental checks

Chrome 157 on Windows, real Chromium WebGL 2 using SwiftShader, driven via DevTools Protocol against Vite. Desktop viewport 1600 × 1120.

- Opened the 2D bench and 3D Viewer. Selected and dragged Mirror in the 2D bench. Checked the changed world position, projected 3D label, rendered frame, Trace endpoints and transition to no excitation.
- Rotated Mirror through the 2D Inspector. The 3D frame changed. Undo restored the prior moved frame exactly by screenshot SHA-256, then restored the default pose, Trace, sample spot and focus. Redo restored the rotated frame exactly. Renaming Mirror changed the 3D label while preserving the Trace endpoints.
- Rendered the seven default types and added Prism, Beam Splitter and Pinhole from the library. Checked all ten visible labels, plus duplicate, delete and Undo. Rendered a 360 × 240 mm off-origin board with a 20 mm grid and branching trace. Disabled Spectrometer and checked no return signal with an excited sample.
- Exercised orbit and pan with pointer drags, zoom with wheel, Top, Front, Isometric and Reset. Checked changes for Beam, Cone and Label. At 390 px width, controls wrapped and fit. Checked the backing buffer DPR cap with emulated DPR 3.
- Ran a legal 0.1 mW 20-exposure acquisition while using camera and display controls. The active input object stayed identical and the run completed without cancellation. Applied analysis smoothing, changed 3D controls again, and checked the completed run identity and analysis DOM.
- Instrumented WebGL draw calls. Idle and offscreen camera changes added no draws, and visibility restored rendering. Tested real context loss and restore via WEBGL_lose_context, three reopen cycles, WebGL 2 unavailability, and retry. The 2D bench and completed run remained available. No uncaught browser exceptions.
- In the production preview with external URLs blocked, confirmed the Three.js chunk loaded only upon opening 3D and only from the local origin. Four open/close cycles left no canvas and explicitly lost every retired WebGL context.

Evidence frames captured for the original, moved, rotated and undone Mirror poses, all ten optics, the branched board, no return, narrow layout and production isometric view.

### Engineering gate

- Targeted presentation, regression and acquisition cancellation suites passed, 93 tests across 15 files.
- Full npm test passed, 505 tests across 62 files, including the existing untracked Phase 3 regression file present in the workspace.
- npm run lint and npm run build passed. The lazy 3D chunk is about 593 kB minified / 151 kB gzip and produces Vite's size advisory.
- git diff --check passed on the submitted changes.

### Limits

Bench hardware, display beam widths and the focus cone are schematic. Rayleigh shares the observed sample-return geometry and is shown only where the aggregate context supports attribution. Very dense hole grids are sampled on pitch-aligned centers. Context release and draw scheduling were verified with Chromium SwiftShader. Dedicated-GPU memory and FPS were not measured.
