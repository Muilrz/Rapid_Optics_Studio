import { describe, expect, it } from 'vitest'
import {
  OpticalComponentSchema,
  buildComponentGeometryCandidates,
  componentToGeometryCandidate,
} from '../../src/core/optics'
import { DEFAULT_RAMAN_SCENE } from '../fixtures/defaultRamanScene'

const getComponent = (type: string) =>
  DEFAULT_RAMAN_SCENE.components.find((component) => component.type === type)!

describe('component geometry adapter', () => {
  it('maps every non-source V1 component to generic geometry', () => {
    expect(componentToGeometryCandidate(getComponent('mirror'))?.primitive.kind)
      .toBe('finite-optical-surface')
    expect(componentToGeometryCandidate(getComponent('sample'))?.primitive.kind)
      .toBe('circular-target')
    expect(
      componentToGeometryCandidate(getComponent('spectrometer'))?.primitive.kind,
    ).toBe('finite-optical-surface')
    expect(componentToGeometryCandidate(getComponent('laser'))).toBeNull()
    expect(
      componentToGeometryCandidate(getComponent('dichroic'))?.primitive.kind,
    ).toBe('finite-optical-surface')
    expect(
      componentToGeometryCandidate(getComponent('objective'))?.primitive.kind,
    ).toBe('finite-optical-surface')
    expect(
      componentToGeometryCandidate(getComponent('filter'))?.primitive.kind,
    ).toBe('finite-optical-surface')
  })

  it('uses the stable component ID as candidate key', () => {
    const mirror = getComponent('mirror')
    expect(componentToGeometryCandidate(mirror)?.key).toBe(mirror.id)
  })

  it('ignores disabled components', () => {
    const mirror = OpticalComponentSchema.parse({
      ...getComponent('mirror'),
      enabled: false,
    })
    expect(componentToGeometryCandidate(mirror)).toBeNull()
  })

  it('returns candidates in deterministic key order', () => {
    const candidates = buildComponentGeometryCandidates([
      getComponent('spectrometer'),
      getComponent('sample'),
      getComponent('mirror'),
    ])
    expect(candidates.map((candidate) => candidate.key)).toEqual([
      'component:mirror',
      'component:sample',
      'component:spectrometer',
    ])
  })
})
