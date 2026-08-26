import { describe, expect, it } from 'vitest'
import {
  OPTICAL_UNIT_CONVENTION,
  OpticalComponentSchema,
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  Transform2DSchema,
} from '../src/core/optics'
import { LASER_WAVELENGTH_PRESETS } from '../src/project/defaults/laserPresets'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from './fixtures/defaultRamanScene'

const common = (id: string, aperture_mm = 25) => ({
  id,
  name: id,
  enabled: true,
  transform: { x_mm: 0, y_mm: 0, rotation_deg: 0 },
  geometry: { aperture_mm },
  visualization: {
    beam_height_mm: 50,
    post_height_mm: 50,
    visual_depth_mm: 20,
    holder: true,
  },
  metadata: { source: 'phase-1a-validation' },
})

const validLaser = {
  ...common('component:test-laser'),
  type: 'laser',
  parameters: { wavelength_nm: 532, power_mw: 10 },
} as const

const validBeamSplitter = {
  ...common('component:test-beam-splitter'),
  type: 'beam-splitter',
  parameters: { transmission_ratio: 0.5, reflection_ratio: 0.5 },
} as const

const validComponents = [
  validLaser,
  {
    ...common('component:test-mirror'),
    type: 'mirror',
    parameters: { reflectivity: 0.98 },
  },
  {
    ...common('component:test-dichroic'),
    type: 'dichroic',
    parameters: {
      excitation_reflectivity: 0.99,
      excitation_transmission: 0.01,
      raman_transmission: 0.95,
    },
  },
  {
    ...common('component:test-objective'),
    type: 'objective',
    parameters: { focal_length_mm: 75, numerical_aperture: 0.25 },
  },
  {
    ...common('component:test-sample'),
    type: 'sample',
    parameters: { material_id: 'material:silicon' },
  },
  {
    ...common('component:test-filter'),
    type: 'filter',
    parameters: {
      raman_transmission: 0.95,
      rayleigh_suppression_od: 6,
      leakage_model: 'angle-dependent',
    },
  },
  {
    ...common('component:test-spectrometer'),
    type: 'spectrometer',
    parameters: {
      optical_throughput: 0.7,
      acceptance_half_angle_deg: 45,
    },
  },
  {
    ...common('component:test-prism'),
    type: 'prism',
    parameters: { deflection_angle_deg: 40 },
  },
  validBeamSplitter,
  {
    ...common('component:test-pinhole', 0.1),
    type: 'pinhole',
    parameters: { model: 'geometric-aperture' },
  },
] as const

describe('optical component schemas', () => {
  it.each(validComponents)('accepts a valid $type component', (component) => {
    expect(OpticalComponentSchema.parse(component).type).toBe(component.type)
  })

  it('rejects an unknown component type', () => {
    expect(() =>
      OpticalComponentSchema.parse({
        ...common('component:unknown'),
        type: 'unknown-optic',
        parameters: {},
      }),
    ).toThrow()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite coordinate %s',
    (x_mm) => {
      expect(() =>
        Transform2DSchema.parse({ x_mm, y_mm: 0, rotation_deg: 0 }),
      ).toThrow()
    },
  )

  it('rejects a negative aperture', () => {
    expect(() =>
      OpticalComponentSchema.parse({
        ...validLaser,
        geometry: { aperture_mm: -1 },
      }),
    ).toThrow()
  })

  it('rejects Beam Splitter ratios whose sum exceeds one', () => {
    expect(() =>
      OpticalComponentSchema.parse({
        ...validBeamSplitter,
        parameters: { transmission_ratio: 0.8, reflection_ratio: 0.5 },
      }),
    ).toThrow()
  })

  it.each([
    { wavelength_nm: 0, power_mw: 10 },
    { wavelength_nm: -532, power_mw: 10 },
    { wavelength_nm: 532, power_mw: 0 },
    { wavelength_nm: 532, power_mw: -1 },
    { wavelength_nm: Number.POSITIVE_INFINITY, power_mw: 10 },
  ])('rejects invalid laser parameters %#', (parameters) => {
    expect(() =>
      OpticalComponentSchema.parse({ ...validLaser, parameters }),
    ).toThrow()
  })
})

describe('Phase 1A scene data', () => {
  it('uses the formal optical unit convention', () => {
    expect(OPTICAL_UNIT_CONVENTION).toEqual({
      length: 'mm',
      publicAngle: 'degree',
    })
  })

  it('validates the converted default Raman fixture', () => {
    expect(OpticalSceneSchema.parse(DEFAULT_RAMAN_SCENE)).toStrictEqual(
      DEFAULT_RAMAN_SCENE,
    )
    expect(DEFAULT_RAMAN_SCENE.components).toHaveLength(7)

    const objective = DEFAULT_RAMAN_SCENE.components.find(
      (component) => component.type === 'objective',
    )
    const sample = DEFAULT_RAMAN_SCENE.components.find(
      (component) => component.type === 'sample',
    )

    expect(objective?.transform.x_mm).toBe(325)
    expect(objective?.parameters.focal_length_mm).toBe(75)
    expect(sample?.transform.x_mm).toBe(400)
  })

  it('contains no pixel-based property in formal scene data', () => {
    expect(JSON.stringify(DEFAULT_RAMAN_SCENE)).not.toMatch(/pixel|(^|[_-])px/i)
  })

  it('provides a validated minimal simulation configuration', () => {
    expect(DEFAULT_SIMULATION_CONFIGURATION.model_version).toBe('optics-v1')
    expect(DEFAULT_SIMULATION_CONFIGURATION.max_generations).toBe(16)
    expect(DEFAULT_SIMULATION_CONFIGURATION.min_ray_power_mw).toBe(0.00001)
    expect(DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm).toBe(
      0.000001,
    )
  })

  it('rejects invalid tracer power thresholds and origin offsets', () => {
    expect(() =>
      SimulationConfigurationSchema.parse({
        ...DEFAULT_SIMULATION_CONFIGURATION,
        min_ray_power_mw: -1,
      }),
    ).toThrow()
    expect(() =>
      SimulationConfigurationSchema.parse({
        ...DEFAULT_SIMULATION_CONFIGURATION,
        ray_origin_offset_mm: 0,
      }),
    ).toThrow()
  })

  it('provides the three required laser wavelength presets', () => {
    expect(
      LASER_WAVELENGTH_PRESETS.map((preset) => preset.wavelength_nm),
    ).toEqual([532, 633, 785])
  })
})
