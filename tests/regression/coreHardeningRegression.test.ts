import { describe, expect, it } from 'vitest'
import { OpticalSceneSchema, traceOpticalScene } from '../../src/core/optics'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'

describe('Phase 1E default-scene hardening regressions', () => {
  it('breaks the Raman path when the key Mirror is rotated out of alignment', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: DEFAULT_RAMAN_SCENE.breadboards,
      components: DEFAULT_RAMAN_SCENE.components.map((component) =>
        component.type === 'mirror'
          ? {
              ...component,
              transform: { ...component.transform, rotation_deg: 0 },
            }
          : component,
      ),
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(
      result.events.filter(
        (event) => event.kind === 'component-interaction',
      ),
    ).toHaveLength(0)
    expect(
      result.events.some(
        (event) =>
          event.kind === 'termination' && event.reason === 'detected',
      ),
    ).toBe(false)
    expect(result.events.at(-1)).toMatchObject({
      kind: 'termination',
      reason: 'escaped-scene',
    })
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.hitComponentId).toBeNull()
  })

  it('is independent of default component array order', () => {
    const reordered = OpticalSceneSchema.parse({
      breadboards: DEFAULT_RAMAN_SCENE.breadboards,
      components: [...DEFAULT_RAMAN_SCENE.components].reverse(),
    })

    expect(
      traceOpticalScene(reordered, DEFAULT_SIMULATION_CONFIGURATION),
    ).toEqual(
      traceOpticalScene(
        DEFAULT_RAMAN_SCENE,
        DEFAULT_SIMULATION_CONFIGURATION,
      ),
    )
  })

  it('keeps the formal fixture mm-based with stable IDs and no pixel physics', () => {
    expect(DEFAULT_RAMAN_SCENE.components.map((component) => component.id)).toEqual([
      'component:laser',
      'component:mirror',
      'component:dichroic',
      'component:objective',
      'component:sample',
      'component:filter',
      'component:spectrometer',
    ])
    expect(
      DEFAULT_RAMAN_SCENE.components.map((component) => component.transform),
    ).toEqual([
      { x_mm: 50, y_mm: -75, rotation_deg: 0 },
      { x_mm: 200, y_mm: -75, rotation_deg: -45 },
      { x_mm: 200, y_mm: -200, rotation_deg: -45 },
      { x_mm: 325, y_mm: -200, rotation_deg: -90 },
      { x_mm: 400, y_mm: -200, rotation_deg: -90 },
      { x_mm: 125, y_mm: -200, rotation_deg: -90 },
      { x_mm: 50, y_mm: -200, rotation_deg: -90 },
    ])
    expect(JSON.stringify(DEFAULT_RAMAN_SCENE)).not.toMatch(/pixel|_px|28px/i)
  })
})
