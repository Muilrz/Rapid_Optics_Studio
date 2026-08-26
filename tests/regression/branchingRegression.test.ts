import { describe, expect, it } from 'vitest'
import {
  SimulationConfigurationSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { createBranchingStressScene } from '../fixtures/hardeningScenes'

describe('multi-level Beam Splitter regression', () => {
  it('preserves transmitted-first IDs, FIFO order, lineage, and power', () => {
    const scene = createBranchingStressScene(2)
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_generations: 6,
      max_rays: 100,
      min_ray_power_mw: 0,
    })
    const first = traceOpticalScene(scene, options)
    const second = traceOpticalScene(scene, options)
    const interactions = first.events.filter(
      (event) => event.kind === 'component-interaction',
    )

    expect(interactions.length).toBeGreaterThan(2)
    expect(interactions[0]).toMatchObject({
      rayId: 'ray:000001',
      componentId: 'component:splitter:01',
      outgoingRayIds: ['ray:000002', 'ray:000003'],
    })
    expect(interactions[1]).toMatchObject({
      rayId: 'ray:000002',
      componentId: 'component:splitter:02',
      outgoingRayIds: ['ray:000004', 'ray:000005'],
    })

    const reflectedFirstBranchTerminationIndex = first.events.findIndex(
      (event) =>
        event.kind === 'termination' && event.rayId === 'ray:000003',
    )
    const transmittedSecondSplitIndex = first.events.findIndex(
      (event) =>
        event.kind === 'component-interaction' && event.rayId === 'ray:000002',
    )
    expect(transmittedSecondSplitIndex).toBeLessThan(
      reflectedFirstBranchTerminationIndex,
    )

    const rayById = new Map(first.rays.map((ray) => [ray.rayId, ray]))
    for (const ray of first.rays.slice(1)) {
      const parent = rayById.get(ray.parentRayId!)
      expect(parent).toBeDefined()
      expect(ray.generation).toBe(parent!.generation + 1)
    }
    for (const event of interactions) {
      expect(event.metadata).toMatchObject({
        kind: 'beam-splitter',
        branchOrder: ['transmitted', 'reflected'],
      })
      expect(event.power.outgoing_power_mw).toBeCloseTo(
        event.power.incoming_power_mw,
        12,
      )
    }
    expect(first).toEqual(second)
  })
})
