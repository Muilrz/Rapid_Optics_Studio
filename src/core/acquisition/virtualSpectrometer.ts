import {
  SpectrometerComponentSchema,
  type SpectrometerComponent,
} from '../optics'
import {
  ExpectedSpectrumSchema,
  RAMAN_OPTICAL_COUPLING_PARAMETERS,
  RAMAN_SPECTRUM_MODEL_VERSION,
  RamanFocusContextSchema,
  RamanMaterialSchema,
  RamanOpticalContextSchema,
  SpectrumAxisSchema,
  synthesizeExpectedRamanSpectrum,
  type ExpectedSpectrum,
  type RamanMaterial,
  type RamanOpticalContext,
  type SpectrumAxis,
} from '../raman'
import {
  EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
  ExpectedCcdSpectrumSchema,
  SandboxGaussianQeModelSchema,
  VIRTUAL_SPECTROMETER_MODEL_VERSION,
  VirtualCcdConfigurationSchema,
  VirtualSpectrometerConfigurationSchema,
  type ExpectedCcdSpectrum,
  type SandboxGaussianQeModel,
  type VirtualCcdConfiguration,
  type VirtualSpectrometerConfiguration,
} from './contracts'
import { RAMAN_SANDBOX_DETECTOR_PARAMETERS } from './modelParameters'

export interface VirtualSpectrometerConfigurationOverrides {
  readonly grating_throughput?: number
  readonly instrument_half_width_cm_1?: number
  readonly incident_photon_scale_per_relative_intensity_second?: number
}

export const createVirtualSpectrometerConfiguration = (
  component: SpectrometerComponent,
  overrides: VirtualSpectrometerConfigurationOverrides = {},
): VirtualSpectrometerConfiguration => {
  const parsedComponent = SpectrometerComponentSchema.parse(component)
  return VirtualSpectrometerConfigurationSchema.parse({
    model_version: VIRTUAL_SPECTROMETER_MODEL_VERSION,
    spectrometer_component_id: parsedComponent.id,
    optical_throughput: parsedComponent.parameters.optical_throughput,
    grating_throughput:
      overrides.grating_throughput ??
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.grating_throughput,
    instrument_half_width_cm_1:
      overrides.instrument_half_width_cm_1 ??
      RAMAN_SANDBOX_DETECTOR_PARAMETERS.instrument_half_width_cm_1,
    incident_photon_scale_per_relative_intensity_second:
      overrides.incident_photon_scale_per_relative_intensity_second ??
      RAMAN_SANDBOX_DETECTOR_PARAMETERS
        .incident_photon_scale_per_relative_intensity_second,
  })
}

export const evaluateQuantumEfficiency = (
  wavelength_nm: number,
  model: SandboxGaussianQeModel,
): number => {
  if (!Number.isFinite(wavelength_nm) || wavelength_nm <= 0) {
    throw new RangeError('QE wavelength must be finite and positive.')
  }
  const parsedModel = SandboxGaussianQeModelSchema.parse(model)
  const normalizedOffset =
    (wavelength_nm - parsedModel.center_wavelength_nm) /
    parsedModel.width_nm
  return Math.max(
    parsedModel.minimum_quantum_efficiency,
    parsedModel.peak_quantum_efficiency *
      Math.exp(-(normalizedOffset * normalizedOffset)),
  )
}

const finiteNonNegative = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`)
  }
  return value
}

export interface ExpectedCcdSpectrumInput {
  readonly raman_domain_spectrum: ExpectedSpectrum
  readonly spectrometer: VirtualSpectrometerConfiguration
  readonly detector: VirtualCcdConfiguration
}

/**
 * Converts an already broadened Raman-domain spectrum into deterministic CCD
 * expectation values. Read noise is validated but intentionally not applied.
 */
export const calculateExpectedCcdSpectrum = (
  input: ExpectedCcdSpectrumInput,
): ExpectedCcdSpectrum => {
  const spectrum = ExpectedSpectrumSchema.parse(input.raman_domain_spectrum)
  const spectrometer = VirtualSpectrometerConfigurationSchema.parse(
    input.spectrometer,
  )
  const detector = VirtualCcdConfigurationSchema.parse(input.detector)
  const quantumEfficiency: number[] = []
  const signalCounts: number[] = []
  const darkCounts: number[] = []
  const unclippedExpectedCounts: number[] = []
  const expectedCounts: number[] = []
  const saturated: boolean[] = []

  const darkExpectation = finiteNonNegative(
    detector.dark_current_counts_per_second_per_bin *
      detector.integration_time_s,
    'Dark-current expectation',
  )
  const throughput = finiteNonNegative(
    spectrometer.optical_throughput * spectrometer.grating_throughput,
    'Combined Spectrometer throughput',
  )

  for (let index = 0; index < spectrum.relative_intensity.length; index += 1) {
    const qe = evaluateQuantumEfficiency(
      spectrum.scattered_wavelength_nm[index]!,
      detector.qe_model,
    )
    const photoelectrons = finiteNonNegative(
      spectrum.relative_intensity[index]! *
        spectrometer.incident_photon_scale_per_relative_intensity_second *
        throughput *
        qe *
        detector.integration_time_s,
      'Expected photoelectrons',
    )
    const signal = finiteNonNegative(
      photoelectrons * detector.gain_counts_per_photoelectron,
      'Expected signal counts',
    )
    const unclipped = finiteNonNegative(
      signal + darkExpectation,
      'Unclipped expected CCD counts',
    )

    quantumEfficiency.push(qe)
    signalCounts.push(signal)
    darkCounts.push(darkExpectation)
    unclippedExpectedCounts.push(unclipped)
    expectedCounts.push(Math.min(unclipped, detector.full_well_counts))
    saturated.push(unclipped >= detector.full_well_counts)
  }

  return ExpectedCcdSpectrumSchema.parse({
    kind: 'expected-ccd-spectrum',
    model_version: EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
    source_spectrum_kind: spectrum.kind,
    source_raman_model_version: spectrum.model_version,
    material_id: spectrum.material_id,
    axis: spectrum.axis,
    scattered_wavelength_nm: spectrum.scattered_wavelength_nm,
    quantum_efficiency: quantumEfficiency,
    signal_counts: signalCounts,
    dark_counts: darkCounts,
    unclipped_expected_counts: unclippedExpectedCounts,
    expected_counts: expectedCounts,
    saturated,
    saturated_bin_count: saturated.filter(Boolean).length,
    spectrometer,
    detector,
  })
}

export interface RamanContextExpectedCcdInput {
  readonly context: RamanOpticalContext
  readonly material: RamanMaterial
  readonly axis: SpectrumAxis
  readonly excitation_wavelength_nm: number
  readonly spectrometer: VirtualSpectrometerConfiguration
  readonly detector: VirtualCcdConfiguration
}

/**
 * Phase 3C → 3B → 3D bridge. The Raman-domain spectrum is synthesized at the
 * Spectrometer input so component throughput is applied exactly once by CCD
 * conversion rather than being counted both in 3C and 3D.
 */
export const calculateExpectedCcdSpectrumFromRamanContext = (
  input: RamanContextExpectedCcdInput,
): ExpectedCcdSpectrum => {
  const context = RamanOpticalContextSchema.parse(input.context)
  const material = RamanMaterialSchema.parse(input.material)
  const axis = SpectrumAxisSchema.parse(input.axis)
  const spectrometer = VirtualSpectrometerConfigurationSchema.parse(
    input.spectrometer,
  )
  const detector = VirtualCcdConfigurationSchema.parse(input.detector)

  if (context.material_id !== material.id) {
    throw new RangeError('Raman context and material IDs must match.')
  }
  if (
    context.excitation_wavelength_nm !== null &&
    context.excitation_wavelength_nm !== input.excitation_wavelength_nm
  ) {
    throw new RangeError(
      'Explicit excitation wavelength must match the Raman optical context.',
    )
  }
  if (
    context.raman_return.spectrometer_component_ids.length > 0 &&
    !context.raman_return.spectrometer_component_ids.includes(
      spectrometer.spectrometer_component_id,
    )
  ) {
    throw new RangeError(
      'Virtual Spectrometer must belong to the Raman return-path lineage.',
    )
  }

  // Parsing here also protects the provisional focus contract at the boundary.
  RamanFocusContextSchema.parse(context.focus)
  const ramanDomainSpectrum = synthesizeExpectedRamanSpectrum({
    material,
    excitation_wavelength_nm: input.excitation_wavelength_nm,
    axis,
    configuration: {
      model_version: RAMAN_SPECTRUM_MODEL_VERSION,
      effective_excitation_scale:
        context.effective_excitation_power_mw *
        context.raman_return.throughput_to_spectrometer_input *
        RAMAN_OPTICAL_COUPLING_PARAMETERS.effective_excitation_scale_per_mw,
      rayleigh_leakage_scale:
        context.rayleigh_return
          .effective_leakage_power_at_spectrometer_input_mw *
        RAMAN_OPTICAL_COUPLING_PARAMETERS.rayleigh_leakage_scale_per_mw,
      broadening: {
        model: 'quadrature-half-width',
        instrument_half_width_cm_1:
          spectrometer.instrument_half_width_cm_1,
      },
    },
  })

  return calculateExpectedCcdSpectrum({
    raman_domain_spectrum: ramanDomainSpectrum,
    spectrometer,
    detector,
  })
}
