import {
  calculateExpectedCcdSpectrum,
  createVirtualSpectrometerConfiguration,
  simulateSeededCcdPreviewExposure,
  synthesizeRamanSpectrumAtSpectrometerInput,
  type ExpectedCcdSpectrum,
  type SimulatedCcdPreviewExposure,
  type VirtualCcdConfiguration,
} from '../core/acquisition'
import {
  traceOpticalScene,
  type OpticalScene,
  type SimulationConfiguration,
  type TraceResult,
} from '../core/optics'
import {
  createProjectRamanMaterialRegistry,
  buildRamanOpticalContexts,
  createAutoSpectrumAxis,
  type RamanMaterial,
  type ExpectedSpectrum,
  type RamanOpticalContext,
} from '../core/raman'

export const STUDIO_PREVIEW_SEED_BASE = 0x52a3_0000

export type StudioSpectrumSimulation =
  | Readonly<{
      kind: 'ready'
      context: RamanOpticalContext
      expectedRamanSpectrum: ExpectedSpectrum
      expectedCcdSpectrum: ExpectedCcdSpectrum
      previewExposure: SimulatedCcdPreviewExposure
      previewSeed_uint32: number
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: string
      context: RamanOpticalContext | null
      expectedRamanSpectrum: null
      expectedCcdSpectrum: null
      previewExposure: null
      previewSeed_uint32: null
    }>

export interface DerivedStudioSimulation {
  readonly trace: TraceResult
  readonly ramanContexts: readonly RamanOpticalContext[]
  readonly spectrum: StudioSpectrumSimulation
}

export interface DeriveStudioSimulationInput {
  readonly scene: OpticalScene
  readonly simulationConfiguration: SimulationConfiguration
  readonly detectorConfiguration: VirtualCcdConfiguration
  readonly sourceRevision: number
  readonly materials?: readonly RamanMaterial[]
  readonly trace?: TraceResult
}

const unavailable = (
  reason: string,
  context: RamanOpticalContext | null = null,
): StudioSpectrumSimulation =>
  Object.freeze({
    kind: 'unavailable',
    reason,
    context,
    expectedRamanSpectrum: null,
    expectedCcdSpectrum: null,
    previewExposure: null,
    previewSeed_uint32: null,
  })

const contextPriority = (context: RamanOpticalContext): number => {
  switch (context.path_state) {
    case 'valid-signal-path':
      return 0
    case 'excited-no-return-path':
      return 1
    case 'no-excitation-path':
      return 2
  }
}

const selectPrimaryContext = (
  contexts: readonly RamanOpticalContext[],
): RamanOpticalContext | null =>
  [...contexts].sort(
    (left, right) => contextPriority(left) - contextPriority(right),
  )[0] ?? null

export const deriveStudioSimulation = (
  input: DeriveStudioSimulationInput,
): DerivedStudioSimulation => {
  const trace =
    input.trace ??
    traceOpticalScene(input.scene, input.simulationConfiguration)
  const samples = input.scene.components.filter(
    (component) => component.type === 'sample',
  )
  if (samples.length === 0) {
    return Object.freeze({
      trace,
      ramanContexts: Object.freeze([]),
      spectrum: unavailable('No Sample is present in the optical scene.'),
    })
  }

  const materialRegistry = createProjectRamanMaterialRegistry(input.materials)
  const unknownSample = samples.find(
    (sample) =>
      materialRegistry.find(sample.parameters.material_id) === undefined,
  )
  if (unknownSample) {
    return Object.freeze({
      trace,
      ramanContexts: Object.freeze([]),
      spectrum: unavailable(
        `Unknown Raman material: ${unknownSample.parameters.material_id}`,
      ),
    })
  }

  try {
    const ramanContexts = buildRamanOpticalContexts(input.scene, trace, { materialRegistry })
    const context = selectPrimaryContext(ramanContexts)
    if (!context) {
      return Object.freeze({
        trace,
        ramanContexts,
        spectrum: unavailable('No Raman Sample context is available.'),
      })
    }

    const material = materialRegistry.resolve(context.material_id)
    const lineageSpectrometerId =
      context.raman_return.spectrometer_component_ids[0]
    const spectrometer = input.scene.components.find(
      (component) =>
        component.type === 'spectrometer' &&
        component.enabled &&
        (lineageSpectrometerId
          ? component.id === lineageSpectrometerId
          : true),
    )
    if (!spectrometer || spectrometer.type !== 'spectrometer') {
      return Object.freeze({
        trace,
        ramanContexts,
        spectrum: unavailable(
          'No enabled Spectrometer is available for the Raman preview.',
          context,
        ),
      })
    }

    const fallbackLaser = input.scene.components.find(
      (component) => component.type === 'laser' && component.enabled,
    )
    const excitationWavelength =
      context.excitation_wavelength_nm ??
      (fallbackLaser?.type === 'laser'
        ? fallbackLaser.parameters.wavelength_nm
        : undefined)
    if (excitationWavelength === undefined) {
      return Object.freeze({
        trace,
        ramanContexts,
        spectrum: unavailable(
          'No enabled Laser wavelength is available for the Raman preview.',
          context,
        ),
      })
    }

    const axis = createAutoSpectrumAxis(material)
    const spectrometerConfiguration =
      createVirtualSpectrometerConfiguration(spectrometer)
    const expectedRamanSpectrum =
      synthesizeRamanSpectrumAtSpectrometerInput({
        context,
        material,
        axis,
        excitation_wavelength_nm: excitationWavelength,
        spectrometer: spectrometerConfiguration,
      })
    const expectedCcdSpectrum = calculateExpectedCcdSpectrum({
      raman_domain_spectrum: expectedRamanSpectrum,
      spectrometer: spectrometerConfiguration,
      detector: input.detectorConfiguration,
    })
    const previewSeed_uint32 =
      (STUDIO_PREVIEW_SEED_BASE ^ input.sourceRevision) >>> 0
    const previewExposure = simulateSeededCcdPreviewExposure(
      expectedCcdSpectrum,
      previewSeed_uint32,
    )

    return Object.freeze({
      trace,
      ramanContexts,
      spectrum: Object.freeze({
        kind: 'ready',
        context,
        expectedRamanSpectrum,
        expectedCcdSpectrum,
        previewExposure,
        previewSeed_uint32,
      }),
    })
  } catch (error) {
    return Object.freeze({
      trace,
      ramanContexts: Object.freeze([]),
      spectrum: unavailable(
        error instanceof Error
          ? `Spectrum simulation unavailable: ${error.message}`
          : 'Spectrum simulation unavailable.',
      ),
    })
  }
}

