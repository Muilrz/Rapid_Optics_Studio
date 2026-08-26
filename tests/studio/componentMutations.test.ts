import { describe, expect, it } from 'vitest'
import {
  ComponentIdSchema,
  OpticalSceneSchema,
  Transform2DSchema,
  type OpticalComponent,
  type OpticalComponentType,
} from '../../src/core/optics'
import { createStudioComponent } from '../../src/project/components/componentDefinitions'
import {
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../../src/project/defaults/defaultRamanScene'
import { createStudioStore } from '../../src/store/studioStore'
import { createBranchingStressScene } from '../fixtures/hardeningScenes'

const componentOfType = <Type extends OpticalComponentType>(
  components: readonly OpticalComponent[],
  type: Type,
) => {
  const component = components.find((candidate) => candidate.type === type)
  expect(component).toBeDefined()
  return component as Extract<OpticalComponent, { type: Type }>
}

const isDetected = (store: ReturnType<typeof createStudioStore>) =>
  store
    .getState()
    .derived.trace.events.some(
      (event) => event.kind === 'termination' && event.reason === 'detected',
    )

describe('Studio component mutation boundaries', () => {
  it('adds at an explicit world position, selects, preserves siblings, and retraces', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const existingComponents = initial.authoritative.scene.components

    const id = initial.addComponent('mirror', { x: 250, y: -150 })
    const changed = store.getState()
    const added = changed.authoritative.scene.components.at(-1)

    expect(id).toBe('component:studio:000001')
    expect(added?.id).toBe(id)
    expect(added?.type).toBe('mirror')
    expect(added?.transform.x_mm).toBe(250)
    expect(added?.transform.y_mm).toBe(-150)
    expect(changed.editor.selectedComponentIds).toEqual([id])
    expect(changed.editor.primaryComponentId).toBe(id)
    expect(changed.authoritative.scene).not.toBe(initial.authoritative.scene)
    expect(changed.authoritative.scene.components[0]).toBe(existingComponents[0])
    expect(changed.derived.trace).not.toBe(initial.derived.trace)
    expect(changed.derived.sceneRevision).toBe(changed.authoritative.revision)
  })

  it('deletes by stable ID, clears selection, retraces, and never reuses the ID', () => {
    const store = createStudioStore()
    const firstId = store.getState().addComponent('mirror', { x: 0, y: 0 })
    const preservedLaser = componentOfType(
      store.getState().authoritative.scene.components,
      'laser',
    )
    const traceBeforeDelete = store.getState().derived.trace

    expect(store.getState().deleteSelectedComponents()).toBe(true)
    const deleted = store.getState()
    expect(
      deleted.authoritative.scene.components.some(({ id }) => id === firstId),
    ).toBe(false)
    expect(deleted.editor.selectedComponentIds).toEqual([])
    expect(deleted.editor.primaryComponentId).toBeNull()
    expect(componentOfType(deleted.authoritative.scene.components, 'laser')).toBe(
      preservedLaser,
    )
    expect(deleted.derived.trace).not.toBe(traceBeforeDelete)

    const secondId = deleted.addComponent('mirror', { x: 0, y: 0 })
    expect(secondId).toBe('component:studio:000002')
    const beforeMissingDelete = store.getState()
    expect(
      beforeMissingDelete.deleteComponent(
        ComponentIdSchema.parse('component:missing'),
      ),
    ).toBe(false)
    expect(store.getState()).toBe(beforeMissingDelete)
  })

  it('updates name without retracing but enabled state with retracing', () => {
    const store = createStudioStore()
    const mirror = componentOfType(
      store.getState().authoritative.scene.components,
      'mirror',
    )
    const initialTrace = store.getState().derived.trace

    store.getState().updateComponentCommon(mirror.id, { name: 'Steering Mirror' })
    const renamed = store.getState()
    expect(
      componentOfType(renamed.authoritative.scene.components, 'mirror').name,
    ).toBe('Steering Mirror')
    expect(renamed.derived.trace).toBe(initialTrace)
    expect(renamed.derived.sceneRevision).toBe(renamed.authoritative.revision)

    store.getState().updateComponentCommon(mirror.id, { enabled: false })
    expect(store.getState().derived.trace).not.toBe(initialTrace)
    expect(isDetected(store)).toBe(false)
    store.getState().updateComponentCommon(mirror.id, { enabled: true })
    expect(isDetected(store)).toBe(true)
  })

  it('commits common transform and aperture fields through the same schema', () => {
    const store = createStudioStore()
    const mirror = componentOfType(
      store.getState().authoritative.scene.components,
      'mirror',
    )

    store.getState().updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({ x_mm: 210, y_mm: -80, rotation_deg: 315 }),
    )
    store.getState().updateComponentGeometry(mirror.id, 30)
    const changed = componentOfType(
      store.getState().authoritative.scene.components,
      'mirror',
    )

    expect(changed.transform).toEqual({
      x_mm: 210,
      y_mm: -80,
      rotation_deg: -45,
    })
    expect(changed.geometry.aperture_mm).toBe(30)
    expect(changed.id).toBe(mirror.id)
  })

  it('rejects invalid numeric and coupled values without touching authoritative state', () => {
    const beamSplitter = createStudioComponent(
      'beam-splitter',
      ComponentIdSchema.parse('component:test:splitter'),
      { x: 10, y: 0 },
    )
    const scene = OpticalSceneSchema.parse({ breadboards: [], components: [beamSplitter] })
    const store = createStudioStore(scene)

    for (const invalidAperture of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const before = store.getState()
      expect(() =>
        before.updateComponentGeometry(beamSplitter.id, invalidAperture),
      ).toThrow()
      expect(store.getState()).toBe(before)
    }

    const beforeCoupled = store.getState()
    expect(() =>
      beforeCoupled.updateComponentParameters(beamSplitter.id, {
        transmission_ratio: 0.8,
        reflection_ratio: 0.4,
      }),
    ).toThrow(/sum to at most 1/)
    expect(store.getState()).toBe(beforeCoupled)

    store.getState().updateComponentParameters(beamSplitter.id, {
      transmission_ratio: 0.6,
      reflection_ratio: 0.3,
    })
    expect(
      componentOfType(
        store.getState().authoritative.scene.components,
        'beam-splitter',
      ).parameters,
    ).toEqual({ transmission_ratio: 0.6, reflection_ratio: 0.3 })
  })

  it('accepts valid type-specific parameter contracts for all ten types', () => {
    const validParameters: Record<OpticalComponentType, Record<string, unknown>> = {
      laser: { wavelength_nm: 633, power_mw: 5 },
      mirror: { reflectivity: 0.8 },
      dichroic: {
        excitation_reflectivity: 0.7,
        excitation_transmission: 0.2,
        raman_transmission: 0.9,
      },
      objective: { focal_length_mm: 50, numerical_aperture: 0.3 },
      sample: { material_id: 'material:polystyrene' },
      filter: {
        raman_transmission: 0.9,
        rayleigh_suppression_od: 5,
        leakage_model: 'constant',
      },
      spectrometer: {
        optical_throughput: 0.8,
        acceptance_half_angle_deg: 45,
      },
      prism: { deflection_angle_deg: 20 },
      'beam-splitter': { transmission_ratio: 0.6, reflection_ratio: 0.3 },
      pinhole: { model: 'geometric-aperture' },
    }

    for (const [index, type] of (
      Object.keys(validParameters) as OpticalComponentType[]
    ).entries()) {
      const component = createStudioComponent(
        type,
        ComponentIdSchema.parse(`component:parameter:${index + 1}`),
        { x: 0, y: 0 },
      )
      const store = createStudioStore(
        OpticalSceneSchema.parse({ breadboards: [], components: [component] }),
      )
      store
        .getState()
        .updateComponentParameters(component.id, validParameters[type])
      expect(
        store.getState().authoritative.scene.components[0]?.parameters,
      ).toEqual(validParameters[type])
    }
  })

  it('drives Mirror and Laser power changes through the formal tracer', () => {
    const store = createStudioStore()
    const mirror = componentOfType(
      store.getState().authoritative.scene.components,
      'mirror',
    )
    const laser = componentOfType(
      store.getState().authoritative.scene.components,
      'laser',
    )

    store.getState().updateComponentParameters(mirror.id, { reflectivity: 0.5 })
    const mirrorEvent = store.getState().derived.trace.events.find(
      (event) =>
        event.kind === 'component-interaction' && event.componentId === mirror.id,
    )
    expect(mirrorEvent?.kind).toBe('component-interaction')
    if (mirrorEvent?.kind === 'component-interaction') {
      expect(mirrorEvent.power.incoming_power_mw).toBe(10)
      expect(mirrorEvent.power.outgoing_power_mw).toBe(5)
    }

    store.getState().updateComponentParameters(laser.id, {
      ...laser.parameters,
      power_mw: 4,
    })
    const sourceRay = store
      .getState()
      .derived.trace.rays.find((ray) => ray.generation === 0)
    expect(sourceRay?.power_mw).toBe(4)
  })

  it('updates Beam Splitter branch power and Objective focus metadata', () => {
    const branchStore = createStudioStore(
      createBranchingStressScene(1),
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const splitter = componentOfType(
      branchStore.getState().authoritative.scene.components,
      'beam-splitter',
    )
    branchStore.getState().updateComponentParameters(splitter.id, {
      transmission_ratio: 0.5,
      reflection_ratio: 0.25,
    })
    const splitterEvent = branchStore.getState().derived.trace.events.find(
      (event) =>
        event.kind === 'component-interaction' && event.componentId === splitter.id,
    )
    expect(splitterEvent?.kind).toBe('component-interaction')
    if (splitterEvent?.kind === 'component-interaction') {
      expect(splitterEvent.power.outgoing_power_mw).toBe(7.5)
    }

    const objectiveStore = createStudioStore()
    const objective = componentOfType(
      objectiveStore.getState().authoritative.scene.components,
      'objective',
    )
    objectiveStore.getState().updateComponentParameters(objective.id, {
      ...objective.parameters,
      focal_length_mm: 50,
    })
    expect(
      objectiveStore
        .getState()
        .derived.trace.rays.some(
          (ray) => ray.focusMetadata?.targetFocalDistance_mm === 50,
        ),
    ).toBe(true)
  })
})
