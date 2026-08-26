import { describe, expect, it } from 'vitest'
import {
  SimulationConfigurationSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import {
  createBranchingStressScene,
  createLargePassThroughScene,
} from '../fixtures/hardeningScenes'

const terminationCount = (
  result: ReturnType<typeof traceOpticalScene>,
) => result.events.filter((event) => event.kind === 'termination').length

describe('Phase 1 Optical Core diagnostic performance baselines', () => {
  it('traces a 30+ component nearest-hit scene and records diagnostics', () => {
    const scene = createLargePassThroughScene(35)
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_generations: 64,
    })
    const started = performance.now()
    const result = traceOpticalScene(scene, options)
    const elapsed_ms = performance.now() - started
    const metrics = {
      baseline: 'linear-nearest-hit-35-objectives',
      component_count: scene.components.length,
      generated_ray_count: result.rays.length,
      segment_count: result.segments.length,
      event_count: result.events.length,
      termination_count: terminationCount(result),
      elapsed_ms: Number(elapsed_ms.toFixed(3)),
    }

    console.info('[Optical Core performance baseline]', metrics)
    expect(metrics.component_count).toBe(37)
    expect(metrics.generated_ray_count).toBe(36)
    expect(metrics.segment_count).toBe(36)
    expect(metrics.event_count).toBe(38)
    expect(metrics.termination_count).toBe(1)
    expect(Number.isFinite(elapsed_ms)).toBe(true)
    expect(elapsed_ms).toBeGreaterThanOrEqual(0)
    expect(result.events.at(-1)).toMatchObject({ reason: 'detected' })
  })

  it('traces bounded multi-level branching and records diagnostics', () => {
    const branchingDepth = 8
    const scene = createBranchingStressScene(branchingDepth)
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_generations: 64,
      max_rays: 256,
      min_ray_power_mw: 0,
    })
    const started = performance.now()
    const result = traceOpticalScene(scene, options)
    const elapsed_ms = performance.now() - started
    const maxGeneration = Math.max(...result.rays.map((ray) => ray.generation))
    const metrics = {
      baseline: 'eight-splitter-bounded-branching',
      branching_depth: branchingDepth,
      component_count: scene.components.length,
      generated_ray_count: result.rays.length,
      processed_ray_count: result.processedRayCount,
      max_generation: maxGeneration,
      segment_count: result.segments.length,
      event_count: result.events.length,
      termination_count: terminationCount(result),
      elapsed_ms: Number(elapsed_ms.toFixed(3)),
    }

    console.info('[Optical Core branching baseline]', metrics)
    expect(metrics.component_count).toBe(9)
    expect(metrics.generated_ray_count).toBeGreaterThan(256)
    expect(metrics.processed_ray_count).toBe(256)
    expect(metrics.segment_count).toBe(256)
    expect(metrics.termination_count).toBeGreaterThan(0)
    expect(Number.isFinite(elapsed_ms)).toBe(true)
    expect(
      result.events.some(
        (event) =>
          event.kind === 'termination' && event.reason === 'max-ray-count',
      ),
    ).toBe(true)
    expect(new Set(result.rays.map((ray) => ray.rayId)).size).toBe(
      result.rays.length,
    )
  })
})
