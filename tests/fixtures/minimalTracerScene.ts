import { OpticalSceneSchema } from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from './defaultRamanScene'

const component = (id: string) => {
  const match = DEFAULT_RAMAN_SCENE.components.find((item) => item.id === id)
  if (!match) throw new Error(`Missing default fixture component: ${id}`)
  return match
}

const laser = component('component:laser')
const mirror = component('component:mirror')
const sample = component('component:sample')
const spectrometer = component('component:spectrometer')

/**
 * Phase 1C regression derived from the formal default Raman fixture. It keeps
 * the default Laser and Mirror coordinates, places the Sample on the reflected
 * leg, and places the Spectrometer on the return leg. Phase 1D Dichroic,
 * Objective, and Filter behavior is intentionally not emulated here.
 */
export const MINIMAL_TRACER_SCENE = OpticalSceneSchema.parse({
  breadboards: DEFAULT_RAMAN_SCENE.breadboards,
  // Deliberately not propagation-ordered: tracing must be geometry-driven.
  components: [
    {
      ...spectrometer,
      transform: { x_mm: 0, y_mm: -75, rotation_deg: 90 },
    },
    {
      ...sample,
      transform: { x_mm: 200, y_mm: -200, rotation_deg: -90 },
    },
    mirror,
    laser,
  ],
})
