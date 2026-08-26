import { describe, expect, it } from 'vitest'
import {
  componentToGeometryCandidate,
  createInitialOpticalRay,
  createSequentialRayIdGenerator,
  intersectRayWithPrimitive,
  interactWithComponent,
  rotate,
  scale,
  subtract,
  vec2,
  type FilterComponent,
} from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import { hardeningComponent } from '../fixtures/hardeningScenes'

const angleDependentFilter = (
  width_deg = 2,
  midpoint_deg = 26,
): FilterComponent => {
  const value = hardeningComponent(
    'component:filter-angle',
    'filter',
    10,
    0,
    90,
    1,
    {
      raman_transmission: 0.8,
      rayleigh_suppression_od: 6,
      leakage_model: 'angle-dependent',
      leakage_midpoint_aoi_deg: midpoint_deg,
      leakage_transition_width_deg: width_deg,
    },
  )
  if (value.type !== 'filter') throw new Error('Expected Filter fixture.')
  return value
}

const constantFilter = (): FilterComponent => {
  const value = hardeningComponent(
    'component:filter-constant',
    'filter',
    10,
    0,
    90,
    1,
    {
      raman_transmission: 0.8,
      rayleigh_suppression_od: 4,
      leakage_model: 'constant',
    },
  )
  if (value.type !== 'filter') throw new Error('Expected Filter fixture.')
  return value
}

const transmissionAt = (filter: FilterComponent, angle_deg: number) => {
  const direction = rotate(vec2(1, 0), angle_deg)
  const center = vec2(filter.transform.x_mm, filter.transform.y_mm)
  const origin = subtract(center, scale(direction, 10))
  const ids = createSequentialRayIdGenerator()
  const ray = createInitialOpticalRay({
    rayId: ids.next(),
    sourceComponentId: filter.id,
    origin,
    direction,
    wavelength_nm: 532,
    power_mw: 10,
  })
  const candidate = componentToGeometryCandidate(filter)!
  const hit = intersectRayWithPrimitive(ray.geometry, candidate.primitive)!
  const result = interactWithComponent(ray, filter, hit, {
    nextRayId: () => ids.next(),
    rayOriginOffset_mm:
      DEFAULT_SIMULATION_CONFIGURATION.ray_origin_offset_mm,
  })
  if (result.metadata?.kind !== 'filter-aoi') {
    throw new Error('Expected Filter AOI metadata.')
  }
  return {
    transmission: result.metadata.transmission,
    incidenceAngle_deg: result.metadata.incidenceAngle_deg,
    power: result.power,
  }
}

describe('empirical Filter AOI hardening regression', () => {
  it('is finite, bounded, and monotonic across low/mid/high AOI', () => {
    const filter = angleDependentFilter()
    const angles = [0, 5, 20, 25, 26, 27, 40, 70, 89.999]
    const results = angles.map((angle) => transmissionAt(filter, angle))

    expect(results.map((result) => result.incidenceAngle_deg)).toEqual(
      angles.map((angle) => expect.closeTo(angle, 9)),
    )
    expect(
      results.every(
        (result) =>
          Number.isFinite(result.transmission) &&
          result.transmission >= 0 &&
          result.transmission <= 1,
      ),
    ).toBe(true)
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index]!.transmission).toBeGreaterThanOrEqual(
        results[index - 1]!.transmission,
      )
    }
  })

  it('matches the configured logistic midpoint and remains stable near it', () => {
    const filter = angleDependentFilter()
    const below = transmissionAt(filter, 26 - 1e-8).transmission
    const exact = transmissionAt(filter, 26).transmission
    const above = transmissionAt(filter, 26 + 1e-8).transmission
    const baseline = 1e-6

    expect(exact).toBeCloseTo(baseline + (1 - baseline) / 2, 12)
    expect(below).toBeLessThan(exact)
    expect(above).toBeGreaterThan(exact)
  })

  it('keeps constant leakage independent of AOI', () => {
    const filter = constantFilter()
    expect(transmissionAt(filter, 0).transmission).toBeCloseTo(1e-4, 15)
    expect(transmissionAt(filter, 45).transmission).toBeCloseTo(1e-4, 15)
    expect(transmissionAt(filter, 89.999).transmission).toBeCloseTo(1e-4, 15)
  })

  it('remains finite with an extreme but legal transition width', () => {
    const filter = angleDependentFilter(1e-12)
    const low = transmissionAt(filter, 0)
    const high = transmissionAt(filter, 89.999)

    expect(low.transmission).toBeCloseTo(1e-6, 15)
    expect(high.transmission).toBe(1)
    expect(Number.isFinite(low.power.lost_power_mw)).toBe(true)
    expect(Number.isFinite(high.power.outgoing_power_mw)).toBe(true)
  })

  it('conserves power at every sampled AOI', () => {
    const filter = angleDependentFilter()
    for (const angle of [0, 10, 26, 40, 89.999]) {
      const { power } = transmissionAt(filter, angle)
      expect(power.outgoing_power_mw).toBeLessThanOrEqual(
        power.incoming_power_mw,
      )
      expect(
        power.outgoing_power_mw +
          power.detected_power_mw +
          power.lost_power_mw,
      ).toBeCloseTo(power.incoming_power_mw, 12)
    }
  })
})
