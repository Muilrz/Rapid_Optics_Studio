import { expect, it } from 'vitest'
import { Transform2DSchema, traceOpticalScene } from '../../src/core/optics'
import { diagnoseContext } from '../../src/core/diagnostics/diagnostics'
import { deriveStudioSimulation } from '../../src/store/derivedSimulation'
import { createStudioStore } from '../../src/store/studioStore'
import { PHASE8_STRESS_DESIGN, PHASE8_TYPICAL_DESIGN } from '../fixtures/phase8StressScene'

const percentiles = (samples: number[]) => {
  const ordered = [...samples].sort((a, b) => a - b)
  const pick = (p: number) => Number(ordered[Math.ceil(ordered.length * p) - 1]!.toFixed(3))
  return { median_ms: pick(0.5), p95_ms: pick(0.95) }
}

it.each([['typical', PHASE8_TYPICAL_DESIGN], ['stress', PHASE8_STRESS_DESIGN]] as const)(
  'measures trace, Raman/CCD, diagnostics and store updates on the %s Raman scene', (workload, design) => {
  const { opticalScene, simulationConfiguration, detectorConfiguration } = design
  const store = createStudioStore(opticalScene, simulationConfiguration)
  const mirror = opticalScene.components.find((component) => component.type === 'mirror')!
  const stats = { trace: [] as number[], ramanCcd: [] as number[], diagnostics: [] as number[], store: [] as number[] }
  let counts = { rays: 0, bins: 0 }
  for (let index = 0; index < 36; index++) {
    const transform = Transform2DSchema.parse({ ...mirror.transform,
      x_mm: mirror.transform.x_mm + (index % 3) * 0.05, rotation_deg: mirror.transform.rotation_deg + (index % 2) * 0.02 })
    let started = performance.now()
    store.getState().updateComponentTransform(mirror.id, transform)
    const storeMs = performance.now() - started
    const scene = store.getState().authoritative.scene
    started = performance.now()
    const trace = traceOpticalScene(scene, simulationConfiguration)
    const traceMs = performance.now() - started
    started = performance.now()
    const derived = deriveStudioSimulation({ scene, simulationConfiguration,
      detectorConfiguration, sourceRevision: store.getState().authoritative.revision, trace })
    const ramanMs = performance.now() - started
    started = performance.now()
    derived.ramanContexts.flatMap((context) => diagnoseContext(context))
    const diagnosticMs = performance.now() - started
    expect(derived.spectrum.kind).toBe('ready')
    counts = { rays: trace.rays.length, bins: derived.spectrum.expectedCcdSpectrum?.axis.values_cm_1.length ?? 0 }
    expect(derived.spectrum.expectedCcdSpectrum).toEqual(store.getState().derived.spectrum.expectedCcdSpectrum)
    if (index >= 6) {
      stats.trace.push(traceMs)
      stats.ramanCcd.push(ramanMs)
      stats.diagnostics.push(diagnosticMs)
      stats.store.push(storeMs)
    }
  }
  expect(opticalScene.components.length).toBeGreaterThan(30)
  expect(counts.rays).toBeGreaterThan(30)
  expect(counts.bins).toBeGreaterThanOrEqual(900)
  console.info('[Phase 8 Node benchmark]', {
    workload, node: process.version, components: opticalScene.components.length, ...counts, repeats: 30,
    timings: Object.fromEntries(Object.entries(stats).map(([key, values]) => [key, percentiles(values)])),
  })
}, 20_000)
