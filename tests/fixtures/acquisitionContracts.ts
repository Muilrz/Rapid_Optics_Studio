import {
  ACQUISITION_CONTRACT_VERSION,
  ACQUISITION_RNG_ORDER_VERSION,
  CCD_NOISE_MODEL_VERSION,
  type AcquisitionInput,
} from '../../src/core/acquisition'
import { BUILT_IN_RAMAN_MATERIAL_DATASET, BUILT_IN_RAMAN_MATERIAL_REGISTRY, RAMAN_SPECTRUM_MODEL_VERSION } from '../../src/core/raman'
import { createStudioStore } from '../../src/store/studioStore'

/** Fixed contract data, not an acquisition generator or averaging algorithm. */
export const acquisitionContractFixture = (n = 2, id = 'run:fixture') => {
  const state = createStudioStore().getState()
  const simulation = state.derived.spectrum
  if (simulation.kind !== 'ready') throw new Error(simulation.reason)
  const context = simulation.context
  if (context.source_component_id === null) throw new Error('Fixture requires source lineage.')
  const expected = simulation.expectedCcdSpectrum
  const rng = {
    algorithm: 'mulberry32', algorithm_version: 'mulberry32-v1', seed_uint32: 0 as number,
    sampling_algorithm: 'box-muller-cosine',
    sampling_algorithm_version: 'box-muller-cosine-two-uniforms-v1',
    consumption_order_version: ACQUISITION_RNG_ORDER_VERSION,
    noise_model_version: CCD_NOISE_MODEL_VERSION,
  } as const
  const axis = { ...expected.axis, values_cm_1: expected.axis.values_cm_1.slice(0, 2) }
  const input = {
    id, started_at: '2026-11-08T00:00:00.000Z',
    request: { mode: n === 1 ? 'single' : 'average', number_of_exposures: n },
    instrument_snapshot: {
      optical_scene: state.authoritative.scene,
      simulation_settings: state.authoritative.simulationConfiguration,
      material: BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve(context.material_id),
      material_dataset: BUILT_IN_RAMAN_MATERIAL_DATASET,
      spectrometer: expected.spectrometer, detector: expected.detector,
      context, configuration_revision: state.authoritative.revision,
      target: { laser_component_id: context.source_component_id,
        sample_component_id: context.sample_component_id,
        spectrometer_component_id: expected.spectrometer.spectrometer_component_id,
        resolution_version: 'unique-traceable-chain-v1' },
      simulation_model_version: { optics: state.authoritative.simulationConfiguration.model_version,
        raman: context.model_version, raman_spectrum: RAMAN_SPECTRUM_MODEL_VERSION, focus: context.focus.model_version,
        spectrometer: expected.spectrometer.model_version, ccd: expected.detector.model_version,
        noise: CCD_NOISE_MODEL_VERSION, contract: ACQUISITION_CONTRACT_VERSION },
    },
    expected_spectrum: { ...expected, axis,
      scattered_wavelength_nm: expected.scattered_wavelength_nm.slice(0, 2),
      quantum_efficiency: expected.quantum_efficiency.slice(0, 2),
      signal_counts: expected.signal_counts.slice(0, 2),
      dark_counts: expected.dark_counts.slice(0, 2),
      unclipped_expected_counts: expected.unclipped_expected_counts.slice(0, 2),
      expected_counts: expected.expected_counts.slice(0, 2),
      saturated: expected.saturated.slice(0, 2),
      saturated_bin_count: expected.saturated.slice(0, 2).filter(Boolean).length,
    }, rng,
  }
  const bounds = { minimum_counts: 0, maximum_counts: expected.detector.full_well_counts }
  const exposure = (index: number, counts: number[]) => ({
    kind: 'acquisition-exposure', contract_version: ACQUISITION_CONTRACT_VERSION,
    run_id: id, exposure_index: index, axis, unit: 'counts/bin', counts,
    detector_bounds: bounds, rng, clipped_low: [false, false], clipped_high: [false, false],
  })
  const frames = n === 1 ? [exposure(0, [1, 2])] : [exposure(0, [1, 2]), exposure(1, [3, 4])]
  const proxy = (value: number, source: string) => ({
    status: 'available', value, unit: 'mW', source, model_version: context.model_version,
    scientific_semantics: 'detected-effective-power-proxy-not-absolute-raman-radiant-power',
  })
  return {
    status: 'completed', input, completed_at: '2026-11-08T00:00:01.000Z', exposures: frames,
    acquired_spectrum: { kind: 'raw-acquired-spectrum', contract_version: ACQUISITION_CONTRACT_VERSION,
      run_id: id, axis, unit: 'counts/bin', detector_bounds: bounds,
      aggregation: 'arithmetic-mean', number_of_exposures: n, counts: n === 1 ? [1, 2] : [2, 3] },
    metrics: {
      focus_efficiency: context.focus.efficiency,
      raman_power: proxy(context.raman_return.detected_effective_excitation_power_mw, 'raman_return.detected_effective_excitation_power_mw'),
      rayleigh_leakage: proxy(context.rayleigh_return.detected_effective_leakage_power_mw, 'rayleigh_return.detected_effective_leakage_power_mw'),
      snr: { status: 'undefined', value: null, undefined_reason: 'Current model has no approved SNR definition.' },
      rayleigh_od: { status: 'undefined', value: null, undefined_reason: 'Current model has no approved OD definition.' },
      saturation: { evidence: 'expected-mask-and-per-exposure-clipping', expected_saturated_bin_count: input.expected_spectrum.saturated_bin_count },
    },
  }
}

/** Clock is an injected value provider, not a timer. */
export const fixedAcquisitionClock = { now: () => '2026-11-08T00:00:00.000Z' }

export const cancelledContractFixture = (input: AcquisitionInput) => ({
  status: 'cancelled', input, cancelled_at: '2026-11-08T00:00:00.500Z',
  cancellation_reason: 'Instrument configuration changed.', exposures: [],
})
