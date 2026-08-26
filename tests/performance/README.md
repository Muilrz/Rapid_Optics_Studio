# Optical Core performance baselines

`opticalCoreBaseline.test.ts` records two diagnostic, non-gating timing
baselines:

- 35 sequential Objective interactions plus Laser and Spectrometer, exercising
  linear nearest-hit search across 37 components.
- Eight Beam Splitters in a bounded branching stress scene, stopped by formal
  `SimulationConfiguration` limits.

The tests enforce correctness and bounded ray counts, but intentionally do not
enforce a wall-clock threshold. Their console diagnostics report component,
ray, segment, event, termination, generation, and elapsed-time metrics for the
current machine.
