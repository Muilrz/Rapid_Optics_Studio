import { OpticalSceneSchema, SimulationConfigurationSchema } from '../../src/core/optics'
import { DEFAULT_VIRTUAL_CCD_CONFIGURATION } from '../../src/core/acquisition'
import { DEFAULT_RAMAN_SCENE, DEFAULT_SIMULATION_CONFIGURATION } from './defaultRamanScene'
import { createBranchingStressScene, createMirrorLoopScene, hardeningComponent } from './hardeningScenes'

export const PHASE8_STRESS_SCENE = OpticalSceneSchema.parse({
  ...DEFAULT_RAMAN_SCENE,
  components: [
    ...DEFAULT_RAMAN_SCENE.components,
    ...createBranchingStressScene(8).components.map((component) => ({
      ...component, transform: { ...component.transform, y_mm: 95 },
    })),
    ...createMirrorLoopScene(0.85).components.map((component) => ({
      ...component, transform: { ...component.transform, x_mm: component.transform.x_mm + 180, y_mm: 145 },
    })),
    ...Array.from({ length: 16 }, (_, index) =>
      hardeningComponent('component:stress-objective:' + index, 'objective',
        300 + index * 18, 180, 90, 12, { focal_length_mm: 75, numerical_aperture: 0.25 })),
  ],
})
export const PHASE8_STRESS_SETTINGS = SimulationConfigurationSchema.parse({
  ...DEFAULT_SIMULATION_CONFIGURATION, max_generations: 48, max_rays: 256,
})
export const PHASE8_STRESS_DESIGN = {
  opticalScene: PHASE8_STRESS_SCENE,
  simulationConfiguration: PHASE8_STRESS_SETTINGS,
  detectorConfiguration: DEFAULT_VIRTUAL_CCD_CONFIGURATION,
  materials: [],
}

export const PHASE8_TYPICAL_DESIGN = {
  ...PHASE8_STRESS_DESIGN,
  opticalScene: OpticalSceneSchema.parse({
    ...PHASE8_STRESS_SCENE,
    components: [
      ...PHASE8_STRESS_SCENE.components
        .filter(({ id }) => !['04', '05', '06', '07', '08'].some((suffix) => id === 'component:splitter:' + suffix))
        .map((component) => component.type === 'beam-splitter' ? {
          ...component, transform: { ...component.transform, rotation_deg: 45 },
        } : component),
      ...Array.from({ length: 5 }, (_, index) =>
        hardeningComponent('component:typical-objective:' + index, 'objective',
          300 + index * 18, 220, 90, 12, { focal_length_mm: 75, numerical_aperture: 0.25 })),
    ],
  }),
}
