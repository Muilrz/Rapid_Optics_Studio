import { describe, expect, it } from 'vitest'
import { OpticalSceneSchema, traceOpticalScene } from '../../src/core/optics'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

const source = hardeningComponent(
  'component:audit-laser',
  'laser',
  0,
  0,
  0,
  1,
  { wavelength_nm: 532, power_mw: 10 },
)

const singleInteractionScene = (target: ReturnType<typeof hardeningComponent>) =>
  OpticalSceneSchema.parse({ breadboards: [], components: [source, target] })

describe('Phase 1 interaction power accounting audit', () => {
  it('conserves propagated, detected, and lost power for every interaction type', () => {
    const scenes = [
      DEFAULT_RAMAN_SCENE,
      singleInteractionScene(
        hardeningComponent(
          'component:audit-beam-splitter',
          'beam-splitter',
          10,
          0,
          90,
          20,
          { transmission_ratio: 0.6, reflection_ratio: 0.3 },
        ),
      ),
      singleInteractionScene(
        hardeningComponent(
          'component:audit-prism',
          'prism',
          10,
          0,
          90,
          20,
          { deflection_angle_deg: 40 },
        ),
      ),
      singleInteractionScene(
        hardeningComponent(
          'component:audit-pinhole',
          'pinhole',
          10,
          0,
          90,
          10,
          { model: 'geometric-aperture' },
        ),
      ),
    ]
    const events = scenes.flatMap((scene) =>
      traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION).events.filter(
        (event) => event.kind === 'component-interaction',
      ),
    )
    const coveredTypes = new Set(events.map((event) => event.componentType))

    expect(coveredTypes).toEqual(
      new Set([
        'mirror',
        'dichroic',
        'objective',
        'sample',
        'filter',
        'spectrometer',
        'beam-splitter',
        'prism',
        'pinhole',
      ]),
    )

    for (const event of events) {
      const total =
        event.power.outgoing_power_mw +
        event.power.detected_power_mw +
        event.power.lost_power_mw
      expect(event.power.incoming_power_mw).toBeGreaterThanOrEqual(0)
      expect(event.power.outgoing_power_mw).toBeGreaterThanOrEqual(0)
      expect(event.power.detected_power_mw).toBeGreaterThanOrEqual(0)
      expect(event.power.lost_power_mw).toBeGreaterThanOrEqual(0)
      expect(event.power.outgoing_power_mw).toBeLessThanOrEqual(
        event.power.incoming_power_mw + 1e-12,
      )
      expect(total).toBeCloseTo(event.power.incoming_power_mw, 12)
    }
  })
})
