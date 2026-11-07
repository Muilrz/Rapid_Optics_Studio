import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIRTUAL_CCD_CONFIGURATION,
  VirtualCcdConfigurationSchema,
} from '../../src/core/acquisition'
import {
  Transform2DSchema,
  type OpticalComponent,
  type OpticalComponentType,
} from '../../src/core/optics'
import { createStudioStore } from '../../src/store/studioStore'

const componentOfType = <Type extends OpticalComponentType>(
  components: readonly OpticalComponent[],
  type: Type,
) => {
  const component = components.find((candidate) => candidate.type === type)
  expect(component).toBeDefined()
  return component as Extract<OpticalComponent, { type: Type }>
}

const readySpectrum = (store: ReturnType<typeof createStudioStore>) => {
  const spectrum = store.getState().derived.spectrum
  expect(spectrum.kind).toBe('ready')
  if (spectrum.kind !== 'ready') {
    throw new Error(spectrum.reason)
  }
  return spectrum
}

const maximum = (values: readonly number[]) => Math.max(...values)

describe('Phase 3F derived Studio simulation pipeline', () => {
  it('initializes the complete trace-to-preview chain as derived state', () => {
    const store = createStudioStore()
    const state = store.getState()
    const spectrum = readySpectrum(store)

    expect(state.derived.ramanContexts).toHaveLength(1)
    expect(spectrum.context.path_state).toBe('valid-signal-path')
    expect(spectrum.expectedRamanSpectrum.kind).toBe(
      'expected-raman-spectrum',
    )
    expect(spectrum.expectedCcdSpectrum.kind).toBe('expected-ccd-spectrum')
    expect(spectrum.previewExposure.kind).toBe(
      'simulated-ccd-preview-exposure',
    )
    expect(maximum(spectrum.expectedCcdSpectrum.signal_counts)).toBeGreaterThan(
      0,
    )
  })

  it('updates trace, Raman signal, detector spectrum, and preview after movement', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const mirror = componentOfType(
      initial.authoritative.scene.components,
      'mirror',
    )
    const initialSpectrum = readySpectrum(store)

    initial.updateComponentTransform(
      mirror.id,
      Transform2DSchema.parse({ ...mirror.transform, rotation_deg: 0 }),
    )
    const broken = store.getState()
    const brokenSpectrum = readySpectrum(store)

    expect(broken.derived.trace).not.toBe(initial.derived.trace)
    expect(brokenSpectrum).not.toBe(initialSpectrum)
    expect(brokenSpectrum.context.path_state).toBe('no-excitation-path')
    expect(maximum(brokenSpectrum.expectedRamanSpectrum.relative_intensity)).toBe(
      0,
    )
    expect(maximum(brokenSpectrum.expectedCcdSpectrum.signal_counts)).toBe(0)

    broken.updateComponentTransform(mirror.id, mirror.transform)
    const restored = readySpectrum(store)
    expect(restored.context.path_state).toBe('valid-signal-path')
    expect(maximum(restored.expectedCcdSpectrum.signal_counts)).toBeGreaterThan(
      0,
    )
  })

  it('changes Raman peak pattern and auto axis when material changes', () => {
    const store = createStudioStore()
    const sample = componentOfType(
      store.getState().authoritative.scene.components,
      'sample',
    )
    const silicon = readySpectrum(store)

    store.getState().updateComponentParameters(sample.id, {
      material_id: 'material:polystyrene',
    })
    const polystyrene = readySpectrum(store)

    expect(polystyrene.expectedRamanSpectrum.material_id).toBe(
      'material:polystyrene',
    )
    expect(polystyrene.expectedRamanSpectrum.axis.values_cm_1.at(-1)).toBeGreaterThan(
      3054,
    )
    expect(polystyrene.expectedRamanSpectrum.relative_intensity).not.toEqual(
      silicon.expectedRamanSpectrum.relative_intensity,
    )
  })

  it('updates wavelength mapping, QE, and detector response with laser wavelength', () => {
    const store = createStudioStore()
    const laser = componentOfType(
      store.getState().authoritative.scene.components,
      'laser',
    )
    const green = readySpectrum(store)

    store.getState().updateComponentParameters(laser.id, {
      ...laser.parameters,
      wavelength_nm: 785,
    })
    const nir = readySpectrum(store)

    expect(nir.expectedRamanSpectrum.excitation_wavelength_nm).toBe(785)
    expect(nir.expectedRamanSpectrum.scattered_wavelength_nm).not.toEqual(
      green.expectedRamanSpectrum.scattered_wavelength_nm,
    )
    expect(nir.expectedCcdSpectrum.quantum_efficiency).not.toEqual(
      green.expectedCcdSpectrum.quantum_efficiency,
    )
    expect(nir.expectedCcdSpectrum.signal_counts).not.toEqual(
      green.expectedCcdSpectrum.signal_counts,
    )
  })

  it('updates expected counts from detector configuration without retracing', () => {
    const detector = VirtualCcdConfigurationSchema.parse({
      ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
      integration_time_s: 0.25,
      full_well_counts: 1_000_000_000,
      dark_current_counts_per_second_per_bin: 0,
    })
    const store = createStudioStore(undefined, undefined, detector)
    const initial = store.getState()
    const initialSpectrum = readySpectrum(store)
    const initialHistory = initial.history

    initial.setDetectorConfiguration({
      ...detector,
      integration_time_s: 0.5,
    })
    const changed = store.getState()
    const changedSpectrum = readySpectrum(store)

    expect(changed.derived.trace).toBe(initial.derived.trace)
    expect(changed.authoritative.scene).toBe(initial.authoritative.scene)
    expect(changed.history).toBe(initialHistory)
    expect(maximum(changedSpectrum.expectedCcdSpectrum.signal_counts)).toBeCloseTo(
      maximum(initialSpectrum.expectedCcdSpectrum.signal_counts) * 2,
      8,
    )
    expect(changedSpectrum.previewExposure).not.toBe(
      initialSpectrum.previewExposure,
    )
  })

  it('recomputes trace throughput and detector counts after a spectrometer parameter change', () => {
    const detector = VirtualCcdConfigurationSchema.parse({
      ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
      integration_time_s: 0.01,
      full_well_counts: 1_000_000_000,
      dark_current_counts_per_second_per_bin: 0,
    })
    const store = createStudioStore(undefined, undefined, detector)
    const initial = store.getState()
    const spectrometer = componentOfType(
      initial.authoritative.scene.components,
      'spectrometer',
    )
    const initialSpectrum = readySpectrum(store)

    initial.updateComponentParameters(spectrometer.id, {
      ...spectrometer.parameters,
      optical_throughput: 0.5,
    })
    const changed = store.getState()
    const changedSpectrum = readySpectrum(store)

    expect(changed.derived.trace).not.toBe(initial.derived.trace)
    expect(changedSpectrum.context.raman_return.throughput).toBeCloseTo(
      initialSpectrum.context.raman_return.throughput * 0.5,
      12,
    )
    expect(maximum(changedSpectrum.expectedCcdSpectrum.signal_counts)).toBeCloseTo(
      maximum(initialSpectrum.expectedCcdSpectrum.signal_counts) * 0.5,
      8,
    )
  })

  it('reports an excited Sample with a broken return path as dark-only detector signal', () => {
    const store = createStudioStore()
    const spectrometer = componentOfType(
      store.getState().authoritative.scene.components,
      'spectrometer',
    )

    store.getState().updateComponentTransform(
      spectrometer.id,
      Transform2DSchema.parse({
        ...spectrometer.transform,
        y_mm: -100,
      }),
    )
    const broken = readySpectrum(store)

    expect(broken.context.path_state).toBe('excited-no-return-path')
    expect(broken.context.excitation_power_at_sample_mw).toBeGreaterThan(0)
    expect(maximum(broken.expectedCcdSpectrum.signal_counts)).toBe(0)
    expect(broken.expectedCcdSpectrum.expected_counts.every((value) => value > 0)).toBe(
      true,
    )
  })

  it('does not recompute or duplicate simulation state for editor/view-only changes', () => {
    const store = createStudioStore()
    const initial = store.getState()
    const mirror = componentOfType(
      initial.authoritative.scene.components,
      'mirror',
    )
    const serializedScene = JSON.stringify(initial.authoritative.scene)

    initial.setSelection(mirror.id)
    store.getState().setGridVisible(false)
    store.getState().panView({ x_px: 20, y_px: 10 })
    const changed = store.getState()

    expect(changed.derived.trace).toBe(initial.derived.trace)
    expect(changed.derived.spectrum).toBe(initial.derived.spectrum)
    expect(changed.authoritative.scene).toBe(initial.authoritative.scene)
    expect(serializedScene).not.toMatch(
      /expected-ccd-spectrum|simulated-ccd-preview-exposure|ramanContexts/,
    )
    expect('spectrum' in changed.authoritative).toBe(false)
    expect('previewExposure' in changed.authoritative).toBe(false)
  })
})

