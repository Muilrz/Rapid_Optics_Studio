import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

const laser = hardeningComponent(
  'component:dichroic-laser',
  'laser',
  0,
  0,
  0,
  1,
  { wavelength_nm: 532, power_mw: 10 },
)

const dichroic = (
  rotation_deg: number,
  excitation_reflectivity = 1,
  excitation_transmission = 0,
) =>
  hardeningComponent(
    'component:dichroic-under-test',
    'dichroic',
    10,
    0,
    rotation_deg,
    100,
    {
      excitation_reflectivity,
      excitation_transmission,
      raman_transmission: 0.8,
    },
  )

describe('Dichroic routing hardening regression', () => {
  it('derives reflected direction from component orientation', () => {
    const traceAt = (rotation_deg: number) =>
      traceOpticalScene(
        OpticalSceneSchema.parse({
          breadboards: [],
          components: [laser, dichroic(rotation_deg)],
        }),
        DEFAULT_SIMULATION_CONFIGURATION,
      )
    const upward = traceAt(45)
    const downward = traceAt(-45)

    expect(upward.rays[1]?.geometry.direction.x).toBeCloseTo(0, 12)
    expect(upward.rays[1]?.geometry.direction.y).toBeCloseTo(1, 12)
    expect(downward.rays[1]?.geometry.direction.x).toBeCloseTo(0, 12)
    expect(downward.rays[1]?.geometry.direction.y).toBeCloseTo(-1, 12)
    expect(traceAt(45)).toEqual(upward)
  })

  it('connects a low-power leakage branch to threshold termination', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [laser, dichroic(90, 0, 0.000001)],
    })
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      min_ray_power_mw: 0.0001,
    })
    const result = traceOpticalScene(scene, options)
    const interaction = result.events.find(
      (event) => event.kind === 'component-interaction',
    )!

    expect(result.rays).toHaveLength(2)
    expect(result.rays[1]?.power_mw).toBeCloseTo(0.00001, 15)
    expect(interaction).toMatchObject({
      outcome: 'dichroic-routing',
      outgoingRayIds: ['ray:000002'],
    })
    expect(interaction.power.lost_power_mw).toBeCloseTo(9.99999, 12)
    expect(result.events.at(-1)).toMatchObject({
      kind: 'termination',
      rayId: 'ray:000002',
      reason: 'below-minimum-power',
    })
  })
})
