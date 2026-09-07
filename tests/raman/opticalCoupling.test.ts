import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  traceOpticalScene,
  type OpticalComponent,
  type OpticalScene,
} from '../../src/core/optics'
import {
  BUILT_IN_RAMAN_MATERIAL_REGISTRY,
  RAMAN_OPTICAL_COUPLING_PARAMETERS,
  buildRamanOpticalContexts,
  createAutoSpectrumAxis,
  createSpectrumConfigurationFromOpticalContext,
  synthesizeExpectedRamanSpectrum,
} from '../../src/core/raman'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import {
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'
import {
  createFocusScene,
  hardeningComponent,
} from '../fixtures/hardeningScenes'

const updateComponent = (
  scene: OpticalScene,
  id: string,
  update: (component: OpticalComponent) => unknown,
): OpticalScene =>
  OpticalSceneSchema.parse({
    ...scene,
    components: scene.components.map((component) =>
      component.id === id ? update(component) : component,
    ),
  })

const traceAndContexts = (scene: OpticalScene) => {
  const trace = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
  return {
    trace,
    contexts: buildRamanOpticalContexts(scene, trace),
  }
}

const defaultContext = (scene: OpticalScene = DEFAULT_RAMAN_SCENE) => {
  const { contexts } = traceAndContexts(scene)
  expect(contexts).toHaveLength(1)
  return contexts[0]!
}

describe('Optical Trace to Raman context coupling', () => {
  it('builds the valid default Sample, focus, Raman, and Rayleigh context', () => {
    const context = defaultContext()

    expect(context).toMatchObject({
      model_version: 'raman-optical-context-v1',
      path_state: 'valid-signal-path',
      sample_component_id: 'component:sample',
      material_id: 'material:silicon',
      source_component_id: 'component:laser',
      excitation_reached_sample: true,
      excitation_power_at_sample_mw: 9.9,
      focus: {
        state: 'lineage-focus',
        objective_component_id: 'component:objective',
        target_focal_distance_mm: 75,
        actual_distance_mm: 75,
        defocus_mm: 0,
        z_r_mm: 37.5,
        efficiency: 1,
      },
      effective_excitation_power_mw: 9.9,
      raman_return: {
        path_reaches_spectrometer: true,
        power_at_spectrometer_input_mw: 9.9,
        throughput_to_spectrometer_input: 1,
        detected_return_probe_power_mw: 9.9,
        throughput: 1,
        detected_effective_excitation_power_mw: 9.9,
        spectrometer_component_ids: ['component:spectrometer'],
      },
      rayleigh_return: {
        geometric_path_reaches_spectrometer: true,
      },
    })
    expect(context.rayleigh_return.leakage_throughput).toBeGreaterThan(0)
    expect(context.rayleigh_return.leakage_throughput).toBeLessThan(0.000001)
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.focus)).toBe(true)
  })

  it('bridges the optical context into Phase 3B without detector physics', () => {
    const context = defaultContext()
    const material = BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve(
      context.material_id,
    )
    const axis = createAutoSpectrumAxis(material, 300)
    const configuration = createSpectrumConfigurationFromOpticalContext(context)
    const spectrum = synthesizeExpectedRamanSpectrum({
      material,
      excitation_wavelength_nm: context.excitation_wavelength_nm!,
      axis,
      configuration,
    })

    expect(configuration.effective_excitation_scale).toBe(
      context.raman_return.detected_effective_excitation_power_mw,
    )
    expect(configuration.rayleigh_leakage_scale).toBe(
      context.rayleigh_return.detected_effective_leakage_power_mw,
    )
    expect(RAMAN_OPTICAL_COUPLING_PARAMETERS).toStrictEqual({
      model_version: 'raman-optical-context-v1',
      provenance: 'Raman Sandbox normalized trace-power coupling with CR = 1',
      effective_excitation_scale_per_mw: 1,
      rayleigh_leakage_scale_per_mw: 1,
      interpretation: 'provisional semi-quantitative coupling',
    })
    expect(Math.max(...spectrum.components.raman)).toBeGreaterThan(0)
    expect(Math.max(...spectrum.components.rayleigh)).toBeGreaterThan(0)
    expect(JSON.stringify(configuration)).not.toMatch(
      /qe|gain|integration|dark|noise|full.well/i,
    )
  })

  it('reduces focus and effective excitation continuously under defocus', () => {
    const contexts = [0, 5, 10, 20, 37.5].map((defocus_mm) => {
      const scene = updateComponent(
        DEFAULT_RAMAN_SCENE,
        'component:sample',
        (component) => ({
          ...component,
          transform: {
            ...component.transform,
            x_mm: component.transform.x_mm + defocus_mm,
          },
        }),
      )
      return defaultContext(scene)
    })

    expect(contexts[0]!.focus.efficiency).toBe(1)
    for (let index = 1; index < contexts.length; index += 1) {
      expect(contexts[index]!.focus.defocus_mm).toBe([0, 5, 10, 20, 37.5][index])
      expect(contexts[index]!.focus.efficiency).toBeLessThan(
        contexts[index - 1]!.focus.efficiency,
      )
      expect(contexts[index]!.effective_excitation_power_mw).toBeLessThan(
        contexts[index - 1]!.effective_excitation_power_mw,
      )
    }
  })

  it('reports zero Raman generation when excitation is broken and restores it', () => {
    const brokenScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:mirror',
      (component) => ({
        ...component,
        transform: { ...component.transform, rotation_deg: 0 },
      }),
    )
    const broken = defaultContext(brokenScene)
    const restored = defaultContext(DEFAULT_RAMAN_SCENE)

    expect(broken).toMatchObject({
      path_state: 'no-excitation-path',
      excitation_reached_sample: false,
      excitation_power_at_sample_mw: 0,
      effective_excitation_power_mw: 0,
      raman_return: {
        path_reaches_spectrometer: false,
        power_at_spectrometer_input_mw: 0,
        throughput_to_spectrometer_input: 0,
        detected_effective_excitation_power_mw: 0,
      },
    })
    expect(restored.path_state).toBe('valid-signal-path')
    expect(restored.effective_excitation_power_mw).toBeGreaterThan(0)
    expect(
      createSpectrumConfigurationFromOpticalContext(broken)
        .effective_excitation_scale,
    ).toBe(0)
  })

  it('derives the same continuous defocus from Objective movement', () => {
    const moveObjective = (deltaX_mm: number) =>
      defaultContext(
        updateComponent(
          DEFAULT_RAMAN_SCENE,
          'component:objective',
          (component) => ({
            ...component,
            transform: {
              ...component.transform,
              x_mm: component.transform.x_mm + deltaX_mm,
            },
          }),
        ),
      )
    const nominal = moveObjective(0)
    const fiveMillimetres = moveObjective(-5)
    const tenMillimetres = moveObjective(-10)

    expect(fiveMillimetres.focus.defocus_mm).toBe(5)
    expect(tenMillimetres.focus.defocus_mm).toBe(10)
    expect(fiveMillimetres.focus.efficiency).toBeLessThan(
      nominal.focus.efficiency,
    )
    expect(tenMillimetres.focus.efficiency).toBeLessThan(
      fiveMillimetres.focus.efficiency,
    )
  })

  it('reports zero detected Raman signal when return geometry is broken', () => {
    const brokenScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:spectrometer',
      (component) => ({
        ...component,
        transform: { ...component.transform, y_mm: -100 },
      }),
    )
    const broken = defaultContext(brokenScene)
    const restored = defaultContext(DEFAULT_RAMAN_SCENE)

    expect(broken.excitation_power_at_sample_mw).toBeGreaterThan(0)
    expect(broken).toMatchObject({
      path_state: 'excited-no-return-path',
      raman_return: {
        path_reaches_spectrometer: false,
        power_at_spectrometer_input_mw: 0,
        throughput_to_spectrometer_input: 0,
        detected_return_probe_power_mw: 0,
        throughput: 0,
        detected_effective_excitation_power_mw: 0,
      },
    })
    expect(
      createSpectrumConfigurationFromOpticalContext(broken)
        .effective_excitation_scale,
    ).toBe(0)
    expect(restored.raman_return.detected_effective_excitation_power_mw).toBeGreaterThan(
      0,
    )
  })

  it('reflects Filter Raman transmission and AOI leakage independently', () => {
    const halfRamanScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:filter',
      (component) => {
        if (component.type !== 'filter') throw new Error('Expected Filter.')
        return {
          ...component,
          parameters: { ...component.parameters, raman_transmission: 0.5 },
        }
      },
    )
    const highLeakageScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:filter',
      (component) => ({
        ...component,
        transform: { ...component.transform, rotation_deg: -60 },
      }),
    )
    const baseline = defaultContext()
    const halfRaman = defaultContext(halfRamanScene)
    const highLeakage = defaultContext(highLeakageScene)

    expect(halfRaman.raman_return.throughput).toBeCloseTo(0.5, 12)
    expect(halfRaman.rayleigh_return.leakage_throughput).toBeCloseTo(
      baseline.rayleigh_return.leakage_throughput,
      12,
    )
    expect(highLeakage.raman_return.throughput).toBeCloseTo(1, 12)
    expect(highLeakage.rayleigh_return.leakage_throughput).toBeGreaterThan(
      baseline.rayleigh_return.leakage_throughput,
    )
  })

  it('reflects Dichroic Raman throughput and Rayleigh routing independently', () => {
    const halfRamanScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:dichroic',
      (component) => {
        if (component.type !== 'dichroic') throw new Error('Expected Dichroic.')
        return {
          ...component,
          parameters: { ...component.parameters, raman_transmission: 0.5 },
        }
      },
    )
    const higherLeakageScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:dichroic',
      (component) => {
        if (component.type !== 'dichroic') throw new Error('Expected Dichroic.')
        return {
          ...component,
          parameters: {
            ...component.parameters,
            excitation_reflectivity: 0.8,
            excitation_transmission: 0.2,
          },
        }
      },
    )
    const baseline = defaultContext()
    const halfRaman = defaultContext(halfRamanScene)
    const higherLeakage = defaultContext(higherLeakageScene)

    expect(halfRaman.raman_return.throughput).toBeCloseTo(0.5, 12)
    expect(higherLeakage.rayleigh_return.leakage_throughput).toBeGreaterThan(
      baseline.rayleigh_return.leakage_throughput,
    )
    expect(higherLeakage.excitation_power_at_sample_mw).toBeLessThan(
      baseline.excitation_power_at_sample_mw,
    )
  })
})

describe('lineage safety', () => {
  it('uses the last Objective on the actual ray lineage, not the first in the scene', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent(
          'component:unrelated-objective',
          'objective',
          10,
          50,
          90,
          20,
          { focal_length_mm: 20, numerical_aperture: 0.25 },
        ),
        hardeningComponent('component:lineage-laser', 'laser', 0, 0, 0, 1, {
          wavelength_nm: 532,
          power_mw: 10,
        }),
        hardeningComponent(
          'component:lineage-objective',
          'objective',
          10,
          0,
          90,
          20,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
        hardeningComponent(
          'component:lineage-sample',
          'sample',
          85,
          0,
          0,
          10,
          { material_id: 'material:silicon' },
        ),
      ],
    })
    const context = traceAndContexts(scene).contexts[0]!

    expect(context.focus).toMatchObject({
      state: 'lineage-focus',
      objective_component_id: 'component:lineage-objective',
      actual_distance_mm: 75,
      defocus_mm: 0,
    })
  })

  it('preserves the actual last Objective in the existing multiple-objective fixture', () => {
    const baseScene = createFocusScene(95, [10, 20])
    const scene = updateComponent(
      baseScene,
      'component:focus-sample',
      (component) => {
        if (component.type !== 'sample') throw new Error('Expected Sample.')
        return {
          ...component,
          parameters: { material_id: 'material:silicon' },
        }
      },
    )
    const context = traceAndContexts(scene).contexts[0]!

    expect(context.focus).toMatchObject({
      objective_component_id: 'component:focus-objective:2',
      actual_distance_mm: 75,
      defocus_mm: 0,
    })
  })

  it('keeps hit and unhit Samples as separate material contexts', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        hardeningComponent(
          'component:off-path-sample',
          'sample',
          85,
          50,
          0,
          10,
          { material_id: 'material:calcite' },
        ),
        hardeningComponent('component:sample-laser', 'laser', 0, 0, 0, 1, {
          wavelength_nm: 532,
          power_mw: 10,
        }),
        hardeningComponent(
          'component:sample-objective',
          'objective',
          10,
          0,
          90,
          20,
          { focal_length_mm: 75, numerical_aperture: 0.25 },
        ),
        hardeningComponent(
          'component:on-path-sample',
          'sample',
          85,
          0,
          0,
          10,
          { material_id: 'material:polystyrene' },
        ),
      ],
    })
    const contexts = traceAndContexts(scene).contexts
    const hit = contexts.find(
      ({ sample_component_id }) => sample_component_id === 'component:on-path-sample',
    )!
    const missed = contexts.find(
      ({ sample_component_id }) => sample_component_id === 'component:off-path-sample',
    )!

    expect(hit.material_id).toBe('material:polystyrene')
    expect(hit.excitation_reached_sample).toBe(true)
    expect(hit.focus.objective_component_id).toBe('component:sample-objective')
    expect(missed.material_id).toBe('material:calcite')
    expect(missed.path_state).toBe('no-excitation-path')
    expect(missed.focus.objective_component_id).toBeNull()
  })
})
