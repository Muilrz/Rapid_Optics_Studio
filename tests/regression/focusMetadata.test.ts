import { describe, expect, it } from 'vitest'
import { OpticalSceneSchema, traceOpticalScene } from '../../src/core/optics'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'
import {
  createFocusScene,
  hardeningComponent,
} from '../fixtures/hardeningScenes'

const finalFocus = (sampleX_mm: number, objectives: readonly number[] = [10]) => {
  const result = traceOpticalScene(
    createFocusScene(sampleX_mm, objectives),
    DEFAULT_SIMULATION_CONFIGURATION,
  )
  return {
    result,
    focus: result.rays.at(-1)?.focusMetadata,
  }
}

describe('Objective and defocus metadata regression', () => {
  it.each([
    {
      label: 'nominal',
      sampleX_mm: 85,
      actualDistance_mm: 75,
      defocus_mm: 0,
    },
    {
      label: 'sample forward',
      sampleX_mm: 80,
      actualDistance_mm: 70,
      defocus_mm: -5,
    },
    {
      label: 'sample backward',
      sampleX_mm: 90,
      actualDistance_mm: 80,
      defocus_mm: 5,
    },
  ])('records $label distance without calculating efficiency', ({
    sampleX_mm,
    actualDistance_mm,
    defocus_mm,
  }) => {
    const { result, focus } = finalFocus(sampleX_mm)

    expect(focus).toMatchObject({
      objectiveComponentId: 'component:focus-objective:1',
      sampleComponentId: 'component:focus-sample',
      targetFocalDistance_mm: 75,
      actualDistance_mm,
      defocus_mm,
    })
    expect(
      result.rays
        .filter((ray) => ray.kind === 'sample-return-placeholder')
        .every((ray) => ray.focusMetadata?.defocus_mm === defocus_mm),
    ).toBe(true)
    expect(JSON.stringify(focus)).not.toMatch(/efficiency/i)
  })

  it('keeps the last encountered Objective association through reverse passes', () => {
    const { result, focus } = finalFocus(95, [10, 20])
    const reverseObjectiveEvents = result.events.filter(
      (event) =>
        event.kind === 'component-interaction' &&
        event.componentType === 'objective',
    )

    expect(reverseObjectiveEvents.map((event) => event.componentId)).toEqual([
      'component:focus-objective:1',
      'component:focus-objective:2',
      'component:focus-objective:2',
      'component:focus-objective:1',
    ])
    expect(focus).toMatchObject({
      objectiveComponentId: 'component:focus-objective:2',
      objectivePosition_mm: { x: 20, y: 0 },
      actualDistance_mm: 75,
      defocus_mm: 0,
    })
  })

  it('does not leak focus metadata into an unrelated source branch', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent(
          'component:a-focused-laser',
          'laser',
          0,
          0,
          0,
          1,
          { wavelength_nm: 532, power_mw: 10 },
        ),
        hardeningComponent(
          'component:b-unrelated-laser',
          'laser',
          0,
          50,
          0,
          1,
          { wavelength_nm: 532, power_mw: 10 },
        ),
        hardeningComponent(
          'component:focus-objective',
          'objective',
          10,
          0,
          90,
          20,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
        hardeningComponent(
          'component:focus-sample',
          'sample',
          85,
          0,
          0,
          10,
          { material_id: 'material:test' },
        ),
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
    const unrelatedRays = result.rays.filter(
      (ray) => ray.sourceComponentId === 'component:b-unrelated-laser',
    )

    expect(unrelatedRays).toHaveLength(1)
    expect(unrelatedRays[0]?.focusMetadata).toBeUndefined()
    expect(result.rays.some((ray) => ray.focusMetadata !== undefined)).toBe(true)
  })
})
