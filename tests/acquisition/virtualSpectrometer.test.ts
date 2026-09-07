import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIRTUAL_CCD_CONFIGURATION,
  EXPECTED_CCD_SPECTRUM_MODEL_VERSION,
  RAMAN_SANDBOX_DETECTOR_PARAMETERS,
  VIRTUAL_CCD_MODEL_VERSION,
  VIRTUAL_SPECTROMETER_MODEL_VERSION,
  VirtualCcdConfigurationSchema,
  calculateExpectedCcdSpectrum,
  calculateExpectedCcdSpectrumFromRamanContext,
  createVirtualSpectrometerConfiguration,
  evaluateQuantumEfficiency,
} from '../../src/core/acquisition'
import {
  OpticalSceneSchema,
  traceOpticalScene,
  type OpticalComponent,
  type OpticalScene,
  type SpectrometerComponent,
} from '../../src/core/optics'
import {
  BUILT_IN_RAMAN_MATERIAL_REGISTRY,
  ExpectedSpectrumSchema,
  SpectrumAxisSchema,
  buildRamanOpticalContexts,
} from '../../src/core/raman'
import { DEFAULT_RAMAN_SCENE } from '../../src/project/defaults/defaultRamanScene'
import { DEFAULT_SIMULATION_CONFIGURATION } from '../fixtures/defaultRamanScene'

const unlimitedDetector = VirtualCcdConfigurationSchema.parse({
  ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
  full_well_counts: Number.MAX_VALUE,
  dark_current_counts_per_second_per_bin: 0,
})

const equalIntensitySpectrum = ExpectedSpectrumSchema.parse({
  kind: 'expected-raman-spectrum',
  material_id: 'material:silicon',
  excitation_wavelength_nm: 532,
  axis: {
    kind: 'raman-shift',
    unit: 'cm^-1',
    values_cm_1: [0, 1],
  },
  scattered_wavelength_nm: [600, 1100],
  relative_intensity: [1, 1],
  components: {
    raman: [1, 1],
    fluorescence: [0, 0],
    rayleigh: [0, 0],
  },
  model_version: 'raman-spectrum-v1',
})

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

const spectrometerFrom = (scene: OpticalScene): SpectrometerComponent => {
  const component = scene.components.find(
    (candidate) => candidate.id === 'component:spectrometer',
  )
  if (component?.type !== 'spectrometer') {
    throw new Error('Expected default Spectrometer component.')
  }
  return component
}

const contextFrom = (scene: OpticalScene) => {
  const trace = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
  const contexts = buildRamanOpticalContexts(scene, trace)
  expect(contexts).toHaveLength(1)
  return contexts[0]!
}

const calculateDefaultPipeline = (
  scene: OpticalScene = DEFAULT_RAMAN_SCENE,
  detector = unlimitedDetector,
  instrument_half_width_cm_1 = 6,
) => {
  const context = contextFrom(scene)
  const material = BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve(
    context.material_id,
  )
  const axis = SpectrumAxisSchema.parse({
    kind: 'raman-shift',
    unit: 'cm^-1',
    values_cm_1: [500, 520.7, 540],
  })
  return calculateExpectedCcdSpectrumFromRamanContext({
    context,
    material,
    axis,
    excitation_wavelength_nm: 532,
    spectrometer: createVirtualSpectrometerConfiguration(
      spectrometerFrom(scene),
      { instrument_half_width_cm_1 },
    ),
    detector,
  })
}

describe('Phase 3D empirical detector contracts', () => {
  it('names and versions every inherited Sandbox detector constant', () => {
    expect(RAMAN_SANDBOX_DETECTOR_PARAMETERS).toStrictEqual({
      provenance: 'reference/raman_sandbox.html computeSpectrum',
      spectrometer_model_version: 'virtual-spectrometer-v1',
      detector_model_version: 'deterministic-ccd-v1',
      gain_counts_per_photoelectron: 340,
      full_well_counts: 60_000,
      read_noise_rms_counts: 3,
      dark_current_counts_per_second_per_bin: 0.01,
      default_integration_time_s: 1,
      grating_throughput: 0.7,
      instrument_half_width_cm_1: 6,
      incident_photon_scale_per_relative_intensity_second: 50,
      qe_model: {
        kind: 'sandbox-gaussian-floor-v1',
        minimum_quantum_efficiency: 0.02,
        peak_quantum_efficiency: 0.9,
        center_wavelength_nm: 600,
        width_nm: 250,
      },
      gain_convention:
        'higher gain linearly increases output counts per photoelectron',
      full_well_convention:
        'deterministic clipping ceiling in output counts per sampled bin',
      read_noise_phase: 'applied only by seeded Phase 3E preview exposure',
    })
    expect(DEFAULT_VIRTUAL_CCD_CONFIGURATION).toMatchObject({
      model_version: VIRTUAL_CCD_MODEL_VERSION,
      gain_counts_per_photoelectron: 340,
      full_well_counts: 60_000,
      read_noise_rms_counts: 3,
      dark_current_counts_per_second_per_bin: 0.01,
      integration_time_s: 1,
    })
  })

  it('derives the Virtual Spectrometer response from the actual component', () => {
    expect(
      createVirtualSpectrometerConfiguration(
        spectrometerFrom(DEFAULT_RAMAN_SCENE),
      ),
    ).toStrictEqual({
      model_version: VIRTUAL_SPECTROMETER_MODEL_VERSION,
      spectrometer_component_id: 'component:spectrometer',
      optical_throughput: 1,
      grating_throughput: 0.7,
      instrument_half_width_cm_1: 6,
      incident_photon_scale_per_relative_intensity_second: 50,
    })
  })

  it('validates all required CCD parameters while retaining read noise only as data', () => {
    expect(() =>
      VirtualCcdConfigurationSchema.parse({
        ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
        gain_counts_per_photoelectron: Number.NaN,
      }),
    ).toThrow()
    expect(() =>
      VirtualCcdConfigurationSchema.parse({
        ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
        full_well_counts: 0,
      }),
    ).toThrow()
    expect(() =>
      VirtualCcdConfigurationSchema.parse({
        ...DEFAULT_VIRTUAL_CCD_CONFIGURATION,
        read_noise_rms_counts: -1,
      }),
    ).toThrow()
  })
})

describe('deterministic Expected CCD Spectrum', () => {
  const spectrometer = createVirtualSpectrometerConfiguration(
    spectrometerFrom(DEFAULT_RAMAN_SCENE),
  )

  it('converts Raman-domain intensity to a distinct expected-count entity', () => {
    const result = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: unlimitedDetector,
    })

    expect(result.kind).toBe('expected-ccd-spectrum')
    expect(result.model_version).toBe(EXPECTED_CCD_SPECTRUM_MODEL_VERSION)
    expect(result.source_spectrum_kind).toBe('expected-raman-spectrum')
    expect(result.expected_counts.every(Number.isFinite)).toBe(true)
    expect(result.expected_counts.every((value) => value >= 0)).toBe(true)
    expect(Math.max(...result.expected_counts)).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toMatch(
      /raw.acquisition|processed.spectrum|noisy.preview/i,
    )
  })

  it('applies wavelength-dependent QE to otherwise equal signal', () => {
    const result = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: unlimitedDetector,
    })

    expect(evaluateQuantumEfficiency(600, unlimitedDetector.qe_model)).toBe(0.9)
    expect(result.quantum_efficiency[0]).toBe(0.9)
    expect(result.quantum_efficiency[1]).toBeGreaterThanOrEqual(0.02)
    expect(result.quantum_efficiency[1]).toBeLessThan(
      result.quantum_efficiency[0]!,
    )
    expect(result.signal_counts[1]).toBeLessThan(result.signal_counts[0]!)
  })

  it('scales signal and dark expectation with integration time', () => {
    const oneSecond = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: {
        ...unlimitedDetector,
        dark_current_counts_per_second_per_bin: 0.25,
        integration_time_s: 1,
      },
    })
    const twoSeconds = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: {
        ...unlimitedDetector,
        dark_current_counts_per_second_per_bin: 0.25,
        integration_time_s: 2,
      },
    })

    expect(twoSeconds.signal_counts[0]).toBeCloseTo(
      oneSecond.signal_counts[0]! * 2,
      12,
    )
    expect(twoSeconds.dark_counts[0]).toBe(0.5)
    expect(twoSeconds.expected_counts[0]).toBeCloseTo(
      oneSecond.expected_counts[0]! * 2,
      12,
    )
  })

  it('uses the V1 gain convention without amplifying deterministic dark counts', () => {
    const baseline = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: {
        ...unlimitedDetector,
        dark_current_counts_per_second_per_bin: 1,
      },
    })
    const doubledGain = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: {
        ...unlimitedDetector,
        gain_counts_per_photoelectron:
          unlimitedDetector.gain_counts_per_photoelectron * 2,
        dark_current_counts_per_second_per_bin: 1,
      },
    })

    expect(doubledGain.signal_counts[0]).toBeCloseTo(
      baseline.signal_counts[0]! * 2,
      12,
    )
    expect(doubledGain.dark_counts).toStrictEqual(baseline.dark_counts)
  })

  it('does not apply read-noise realization during deterministic Phase 3D', () => {
    const lowReadNoise = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: { ...unlimitedDetector, read_noise_rms_counts: 0 },
    })
    const highReadNoise = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: { ...unlimitedDetector, read_noise_rms_counts: 10_000 },
    })

    expect(highReadNoise.expected_counts).toStrictEqual(
      lowReadNoise.expected_counts,
    )
  })

  it('clips repeatably at full well and exposes the saturation mask', () => {
    const detector = {
      ...unlimitedDetector,
      full_well_counts: 100,
      dark_current_counts_per_second_per_bin: 1,
    }
    const first = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector,
    })
    const second = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector,
    })

    expect(first.expected_counts).toStrictEqual([100, 100])
    expect(first.saturated).toStrictEqual([true, true])
    expect(first.saturated_bin_count).toBe(2)
    expect(first).toStrictEqual(second)
  })

  it('keeps zero signal finite while retaining deterministic dark current', () => {
    const zeroSpectrum = ExpectedSpectrumSchema.parse({
      ...equalIntensitySpectrum,
      relative_intensity: [0, 0],
      components: { raman: [0, 0], fluorescence: [0, 0], rayleigh: [0, 0] },
    })
    const result = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: zeroSpectrum,
      spectrometer,
      detector: DEFAULT_VIRTUAL_CCD_CONFIGURATION,
    })

    expect(result.signal_counts).toStrictEqual([0, 0])
    expect(result.dark_counts).toStrictEqual([0.01, 0.01])
    expect(result.expected_counts).toStrictEqual([0.01, 0.01])
    expect(result.expected_counts.every(Number.isFinite)).toBe(true)
  })

  it('is deterministic, deeply immutable, and does not mutate its input', () => {
    const input = {
      raman_domain_spectrum: equalIntensitySpectrum,
      spectrometer,
      detector: unlimitedDetector,
    }
    const before = structuredClone(input)
    const first = calculateExpectedCcdSpectrum(input)
    const second = calculateExpectedCcdSpectrum(input)

    expect(first).toStrictEqual(second)
    expect(input).toStrictEqual(before)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.expected_counts)).toBe(true)
    expect(Object.isFrozen(first.detector)).toBe(true)
    expect(() => {
      ;(first.expected_counts as number[])[0] = -1
    }).toThrow(TypeError)
  })
})

describe('Phase 3C → 3B → 3D signal chain', () => {
  it('produces non-zero expected CCD counts for the default Raman scene', () => {
    const result = calculateDefaultPipeline()

    expect(result.signal_counts[1]).toBeGreaterThan(0)
    expect(result.expected_counts.every(Number.isFinite)).toBe(true)
  })

  it('applies component optical throughput exactly once', () => {
    const halfThroughputScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:spectrometer',
      (component) => {
        if (component.type !== 'spectrometer') {
          throw new Error('Expected Spectrometer.')
        }
        return {
          ...component,
          parameters: { ...component.parameters, optical_throughput: 0.5 },
        }
      },
    )
    const baseline = calculateDefaultPipeline()
    const halfThroughput = calculateDefaultPipeline(halfThroughputScene)

    expect(contextFrom(halfThroughputScene).raman_return).toMatchObject({
      throughput_to_spectrometer_input: 1,
      throughput: 0.5,
    })
    expect(halfThroughput.signal_counts[1]).toBeCloseTo(
      baseline.signal_counts[1]! * 0.5,
      12,
    )
  })

  it('keeps a zero-throughput Spectrometer path finite and dark-only', () => {
    const zeroThroughputScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:spectrometer',
      (component) => {
        if (component.type !== 'spectrometer') {
          throw new Error('Expected Spectrometer.')
        }
        return {
          ...component,
          parameters: { ...component.parameters, optical_throughput: 0 },
        }
      },
    )
    const context = contextFrom(zeroThroughputScene)
    const result = calculateDefaultPipeline(
      zeroThroughputScene,
      DEFAULT_VIRTUAL_CCD_CONFIGURATION,
    )

    expect(context.raman_return).toMatchObject({
      path_reaches_spectrometer: true,
      throughput_to_spectrometer_input: 1,
      throughput: 0,
      detected_effective_excitation_power_mw: 0,
      spectrometer_component_ids: ['component:spectrometer'],
    })
    expect(result.signal_counts).toStrictEqual([0, 0, 0])
    expect(result.expected_counts).toStrictEqual([0.01, 0.01, 0.01])
  })

  it('sources instrument broadening from the Virtual Spectrometer contract', () => {
    const noBroadening = calculateDefaultPipeline(
      DEFAULT_RAMAN_SCENE,
      unlimitedDetector,
      0,
    )
    const broadening = calculateDefaultPipeline(
      DEFAULT_RAMAN_SCENE,
      unlimitedDetector,
      20,
    )

    expect(broadening.spectrometer.instrument_half_width_cm_1).toBe(20)
    expect(broadening.signal_counts[0]).toBeGreaterThan(
      noBroadening.signal_counts[0]!,
    )
  })

  it('turns a broken return path into stable dark-only expected counts', () => {
    const brokenScene = updateComponent(
      DEFAULT_RAMAN_SCENE,
      'component:spectrometer',
      (component) => ({
        ...component,
        transform: { ...component.transform, y_mm: -100 },
      }),
    )
    const result = calculateDefaultPipeline(
      brokenScene,
      DEFAULT_VIRTUAL_CCD_CONFIGURATION,
    )

    expect(contextFrom(brokenScene).path_state).toBe(
      'excited-no-return-path',
    )
    expect(result.signal_counts).toStrictEqual([0, 0, 0])
    expect(result.expected_counts).toStrictEqual([0.01, 0.01, 0.01])
  })
})
