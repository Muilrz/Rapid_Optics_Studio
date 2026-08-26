import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOMETRY_EPSILON,
  OpticalSceneSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

const laser = hardeningComponent(
  'component:tie-laser',
  'laser',
  0,
  0,
  0,
  1,
  { wavelength_nm: 532, power_mw: 10 },
)
const nearer = hardeningComponent(
  'component:z-nearer',
  'mirror',
  10,
  0,
  90,
  20,
  { reflectivity: 0 },
)
const stableWinner = hardeningComponent(
  'component:a-stable-winner',
  'mirror',
  10 + DEFAULT_GEOMETRY_EPSILON.distanceTie_mm / 2,
  0,
  90,
  20,
  { reflectivity: 0 },
)

describe('full-tracer near-tie determinism', () => {
  it('uses stable component ID independent of candidate array order', () => {
    const firstScene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [nearer, stableWinner, laser],
    })
    const secondScene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [laser, stableWinner, nearer],
    })
    const first = traceOpticalScene(
      firstScene,
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const second = traceOpticalScene(
      secondScene,
      DEFAULT_SIMULATION_CONFIGURATION,
    )

    expect(first.segments[0]?.hitComponentId).toBe(
      'component:a-stable-winner',
    )
    expect(first).toEqual(second)
  })

  it('rejects duplicate component IDs before tracing', () => {
    expect(() =>
      OpticalSceneSchema.parse({
        breadboards: [],
        components: [laser, nearer, { ...stableWinner, id: nearer.id }],
      }),
    ).toThrow(/Duplicate scene ID/)
  })
})
