import { describe, expect, it } from 'vitest'
import { traceOpticalScene } from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { MINIMAL_TRACER_SCENE } from '../fixtures/minimalTracerScene'

describe('Phase 1C minimal Raman-path tracer regression', () => {
  it('traces Laser → Mirror → Sample → return Mirror → Spectrometer', () => {
    const result = traceOpticalScene(
      MINIMAL_TRACER_SCENE,
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const interactions = result.events.filter(
      (event) => event.kind === 'component-interaction',
    )
    const terminations = result.events.filter(
      (event) => event.kind === 'termination',
    )

    expect(interactions.map((event) => event.componentId)).toEqual([
      'component:mirror',
      'component:sample',
      'component:mirror',
      'component:spectrometer',
    ])
    expect(interactions.map((event) => event.outcome)).toEqual([
      'ideal-reflection',
      'sample-placeholder-return',
      'ideal-reflection',
      'terminal-detection',
    ])
    expect(result.segments.map((segment) => segment.hitComponentId)).toEqual([
      'component:mirror',
      'component:sample',
      'component:mirror',
      'component:spectrometer',
    ])
    expect(result.segments.map((segment) => segment.distance_mm)).toEqual([
      150,
      expect.closeTo(119.999999, 6),
      expect.closeTo(119.999999, 6),
      expect.closeTo(199.999999, 6),
    ])

    expect(result.rays.map((ray) => ray.rayId)).toEqual([
      'ray:000001',
      'ray:000002',
      'ray:000003',
      'ray:000004',
    ])
    expect(result.rays.map((ray) => ray.parentRayId)).toEqual([
      null,
      'ray:000001',
      'ray:000002',
      'ray:000003',
    ])
    expect(result.rays.map((ray) => ray.generation)).toEqual([0, 1, 2, 3])
    expect(new Set(result.rays.map((ray) => ray.sourceComponentId))).toEqual(
      new Set(['component:laser']),
    )
    expect(result.rays[2]?.kind).toBe('sample-return-placeholder')
    expect(terminations).toHaveLength(1)
    expect(terminations[0]?.reason).toBe('detected')
    expect(terminations[0]?.componentId).toBe('component:spectrometer')
    expect(JSON.stringify(result)).not.toMatch(/pixel|_px/)
  })
})
