import {
  OpticalSceneSchema,
  SimulationConfigurationSchema,
} from '../../src/core/optics'

const visualization = {
  beam_height_mm: 50,
  post_height_mm: 50,
  visual_depth_mm: 20,
  holder: true,
} as const

const DEMO_GRID_PITCH_MM = 25

const demoGridPositionToWorld = (x: number, y: number) => ({
  x_mm: x * DEMO_GRID_PITCH_MM,
  y_mm: -y * DEMO_GRID_PITCH_MM,
})

const demoAngleToWorld = (rotation_deg: number) =>
  rotation_deg === 0 ? 0 : -rotation_deg

const componentBase = (
  id: string,
  name: string,
  demo_grid_x: number,
  demo_grid_y: number,
  demo_rotation_deg: number,
  aperture_mm: number,
) => {
  const position = demoGridPositionToWorld(demo_grid_x, demo_grid_y)

  return {
    id,
    name,
    enabled: true,
    transform: {
      ...position,
      rotation_deg: demoAngleToWorld(demo_rotation_deg),
    },
    geometry: { aperture_mm },
    visualization,
    metadata: { source: 'raman-sandbox-reference' },
  }
}

/**
 * Formal mm-based conversion of the Demo's default seven-component layout.
 * Demo grid indices are multiplied by 25 mm. The Demo's downward-positive Y
 * and clockwise-positive screen angle are explicitly converted at this
 * boundary. Canvas drawing sizes are not treated as physical quantities.
 */
export const DEFAULT_RAMAN_SCENE = OpticalSceneSchema.parse({
  breadboards: [
    {
      id: 'breadboard:default',
      name: 'Default Raman breadboard',
      origin_mm: { x: 0, y: 0 },
      width_mm: 500,
      height_mm: 300,
      hole_pitch_mm: 25,
    },
  ],
  components: [
    {
      ...componentBase('component:laser', 'Laser', 2, 3, 0, 10),
      type: 'laser',
      // Nominal fixture value: the Demo used relative power, not physical mW.
      parameters: { wavelength_nm: 532, power_mw: 10 },
    },
    {
      ...componentBase('component:mirror', 'Mirror', 8, 3, 45, 25),
      type: 'mirror',
      parameters: { reflectivity: 1 },
    },
    {
      ...componentBase(
        'component:dichroic',
        'Dichroic',
        8,
        8,
        45,
        25,
      ),
      type: 'dichroic',
      parameters: {
        excitation_reflectivity: 0.99,
        excitation_transmission: 0.01,
        raman_transmission: 1,
      },
    },
    {
      ...componentBase(
        'component:objective',
        'Objective',
        13,
        8,
        90,
        20,
      ),
      type: 'objective',
      parameters: { focal_length_mm: 75, numerical_aperture: 0.25 },
    },
    {
      ...componentBase('component:sample', 'Sample', 16, 8, 90, 10),
      type: 'sample',
      parameters: { material_id: 'material:silicon' },
    },
    {
      ...componentBase('component:filter', 'Edge Filter', 5, 8, 90, 25),
      type: 'filter',
      parameters: {
        raman_transmission: 1,
        rayleigh_suppression_od: 6,
        leakage_model: 'angle-dependent',
      },
    },
    {
      ...componentBase(
        'component:spectrometer',
        'Spectrometer',
        2,
        8,
        90,
        20,
      ),
      type: 'spectrometer',
      parameters: {
        optical_throughput: 1,
        acceptance_half_angle_deg: 90,
      },
    },
  ],
})

export const DEFAULT_SIMULATION_CONFIGURATION =
  SimulationConfigurationSchema.parse({
    model_version: 'optics-v1',
    min_ray_power: 0.00001,
    max_generations: 16,
    max_rays: 1_000,
    scene_escape_distance_mm: 2_000,
  })
