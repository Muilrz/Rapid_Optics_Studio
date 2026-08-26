import {
  OpticalComponentSchema,
  OpticalSceneSchema,
  type OpticalComponent,
} from '../../src/core/optics'

const visualization = {
  beam_height_mm: 50,
  post_height_mm: 50,
  visual_depth_mm: 20,
  holder: true,
} as const

export const hardeningComponent = (
  id: string,
  type: OpticalComponent['type'],
  x_mm: number,
  y_mm: number,
  rotation_deg: number,
  aperture_mm: number,
  parameters: object,
) =>
  OpticalComponentSchema.parse({
    id,
    type,
    name: id,
    enabled: true,
    transform: { x_mm, y_mm, rotation_deg },
    geometry: { aperture_mm },
    visualization,
    metadata: { source: 'phase-1e-hardening' },
    parameters,
  })

export const createMirrorLoopScene = (reflectivity = 1) =>
  OpticalSceneSchema.parse({
    breadboards: [],
    components: [
      hardeningComponent('component:loop-laser', 'laser', 5, 0, 0, 1, {
        wavelength_nm: 532,
        power_mw: 10,
      }),
      hardeningComponent('component:mirror-left', 'mirror', 0, 0, 90, 20, {
        reflectivity,
      }),
      hardeningComponent('component:mirror-right', 'mirror', 10, 0, 90, 20, {
        reflectivity,
      }),
    ],
  })

export const createLargePassThroughScene = (objectiveCount = 35) =>
  OpticalSceneSchema.parse({
    breadboards: [],
    components: [
      hardeningComponent('component:large-laser', 'laser', 0, 0, 0, 1, {
        wavelength_nm: 532,
        power_mw: 10,
      }),
      ...Array.from({ length: objectiveCount }, (_, index) =>
        hardeningComponent(
          `component:objective:${(index + 1).toString().padStart(3, '0')}`,
          'objective',
          (index + 1) * 10,
          0,
          90,
          20,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
      ),
      hardeningComponent(
        'component:large-spectrometer',
        'spectrometer',
        (objectiveCount + 1) * 10,
        0,
        90,
        20,
        { optical_throughput: 1, acceptance_half_angle_deg: 90 },
      ),
    ],
  })

export const createBranchingStressScene = (splitterCount = 8) =>
  OpticalSceneSchema.parse({
    breadboards: [],
    components: [
      hardeningComponent('component:stress-laser', 'laser', 0, 0, 0, 1, {
        wavelength_nm: 532,
        power_mw: 10,
      }),
      ...Array.from({ length: splitterCount }, (_, index) =>
        hardeningComponent(
          `component:splitter:${(index + 1).toString().padStart(2, '0')}`,
          'beam-splitter',
          (index + 1) * 10,
          0,
          90,
          20,
          { transmission_ratio: 0.5, reflection_ratio: 0.5 },
        ),
      ),
    ],
  })

export const createFocusScene = (
  sampleX_mm: number,
  objectivePositions_mm: readonly number[] = [10],
) =>
  OpticalSceneSchema.parse({
    breadboards: [],
    components: [
      hardeningComponent('component:focus-laser', 'laser', 0, 0, 0, 1, {
        wavelength_nm: 532,
        power_mw: 10,
      }),
      ...objectivePositions_mm.map((x_mm, index) =>
        hardeningComponent(
          `component:focus-objective:${index + 1}`,
          'objective',
          x_mm,
          0,
          90,
          20,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
      ),
      hardeningComponent(
        'component:focus-sample',
        'sample',
        sampleX_mm,
        0,
        0,
        10,
        { material_id: 'material:test' },
      ),
    ],
  })
