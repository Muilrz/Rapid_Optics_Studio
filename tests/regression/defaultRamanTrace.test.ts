import { describe, expect, it } from 'vitest'
import { traceOpticalScene } from '../../src/core/optics'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'

describe('Phase 1D formal default Raman scene regression', () => {
  it('completes the deterministic excitation and sample-return path', () => {
    const first = traceOpticalScene(
      DEFAULT_RAMAN_SCENE,
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const second = traceOpticalScene(
      DEFAULT_RAMAN_SCENE,
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const interactions = first.events.filter(
      (event) => event.kind === 'component-interaction',
    )
    const terminations = first.events.filter(
      (event) => event.kind === 'termination',
    )

    expect(interactions.map((event) => event.componentId)).toEqual([
      'component:mirror',
      'component:dichroic',
      'component:objective',
      'component:sample',
      'component:objective',
      'component:dichroic',
      'component:filter',
      'component:spectrometer',
    ])
    expect(interactions.map((event) => event.outcome)).toEqual([
      'ideal-reflection',
      'dichroic-routing',
      'objective-pass',
      'sample-placeholder-return',
      'objective-pass',
      'dichroic-routing',
      'filter-transmission',
      'terminal-detection',
    ])
    expect(first.segments).toHaveLength(9)
    expect(first.events).toHaveLength(11)
    expect(
      first.segments
        .filter((segment) => segment.hitComponentId !== null)
        .map((segment) => segment.hitComponentId),
    ).toEqual(interactions.map((event) => event.componentId))
    expect(
      interactions.filter((event) => event.componentType === 'objective'),
    ).toHaveLength(2)

    const mainPathRayIds = interactions.map((event) => event.rayId)
    expect(mainPathRayIds).toEqual([
      'ray:000001',
      'ray:000002',
      'ray:000004',
      'ray:000005',
      'ray:000006',
      'ray:000007',
      'ray:000008',
      'ray:000009',
    ])
    const mainPathRays = mainPathRayIds.map(
      (rayId) => first.rays.find((ray) => ray.rayId === rayId)!,
    )
    expect(mainPathRays.map((ray) => ray.parentRayId)).toEqual([
      null,
      'ray:000001',
      'ray:000002',
      'ray:000004',
      'ray:000005',
      'ray:000006',
      'ray:000007',
      'ray:000008',
    ])
    expect(mainPathRays.map((ray) => ray.generation)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    expect(mainPathRays[4]?.kind).toBe('sample-return-placeholder')

    const excitationDichroic = interactions.find(
      (event) =>
        event.componentType === 'dichroic' &&
        event.rayId === 'ray:000002',
    )!
    expect(excitationDichroic.outgoingRayIds).toEqual([
      'ray:000003',
      'ray:000004',
    ])
    expect(
      first.rays
        .filter((ray) => excitationDichroic.outgoingRayIds.includes(ray.rayId))
        .map((ray) => ray.parentRayId),
    ).toEqual(['ray:000002', 'ray:000002'])

    const returnedRay = first.rays.find((ray) => ray.rayId === 'ray:000006')
    expect(returnedRay?.focusMetadata).toMatchObject({
      objectiveComponentId: 'component:objective',
      sampleComponentId: 'component:sample',
      targetFocalDistance_mm: 75,
      actualDistance_mm: 75,
      defocus_mm: 0,
    })

    const filterEvent = interactions.find(
      (event) => event.componentType === 'filter',
    )!
    expect(filterEvent.metadata).toMatchObject({
      kind: 'filter-aoi',
      incidenceAngle_deg: 0,
      transmission: 1,
    })
    expect(filterEvent.power.outgoing_power_mw).toBeLessThanOrEqual(
      filterEvent.power.incoming_power_mw,
    )

    for (const event of interactions) {
      expect(event.power.outgoing_power_mw).toBeLessThanOrEqual(
        event.power.incoming_power_mw + 1e-12,
      )
      expect(
        event.power.outgoing_power_mw +
          event.power.detected_power_mw +
          event.power.lost_power_mw,
      ).toBeCloseTo(event.power.incoming_power_mw, 12)
    }

    expect(
      terminations.map((event) => [event.rayId, event.reason]),
    ).toEqual([
      ['ray:000003', 'escaped-scene'],
      ['ray:000009', 'detected'],
    ])
    expect(
      interactions.at(-1)?.metadata,
    ).toMatchObject({ accepted: true })
    expect(first.rays).toHaveLength(9)
    expect(first.processedRayCount).toBe(9)
    expect(first).toEqual(second)
    expect(JSON.stringify(first)).not.toMatch(/pixel|_px/)
  })
})
