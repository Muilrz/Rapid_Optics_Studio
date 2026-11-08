import { traceOpticalScene, type OpticalScene, type SimulationConfiguration } from '../optics'
import {
  BUILT_IN_RAMAN_MATERIAL_DATASET, BUILT_IN_RAMAN_MATERIAL_REGISTRY,
  RAMAN_SPECTRUM_MODEL_VERSION, buildRamanOpticalContexts, createAutoSpectrumAxis,
} from '../raman'
import { ACQUISITION_CONTRACT_VERSION, AcquisitionInputSchema, AcquisitionRequestSchema, type AcquisitionRequest } from './acquisitionContracts'
import { CCD_NOISE_MODEL_VERSION, type VirtualCcdConfiguration } from './contracts'
import { createAcquisitionRngProvenance } from './acquire'
import { calculateExpectedCcdSpectrumFromRamanContext, createVirtualSpectrometerConfiguration } from './virtualSpectrometer'

export interface AcquisitionDesign {
  readonly scene: OpticalScene
  readonly simulationConfiguration: SimulationConfiguration
  readonly detectorConfiguration: VirtualCcdConfiguration
  readonly revision: number
}

/** Resolves a unique actual excitation chain, or a unique real dark-only setup. */
export const buildAcquisitionInput = (design: AcquisitionDesign, request: AcquisitionRequest,
  id: string, startedAt: string, seed: number) => {
  const validatedRequest = AcquisitionRequestSchema.parse(request)
  if (design.detectorConfiguration.integration_time_s <= 0) throw new RangeError('Integration must be positive for acquisition.')
  const trace = traceOpticalScene(design.scene, design.simulationConfiguration)
  const contexts = buildRamanOpticalContexts(design.scene, trace).filter((context) =>
    design.scene.components.some((c) => c.id === context.sample_component_id && c.enabled))
  const excited = contexts.filter((c) => c.excitation_reached_sample)
  const candidates = excited.length > 0 ? excited : contexts
  if (candidates.length !== 1) throw new RangeError('Acquisition requires one unambiguous Sample/source chain.')
  const context = candidates[0]!
  const lasers = design.scene.components.filter((c) => c.enabled && c.type === 'laser' &&
    (context.source_component_id === null || c.id === context.source_component_id))
  const ids = context.raman_return.spectrometer_component_ids
  if (ids.length > 1) throw new RangeError('Multiple Spectrometers contributed to this context; acquisition is ambiguous.')
  const spectrometers = design.scene.components.filter((c) => c.enabled && c.type === 'spectrometer' &&
    (ids.length === 0 || c.id === ids[0]))
  if (lasers.length !== 1 || spectrometers.length !== 1) throw new RangeError('Laser and Spectrometer identities must be unique.')
  const laser = lasers[0]!
  const component = spectrometers[0]!
  if (laser.type !== 'laser' || component.type !== 'spectrometer') throw new Error('Invalid instrument target types.')
  const material = BUILT_IN_RAMAN_MATERIAL_REGISTRY.resolve(context.material_id)
  const spectrometer = createVirtualSpectrometerConfiguration(component)
  const expected = calculateExpectedCcdSpectrumFromRamanContext({
    context, material, axis: createAutoSpectrumAxis(material),
    excitation_wavelength_nm: laser.parameters.wavelength_nm,
    spectrometer, detector: design.detectorConfiguration,
  })
  return AcquisitionInputSchema.parse({
    id, started_at: startedAt, request: validatedRequest,
    rng: createAcquisitionRngProvenance(seed), expected_spectrum: expected,
    instrument_snapshot: {
      optical_scene: design.scene, simulation_settings: design.simulationConfiguration,
      material, material_dataset: BUILT_IN_RAMAN_MATERIAL_DATASET, spectrometer,
      detector: design.detectorConfiguration, context, configuration_revision: design.revision,
      target: { laser_component_id: laser.id, sample_component_id: context.sample_component_id,
        spectrometer_component_id: component.id, resolution_version: 'unique-traceable-chain-v1' },
      simulation_model_version: { optics: design.simulationConfiguration.model_version,
        raman: context.model_version, raman_spectrum: RAMAN_SPECTRUM_MODEL_VERSION,
        focus: context.focus.model_version, spectrometer: spectrometer.model_version,
        ccd: design.detectorConfiguration.model_version, noise: CCD_NOISE_MODEL_VERSION, contract: ACQUISITION_CONTRACT_VERSION },
    },
  })
}
