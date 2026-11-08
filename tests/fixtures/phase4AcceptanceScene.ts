import { OpticalSceneSchema } from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'

/** PRD §73 fixes 1s/N=20, not the default optical excitation power.
 * Same layout/material/532nm source; only the existing Laser power changes.
 * Detector settings and scientific algorithms are deliberately untouched. */
export const PHASE4_F_LASER_POWER_MW = 0.1
export const createPhase4FAcceptanceScene = () => OpticalSceneSchema.parse({
  ...DEFAULT_RAMAN_SCENE,
  components: DEFAULT_RAMAN_SCENE.components.map((component) => component.type === 'laser'
    ? { ...component, parameters: { ...component.parameters, power_mw: PHASE4_F_LASER_POWER_MW } }
    : component),
})
