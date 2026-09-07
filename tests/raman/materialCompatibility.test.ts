import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  SampleComponentSchema,
  type SampleComponent,
} from '../../src/core/optics'
import {
  BUILT_IN_RAMAN_MATERIAL_REGISTRY,
  UnknownRamanMaterialError,
  createRamanMaterialRegistry,
  resolveSampleMaterial,
} from '../../src/core/raman'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'

const defaultSample = DEFAULT_RAMAN_SCENE.components.find(
  (component): component is SampleComponent => component.type === 'sample',
)

describe('Raman material registry', () => {
  it('provides stable lookup and strict unknown-ID behavior', () => {
    expect(BUILT_IN_RAMAN_MATERIAL_REGISTRY.ids).toEqual([
      'material:silicon',
      'material:polystyrene',
      'material:calcite',
    ])
    expect(
      BUILT_IN_RAMAN_MATERIAL_REGISTRY.find('material:polystyrene')?.name,
    ).toBe('Polystyrene')
    expect(BUILT_IN_RAMAN_MATERIAL_REGISTRY.find('invalid material id')).toBe(
      undefined,
    )
    expect(() =>
      BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve('material:missing'),
    ).toThrow(UnknownRamanMaterialError)
    expect(() =>
      BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve('invalid material id'),
    ).toThrow()
  })

  it('rejects duplicate IDs and malformed definitions during construction', () => {
    const material = BUILT_IN_RAMAN_MATERIAL_REGISTRY.materials[0]!

    expect(() => createRamanMaterialRegistry([material, material])).toThrow(
      /Duplicate Raman material ID/,
    )
    expect(() =>
      createRamanMaterialRegistry([
        { ...material, fluorescence_level: Number.NaN },
      ]),
    ).toThrow()
  })

  it('supports validated custom material registries without changing built-ins', () => {
    const customRegistry = createRamanMaterialRegistry([
      {
        id: 'material:custom-reference',
        name: 'Custom reference',
        fluorescence_level: 0.2,
        peaks: [
          {
            shift_cm_1: 123.4,
            relative_intensity: 0.8,
            width_cm_1: 7,
          },
        ],
      },
    ])

    expect(customRegistry.resolve('material:custom-reference').peaks[0]).toEqual(
      {
        shift_cm_1: 123.4,
        relative_intensity: 0.8,
        width_cm_1: 7,
      },
    )
    expect(BUILT_IN_RAMAN_MATERIAL_REGISTRY.find('material:custom-reference')).toBe(
      undefined,
    )
  })
})

describe('generic Sample to Raman material compatibility', () => {
  it('resolves the default Sample material reference to Silicon', () => {
    expect(defaultSample).toBeDefined()
    expect(resolveSampleMaterial(defaultSample!)).toBe(
      BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve('material:silicon'),
    )
  })

  it.each(BUILT_IN_RAMAN_MATERIAL_REGISTRY.ids)(
    'accepts and resolves Sample material_id %s',
    (material_id) => {
      const sample = SampleComponentSchema.parse({
        ...defaultSample,
        id: `component:sample:${material_id.split(':')[1]}`,
        parameters: { material_id },
      })

      expect(resolveSampleMaterial(sample).id).toBe(material_id)
    },
  )

  it('keeps generic scene validation independent from Raman registry membership', () => {
    const sample = SampleComponentSchema.parse({
      ...defaultSample,
      id: 'component:sample:external',
      parameters: { material_id: 'material:external-project-material' },
    })

    expect(
      OpticalSceneSchema.parse({ breadboards: [], components: [sample] })
        .components[0]?.type,
    ).toBe('sample')
    expect(() => resolveSampleMaterial(sample)).toThrow(
      UnknownRamanMaterialError,
    )
  })
})
