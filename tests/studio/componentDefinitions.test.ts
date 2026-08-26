import { describe, expect, it } from 'vitest'
import {
  ComponentIdSchema,
  OpticalComponentSchema,
  OpticalSceneSchema,
  type OpticalComponentType,
} from '../../src/core/optics'
import {
  COMPONENT_DEFINITIONS,
  createComponentIdAllocator,
  createStudioComponent,
} from '../../src/project/components/componentDefinitions'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'

const types = Object.keys(COMPONENT_DEFINITIONS) as OpticalComponentType[]

describe('Studio component definitions and factory', () => {
  it('defines all ten component types with complete display names', () => {
    expect(types).toEqual([
      'laser',
      'mirror',
      'dichroic',
      'objective',
      'sample',
      'filter',
      'spectrometer',
      'prism',
      'beam-splitter',
      'pinhole',
    ])
    expect(types.map((type) => COMPONENT_DEFINITIONS[type].displayName)).toEqual(
      [
        'Laser',
        'Mirror',
        'Dichroic',
        'Objective',
        'Sample',
        'Edge Filter',
        'Spectrometer',
        'Prism',
        'Beam Splitter',
        'Pinhole',
      ],
    )
  })

  it('creates schema-valid defaults for every type at a world-mm position', () => {
    for (const [index, type] of types.entries()) {
      const id = ComponentIdSchema.parse(`component:test:${index + 1}`)
      const component = createStudioComponent(type, id, {
        x: 12.5,
        y: -37.25,
      })

      expect(OpticalComponentSchema.parse(component)).toEqual(component)
      expect(component.type).toBe(type)
      expect(component.id).toBe(id)
      expect(component.transform.x_mm).toBe(12.5)
      expect(component.transform.y_mm).toBe(-37.25)
      expect(JSON.stringify(component)).not.toMatch(/(?:x|y)_px/)
    }
  })

  it('allocates monotonic unique IDs without array-index or deletion reuse', () => {
    const allocator = createComponentIdAllocator(DEFAULT_RAMAN_SCENE)
    const first = allocator.next(DEFAULT_RAMAN_SCENE)
    const second = allocator.next(DEFAULT_RAMAN_SCENE)

    expect(first).toBe('component:studio:000001')
    expect(second).toBe('component:studio:000002')
    expect(second).not.toBe(first)

    const sceneWithHigherId = OpticalSceneSchema.parse({
      ...DEFAULT_RAMAN_SCENE,
      components: [
        ...DEFAULT_RAMAN_SCENE.components,
        createStudioComponent(
          'mirror',
          ComponentIdSchema.parse('component:studio:000010'),
          { x: 0, y: 0 },
        ),
      ],
    })
    allocator.observe(sceneWithHigherId)
    expect(allocator.next(DEFAULT_RAMAN_SCENE)).toBe(
      'component:studio:000011',
    )
  })

  it('describes each actual parameter key used by the Inspector', () => {
    for (const [index, type] of types.entries()) {
      const component = createStudioComponent(
        type,
        ComponentIdSchema.parse(`component:fields:${index + 1}`),
        { x: 0, y: 0 },
      )
      const parameterKeys = new Set(Object.keys(component.parameters))
      for (const field of COMPONENT_DEFINITIONS[type].parameterFields) {
        expect(parameterKeys.has(field.key), `${type}.${field.key}`).toBe(true)
      }
    }
  })
})
