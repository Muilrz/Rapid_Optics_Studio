import {
  ComponentIdSchema,
  OpticalComponentSchema,
  type ComponentId,
  type OpticalComponent,
  type OpticalComponentType,
  type OpticalScene,
  type Vec2,
} from '../../core/optics'

export type InspectorParameterField =
  | {
      readonly kind: 'number'
      readonly key: string
      readonly label: string
      readonly unit?: string
      readonly step?: number
      readonly visibleWhen?: { readonly key: string; readonly value: string }
    }
  | {
      readonly kind: 'text'
      readonly key: string
      readonly label: string
    }
  | {
      readonly kind: 'select'
      readonly key: string
      readonly label: string
      readonly options: readonly {
        readonly value: string
        readonly label: string
      }[]
    }
  | {
      readonly kind: 'readonly'
      readonly key: string
      readonly label: string
    }

interface ComponentCreationDefaults {
  readonly enabled: boolean
  readonly rotation_deg: number
  readonly aperture_mm: number
  readonly parameters: Readonly<Record<string, unknown>>
}

export interface ComponentDefinition {
  readonly type: OpticalComponentType
  readonly displayName: string
  readonly creation: ComponentCreationDefaults
  readonly parameterFields: readonly InspectorParameterField[]
}

const numberField = (
  key: string,
  label: string,
  unit?: string,
  step?: number,
  visibleWhen?: { readonly key: string; readonly value: string },
): InspectorParameterField => ({
  kind: 'number',
  key,
  label,
  unit,
  step,
  visibleWhen,
})

const DEFAULT_ENABLED = true

export const COMPONENT_DEFINITIONS = Object.freeze({
  laser: {
    type: 'laser',
    displayName: 'Laser',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 10,
      parameters: { wavelength_nm: 532, power_mw: 10 },
    },
    parameterFields: [
      numberField('wavelength_nm', 'Wavelength', 'nm', 1),
      numberField('power_mw', 'Power', 'mW', 0.1),
    ],
  },
  mirror: {
    type: 'mirror',
    displayName: 'Mirror',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 25,
      parameters: { reflectivity: 1 },
    },
    parameterFields: [numberField('reflectivity', 'Reflectivity', undefined, 0.01)],
  },
  dichroic: {
    type: 'dichroic',
    displayName: 'Dichroic',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 25,
      parameters: {
        excitation_reflectivity: 0.99,
        excitation_transmission: 0.01,
        raman_transmission: 1,
      },
    },
    parameterFields: [
      numberField('excitation_reflectivity', 'Excitation reflectivity', undefined, 0.01),
      numberField('excitation_transmission', 'Excitation transmission', undefined, 0.01),
      numberField('raman_transmission', 'Sample-return transmission', undefined, 0.01),
    ],
  },
  objective: {
    type: 'objective',
    displayName: 'Objective',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 20,
      parameters: { focal_length_mm: 75, numerical_aperture: 0.25 },
    },
    parameterFields: [
      numberField('focal_length_mm', 'Focal length', 'mm', 1),
      numberField('numerical_aperture', 'Numerical aperture', undefined, 0.01),
    ],
  },
  sample: {
    type: 'sample',
    displayName: 'Sample',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 10,
      parameters: { material_id: 'material:silicon' },
    },
    parameterFields: [{ kind: 'text', key: 'material_id', label: 'Material ID' }],
  },
  filter: {
    type: 'filter',
    displayName: 'Edge Filter',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 25,
      parameters: {
        raman_transmission: 1,
        rayleigh_suppression_od: 6,
        leakage_model: 'angle-dependent',
        leakage_midpoint_aoi_deg: 26,
        leakage_transition_width_deg: 2,
      },
    },
    parameterFields: [
      numberField('raman_transmission', 'Sample-return transmission', undefined, 0.01),
      numberField('rayleigh_suppression_od', 'Rayleigh suppression', 'OD', 0.1),
      {
        kind: 'select',
        key: 'leakage_model',
        label: 'Leakage model',
        options: [
          { value: 'constant', label: 'Constant' },
          { value: 'angle-dependent', label: 'Angle-dependent' },
        ],
      },
      numberField(
        'leakage_midpoint_aoi_deg',
        'Leakage midpoint AOI',
        'deg',
        0.5,
        { key: 'leakage_model', value: 'angle-dependent' },
      ),
      numberField(
        'leakage_transition_width_deg',
        'Leakage transition width',
        'deg',
        0.5,
        { key: 'leakage_model', value: 'angle-dependent' },
      ),
    ],
  },
  spectrometer: {
    type: 'spectrometer',
    displayName: 'Spectrometer',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 20,
      parameters: { optical_throughput: 1, acceptance_half_angle_deg: 90 },
    },
    parameterFields: [
      numberField('optical_throughput', 'Optical throughput', undefined, 0.01),
      numberField('acceptance_half_angle_deg', 'Acceptance half-angle', 'deg', 1),
    ],
  },
  prism: {
    type: 'prism',
    displayName: 'Prism',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 25,
      parameters: { deflection_angle_deg: 15 },
    },
    parameterFields: [numberField('deflection_angle_deg', 'Deflection angle', 'deg', 1)],
  },
  'beam-splitter': {
    type: 'beam-splitter',
    displayName: 'Beam Splitter',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 25,
      parameters: { transmission_ratio: 0.5, reflection_ratio: 0.5 },
    },
    parameterFields: [
      numberField('transmission_ratio', 'Transmission ratio', undefined, 0.01),
      numberField('reflection_ratio', 'Reflection ratio', undefined, 0.01),
    ],
  },
  pinhole: {
    type: 'pinhole',
    displayName: 'Pinhole',
    creation: {
      enabled: DEFAULT_ENABLED,
      rotation_deg: 0,
      aperture_mm: 10,
      parameters: { model: 'geometric-aperture' },
    },
    parameterFields: [{ kind: 'readonly', key: 'model', label: 'Model' }],
  },
} satisfies Record<OpticalComponentType, ComponentDefinition>)

const DEFAULT_VISUALIZATION = Object.freeze({
  beam_height_mm: 50,
  post_height_mm: 50,
  visual_depth_mm: 20,
  holder: true,
})

export const createStudioComponent = (
  type: OpticalComponentType,
  id: ComponentId,
  position_mm: Vec2,
): OpticalComponent => {
  const definition = COMPONENT_DEFINITIONS[type]
  return OpticalComponentSchema.parse({
    id,
    type,
    name: definition.displayName,
    enabled: definition.creation.enabled,
    transform: {
      x_mm: position_mm.x,
      y_mm: position_mm.y,
      rotation_deg: definition.creation.rotation_deg,
    },
    geometry: { aperture_mm: definition.creation.aperture_mm },
    visualization: DEFAULT_VISUALIZATION,
    metadata: { source: 'studio-component-library' },
    parameters: definition.creation.parameters,
  })
}

export interface ComponentIdAllocator {
  next(existingScene: OpticalScene): ComponentId
  observe(scene: OpticalScene): void
}

const STUDIO_ID_PATTERN = /^component:studio:(\d+)$/

const highestStudioSequence = (scene: OpticalScene): number =>
  scene.components.reduce((highest, component) => {
    const match = STUDIO_ID_PATTERN.exec(component.id)
    if (!match) return highest
    const sequence = Number(match[1])
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest
  }, 0)

/** Store-local monotonic IDs: deletion never moves the sequence backwards. */
export const createComponentIdAllocator = (
  initialScene: OpticalScene,
): ComponentIdAllocator => {
  let nextSequence = highestStudioSequence(initialScene) + 1

  const allocator: ComponentIdAllocator = {
    next: (existingScene) => {
      const existingIds = new Set([
        ...existingScene.breadboards.map(({ id }) => id),
        ...existingScene.components.map(({ id }) => id),
      ])
      let id: ComponentId
      do {
        id = ComponentIdSchema.parse(
          `component:studio:${nextSequence.toString().padStart(6, '0')}`,
        )
        nextSequence += 1
      } while (existingIds.has(id))
      return id
    },
    observe: (scene) => {
      nextSequence = Math.max(nextSequence, highestStudioSequence(scene) + 1)
    },
  }
  return Object.freeze(allocator)
}
