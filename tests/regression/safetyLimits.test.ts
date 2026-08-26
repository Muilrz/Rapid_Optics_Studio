import { describe, expect, it } from 'vitest'
import {
  SimulationConfigurationSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import {
  createBranchingStressScene,
  createMirrorLoopScene,
} from '../fixtures/hardeningScenes'

const configuration = (overrides: Record<string, number>) =>
  SimulationConfigurationSchema.parse({
    ...DEFAULT_SIMULATION_CONFIGURATION,
    ...overrides,
  })

describe('Phase 1E tracer safety-limit boundaries', () => {
  it('stops a persistent mirror loop exactly at max_generations', () => {
    const result = traceOpticalScene(
      createMirrorLoopScene(),
      configuration({ max_generations: 5 }),
    )
    const interactions = result.events.filter(
      (event) => event.kind === 'component-interaction',
    )

    expect(result.rays.map((ray) => ray.generation)).toEqual([0, 1, 2, 3, 4, 5])
    expect(result.processedRayCount).toBe(6)
    expect(result.segments).toHaveLength(5)
    expect(interactions).toHaveLength(5)
    expect(result.events.at(-1)).toMatchObject({
      kind: 'termination',
      rayId: 'ray:000006',
      reason: 'max-generation',
    })
  })

  it('stops queued branches deterministically at max_rays without an off-by-one', () => {
    const scene = createBranchingStressScene()
    const options = configuration({
      max_generations: 64,
      max_rays: 20,
      min_ray_power_mw: 0,
    })
    const first = traceOpticalScene(scene, options)
    const second = traceOpticalScene(scene, options)
    const maxRayTerminations = first.events.filter(
      (event) =>
        event.kind === 'termination' && event.reason === 'max-ray-count',
    )

    expect(first.processedRayCount).toBe(20)
    expect(first.rays.length).toBeGreaterThan(20)
    expect(maxRayTerminations.length).toBeGreaterThan(0)
    expect(new Set(first.rays.map((ray) => ray.rayId)).size).toBe(
      first.rays.length,
    )
    expect(first).toEqual(second)
  })

  it('terminates only after repeated loss puts the created child below threshold', () => {
    const result = traceOpticalScene(
      createMirrorLoopScene(0.5),
      configuration({ min_ray_power_mw: 1 }),
    )

    expect(result.rays.map((ray) => ray.power_mw)).toEqual([
      10, 5, 2.5, 1.25, 0.625,
    ])
    expect(result.segments).toHaveLength(4)
    expect(result.processedRayCount).toBe(5)
    expect(result.events.at(-1)).toMatchObject({
      kind: 'termination',
      rayId: 'ray:000005',
      reason: 'below-minimum-power',
    })
  })
})
