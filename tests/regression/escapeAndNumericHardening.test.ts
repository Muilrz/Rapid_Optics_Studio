import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEOMETRY_EPSILON,
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  traceOpticalScene,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

describe('ray escape and runtime numeric hardening', () => {
  it('uses a finite world-space escape segment without a false hit', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent(
          'component:escape-laser',
          'laser',
          2,
          -3,
          30,
          1,
          { wavelength_nm: 532, power_mw: 10 },
        ),
      ],
    })
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      scene_escape_distance_mm: 123,
    })
    const first = traceOpticalScene(scene, options)
    const second = traceOpticalScene(scene, options)
    const segment = first.segments[0]!

    expect(segment.distance_mm).toBe(123)
    expect(segment.hitComponentId).toBeNull()
    expect(segment.end.x).toBeCloseTo(2 + 123 * Math.cos(Math.PI / 6), 12)
    expect(segment.end.y).toBeCloseTo(-3 + 123 * Math.sin(Math.PI / 6), 12)
    expect(first.events.at(-1)).toMatchObject({ reason: 'escaped-scene' })
    expect(first.processedRayCount).toBe(1)
    expect(first).toEqual(second)
  })

  it('does not self-hit and alternates two reflecting surfaces', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent('component:laser', 'laser', 5, 0, 0, 1, {
          wavelength_nm: 532,
          power_mw: 10,
        }),
        hardeningComponent('component:left', 'mirror', 0, 0, 90, 20, {
          reflectivity: 1,
        }),
        hardeningComponent('component:right', 'mirror', 10, 0, 90, 20, {
          reflectivity: 1,
        }),
      ],
    })
    const options = SimulationConfigurationSchema.parse({
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_generations: 8,
    })
    const result = traceOpticalScene(scene, options)
    const hitIds = result.segments.map((segment) => segment.hitComponentId)

    expect(hitIds).toEqual([
      'component:right',
      'component:left',
      'component:right',
      'component:left',
      'component:right',
      'component:left',
      'component:right',
      'component:left',
    ])
    expect(result.segments[0]?.distance_mm).toBe(5)
    expect(result.segments[1]?.distance_mm).toBeCloseTo(
      10 - DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm,
      12,
    )
  })

  it('resolves two very closely spaced pass-through surfaces', () => {
    const spacing_mm = 0.000002
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent('component:laser', 'laser', 0, 0, 0, 1, {
          wavelength_nm: 532,
          power_mw: 10,
        }),
        hardeningComponent('component:objective:a', 'objective', 10, 0, 90, 1, {
          focal_length_mm: 75,
          numerical_aperture: 0.25,
        }),
        hardeningComponent(
          'component:objective:b',
          'objective',
          10 + spacing_mm,
          0,
          90,
          1,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
        hardeningComponent(
          'component:detector',
          'spectrometer',
          20,
          0,
          90,
          1,
          { optical_throughput: 1, acceptance_half_angle_deg: 90 },
        ),
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(result.segments.map((segment) => segment.hitComponentId)).toEqual([
      'component:objective:a',
      'component:objective:b',
      'component:detector',
    ])
    expect(result.segments[1]?.distance_mm).toBeCloseTo(
      spacing_mm - DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm,
      12,
    )
  })

  it('handles a tiny legal aperture and a large finite rotation without NaN', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent('component:laser', 'laser', 0, 0, 0, 1, {
          wavelength_nm: 532,
          power_mw: 0.00002,
        }),
        hardeningComponent(
          'component:tiny-mirror',
          'mirror',
          10,
          0,
          360_000_090,
          0.000000001,
          { reflectivity: 0 },
        ),
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(result.segments[0]?.hitComponentId).toBe('component:tiny-mirror')
    expect(result.segments.every((segment) => Number.isFinite(segment.distance_mm)))
      .toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/)
  })

  it('keeps the configured origin offset distinct from geometry hit epsilon', () => {
    expect(DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm).toBeGreaterThan(
      DEFAULT_GEOMETRY_EPSILON.positiveDistance_mm,
    )
    expect(DEFAULT_GEOMETRY_EPSILON.positiveDistance_mm).toBe(1e-7)
  })
})
