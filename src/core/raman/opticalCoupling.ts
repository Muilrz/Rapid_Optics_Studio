import {
  OpticalSceneSchema,
  type ComponentId,
  type ComponentInteractionEvent,
  type DichroicComponent,
  type OpticalRay,
  type OpticalScene,
  type RayId,
  type SampleComponent,
  type TraceResult,
} from '../optics'
import {
  RAMAN_SPECTRUM_MODEL_VERSION,
  RamanSpectrumSynthesisConfigurationSchema,
  type RamanSpectrumSynthesisConfiguration,
  type SpectralBroadeningConfiguration,
} from './contracts'
import {
  RamanFocusContextSchema,
  RAMAN_OPTICAL_CONTEXT_VERSION,
  RamanOpticalContextSchema,
  type RamanFocusContext,
  type RamanOpticalContext,
} from './couplingContracts'
import {
  DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION,
  SIMPLIFIED_FOCUS_MODEL_VERSION,
  SimplifiedFocusConfigurationSchema,
  calculateSimplifiedFocusEfficiency,
  type SimplifiedFocusConfiguration,
} from './focus'
import { DEFAULT_RAMAN_SPECTRUM_SYNTHESIS_CONFIGURATION } from './modelParameters'
import type { RamanMaterialRegistry } from './registry'
import { BUILT_IN_RAMAN_MATERIAL_REGISTRY } from './builtinMaterials'

const POWER_RATIO_TOLERANCE = 1e-12

/**
 * Explicit phenomenological bridge from formal trace power (mW) to the 3B
 * relative signal scales. It is not an absolute Raman cross-section model.
 */
export const RAMAN_OPTICAL_COUPLING_PARAMETERS = Object.freeze({
  model_version: RAMAN_OPTICAL_CONTEXT_VERSION,
  provenance: 'Raman Sandbox normalized trace-power coupling with CR = 1',
  effective_excitation_scale_per_mw: 1,
  rayleigh_leakage_scale_per_mw: 1,
  interpretation: 'provisional semi-quantitative coupling',
})

const validatedUnitInterval = (value: number, label: string): number => {
  if (
    !Number.isFinite(value) ||
    value < -POWER_RATIO_TOLERANCE ||
    value > 1 + POWER_RATIO_TOLERANCE
  ) {
    throw new RangeError(`${label} must be finite in [0, 1].`)
  }
  return Math.min(1, Math.max(0, value))
}

const isDescendantOf = (
  rayId: RayId,
  ancestorRayId: RayId,
  rayById: ReadonlyMap<RayId, OpticalRay>,
): boolean => {
  let current: OpticalRay | undefined = rayById.get(rayId)
  const visited = new Set<RayId>()
  while (current) {
    if (current.rayId === ancestorRayId) return true
    if (visited.has(current.rayId)) {
      throw new RangeError('Optical ray lineage contains a cycle.')
    }
    visited.add(current.rayId)
    current = current.parentRayId
      ? rayById.get(current.parentRayId)
      : undefined
  }
  return false
}

const createFocusContext = (
  event: ComponentInteractionEvent | null,
  configuration: SimplifiedFocusConfiguration,
): RamanFocusContext => {
  if (!event) {
    return RamanFocusContextSchema.parse({
      state: 'not-excited',
      model_version: SIMPLIFIED_FOCUS_MODEL_VERSION,
      objective_component_id: null,
      target_focal_distance_mm: null,
      actual_distance_mm: null,
      defocus_mm: null,
      z_r_mm: configuration.z_r_mm,
      efficiency: 0,
    })
  }

  const metadata =
    event.metadata?.kind === 'sample-placeholder'
      ? event.metadata.focus
      : undefined
  if (
    !metadata ||
    metadata.sampleComponentId === undefined ||
    metadata.actualDistance_mm === undefined ||
    metadata.defocus_mm === undefined
  ) {
    return RamanFocusContextSchema.parse({
      state: 'no-objective-in-lineage',
      model_version: SIMPLIFIED_FOCUS_MODEL_VERSION,
      objective_component_id: null,
      target_focal_distance_mm: null,
      actual_distance_mm: null,
      defocus_mm: null,
      z_r_mm: configuration.z_r_mm,
      efficiency: 1,
    })
  }
  if (metadata.sampleComponentId !== event.componentId) {
    throw new RangeError('Sample focus metadata does not match its interaction.')
  }

  return RamanFocusContextSchema.parse({
    state: 'lineage-focus',
    model_version: SIMPLIFIED_FOCUS_MODEL_VERSION,
    objective_component_id: metadata.objectiveComponentId,
    target_focal_distance_mm: metadata.targetFocalDistance_mm,
    actual_distance_mm: metadata.actualDistance_mm,
    defocus_mm: metadata.defocus_mm,
    z_r_mm: configuration.z_r_mm,
    efficiency: calculateSimplifiedFocusEfficiency(
      metadata.defocus_mm,
      configuration.z_r_mm,
    ),
  })
}

const selectedBranch = (
  event: ComponentInteractionEvent,
  childRayId: RayId,
): 'transmitted' | 'reflected' | null => {
  if (
    event.metadata?.kind !== 'dichroic-routing' &&
    event.metadata?.kind !== 'beam-splitter'
  ) {
    return null
  }
  const childIndex = event.outgoingRayIds.indexOf(childRayId)
  return childIndex < 0 ? null : event.metadata.branchOrder[childIndex] ?? null
}

const rayleighTransitionRatio = (
  parent: OpticalRay,
  child: OpticalRay,
  event: ComponentInteractionEvent,
  sceneComponentById: ReadonlyMap<ComponentId, OpticalScene['components'][number]>,
): number => {
  if (event.metadata?.kind === 'filter-aoi') {
    return event.metadata.rayleighLeakageTransmission
  }

  if (event.componentType === 'dichroic') {
    const component = sceneComponentById.get(event.componentId)
    if (component?.type !== 'dichroic') {
      throw new RangeError('Dichroic lineage event has no matching component.')
    }
    const branch = selectedBranch(event, child.rayId)
    if (!branch) {
      throw new RangeError('Dichroic lineage does not identify its child branch.')
    }
    const dichroic: DichroicComponent = component
    return branch === 'transmitted'
      ? dichroic.parameters.excitation_transmission
      : dichroic.parameters.excitation_reflectivity
  }

  return parent.power_mw === 0 ? 0 : child.power_mw / parent.power_mw
}

interface RayleighPathThroughputs {
  readonly toSpectrometerInput: number
  readonly detected: number
}

const rayleighPathThroughputs = (
  rootRay: OpticalRay,
  spectrometerEvent: ComponentInteractionEvent,
  rayById: ReadonlyMap<RayId, OpticalRay>,
  interactionByRayId: ReadonlyMap<RayId, ComponentInteractionEvent>,
  sceneComponentById: ReadonlyMap<ComponentId, OpticalScene['components'][number]>,
): RayleighPathThroughputs => {
  const spectrometerInputRay = rayById.get(spectrometerEvent.rayId)
  if (!spectrometerInputRay) {
    throw new RangeError(
      'Spectrometer event references a missing optical ray.',
    )
  }

  const reversePath: OpticalRay[] = []
  let current: OpticalRay | undefined = spectrometerInputRay
  while (current && current.rayId !== rootRay.rayId) {
    reversePath.push(current)
    current = current.parentRayId
      ? rayById.get(current.parentRayId)
      : undefined
  }
  if (!current) {
    throw new RangeError(
      'Spectrometer input ray does not descend from the Sample return.',
    )
  }
  reversePath.push(rootRay)
  const path = reversePath.reverse()
  let throughput = 1

  for (let index = 1; index < path.length; index += 1) {
    const parent = path[index - 1]!
    const child = path[index]!
    const event = interactionByRayId.get(parent.rayId)
    if (!event || !event.outgoingRayIds.includes(child.rayId)) {
      throw new RangeError('Optical lineage is missing an interaction transition.')
    }
    throughput *= rayleighTransitionRatio(
      parent,
      child,
      event,
      sceneComponentById,
    )
  }

  const spectrometerRatio =
    spectrometerInputRay.power_mw === 0
      ? 0
      : spectrometerEvent.power.detected_power_mw /
        spectrometerInputRay.power_mw
  const toSpectrometerInput = validatedUnitInterval(
    throughput,
    'Rayleigh path throughput to Spectrometer input',
  )
  return Object.freeze({
    toSpectrometerInput,
    detected: validatedUnitInterval(
      toSpectrometerInput * spectrometerRatio,
      'Detected Rayleigh path throughput',
    ),
  })
}

export interface BuildRamanOpticalContextsOptions {
  readonly materialRegistry?: RamanMaterialRegistry
  readonly focusConfiguration?: SimplifiedFocusConfiguration
}

/** Builds one context per actual Sample hit plus one zero context per unhit Sample. */
export const buildRamanOpticalContexts = (
  scene: OpticalScene,
  trace: TraceResult,
  options: BuildRamanOpticalContextsOptions = {},
): readonly RamanOpticalContext[] => {
  const parsedScene = OpticalSceneSchema.parse(scene)
  const materialRegistry =
    options.materialRegistry ?? BUILT_IN_RAMAN_MATERIAL_REGISTRY
  const focusConfiguration = SimplifiedFocusConfigurationSchema.parse(
    options.focusConfiguration ?? DEFAULT_SIMPLIFIED_FOCUS_CONFIGURATION,
  )
  const rayById = new Map(trace.rays.map((ray) => [ray.rayId, ray]))
  const interactions = trace.events.filter(
    (event): event is ComponentInteractionEvent =>
      event.kind === 'component-interaction',
  )
  const interactionByRayId = new Map(
    interactions.map((event) => [event.rayId, event]),
  )
  const sceneComponentById = new Map(
    parsedScene.components.map((component) => [component.id, component]),
  )
  const samples = parsedScene.components.filter(
    (component): component is SampleComponent => component.type === 'sample',
  )
  const sampleEvents = interactions.filter(
    (event) =>
      event.componentType === 'sample' &&
      event.outcome === 'sample-placeholder-return',
  )
  const hitSampleIds = new Set(sampleEvents.map(({ componentId }) => componentId))
  const contexts: RamanOpticalContext[] = []

  for (const event of sampleEvents) {
    const sample = sceneComponentById.get(event.componentId)
    if (sample?.type !== 'sample') {
      throw new RangeError('Sample interaction has no matching Sample component.')
    }
    materialRegistry.resolve(sample.parameters.material_id)
    const incomingRay = rayById.get(event.rayId)
    if (!incomingRay || incomingRay.kind !== 'excitation') {
      throw new RangeError('Sample interaction references no excitation ray.')
    }
    const returnRay = event.outgoingRayIds
      .map((rayId) => rayById.get(rayId))
      .find((ray) => ray?.kind === 'sample-return-placeholder')
    const focus = createFocusContext(event, focusConfiguration)
    const effectiveExcitationPower =
      event.power.incoming_power_mw * focus.efficiency
    const spectrometerEvents = returnRay
      ? interactions.filter(
          (candidate) =>
            candidate.componentType === 'spectrometer' &&
            candidate.metadata?.kind === 'spectrometer-acceptance' &&
            candidate.metadata.accepted &&
            isDescendantOf(candidate.rayId, returnRay.rayId, rayById),
        )
      : []
    const powerAtSpectrometerInput = spectrometerEvents.reduce(
      (sum, spectrometerEvent) =>
        sum + (rayById.get(spectrometerEvent.rayId)?.power_mw ?? 0),
      0,
    )
    const throughputToSpectrometerInput = validatedUnitInterval(
      event.power.incoming_power_mw === 0
        ? 0
        : powerAtSpectrometerInput / event.power.incoming_power_mw,
      'Raman return throughput to Spectrometer input',
    )
    const detectedPlaceholderPower = spectrometerEvents.reduce(
      (sum, spectrometerEvent) =>
        sum + spectrometerEvent.power.detected_power_mw,
      0,
    )
    const ramanThroughput = validatedUnitInterval(
      event.power.incoming_power_mw === 0
        ? 0
        : detectedPlaceholderPower / event.power.incoming_power_mw,
      'Raman return throughput',
    )
    const rayleighPathValues = returnRay
      ? spectrometerEvents.map((spectrometerEvent) =>
          rayleighPathThroughputs(
            returnRay,
            spectrometerEvent,
            rayById,
            interactionByRayId,
            sceneComponentById,
          ),
        )
      : []
    const rayleighThroughputToSpectrometerInput = validatedUnitInterval(
      rayleighPathValues.reduce(
        (sum, path) => sum + path.toSpectrometerInput,
        0,
      ),
      'Combined Rayleigh throughput to Spectrometer input',
    )
    const rayleighThroughput = validatedUnitInterval(
      rayleighPathValues.reduce((sum, path) => sum + path.detected, 0),
      'Combined detected Rayleigh return throughput',
    )
    const detectedEffectiveExcitationPower =
      effectiveExcitationPower * ramanThroughput
    const detectedEffectiveLeakagePower =
      effectiveExcitationPower * rayleighThroughput
    const pathState =
      detectedEffectiveExcitationPower > 0
        ? 'valid-signal-path'
        : 'excited-no-return-path'

    contexts.push(
      RamanOpticalContextSchema.parse({
        model_version: RAMAN_OPTICAL_CONTEXT_VERSION,
        path_state: pathState,
        sample_component_id: sample.id,
        material_id: sample.parameters.material_id,
        source_component_id: incomingRay.sourceComponentId,
        excitation_ray_id: incomingRay.rayId,
        sample_return_ray_id: returnRay?.rayId ?? null,
        excitation_wavelength_nm: incomingRay.wavelength_nm,
        excitation_reached_sample: true,
        excitation_power_at_sample_mw: event.power.incoming_power_mw,
        focus,
        effective_excitation_power_mw: effectiveExcitationPower,
        raman_return: {
          path_reaches_spectrometer: spectrometerEvents.length > 0,
          power_at_spectrometer_input_mw: powerAtSpectrometerInput,
          throughput_to_spectrometer_input: throughputToSpectrometerInput,
          detected_return_probe_power_mw: detectedPlaceholderPower,
          throughput: ramanThroughput,
          detected_effective_excitation_power_mw:
            detectedEffectiveExcitationPower,
          spectrometer_component_ids: [
            ...new Set(
              spectrometerEvents.map(({ componentId }) => componentId),
            ),
          ],
        },
        rayleigh_return: {
          geometric_path_reaches_spectrometer:
            spectrometerEvents.length > 0,
          leakage_throughput_to_spectrometer_input:
            rayleighThroughputToSpectrometerInput,
          effective_leakage_power_at_spectrometer_input_mw:
            effectiveExcitationPower *
            rayleighThroughputToSpectrometerInput,
          leakage_throughput: rayleighThroughput,
          detected_effective_leakage_power_mw:
            detectedEffectiveLeakagePower,
        },
      }),
    )
  }

  for (const sample of samples) {
    if (hitSampleIds.has(sample.id)) continue
    materialRegistry.resolve(sample.parameters.material_id)
    const focus = createFocusContext(null, focusConfiguration)
    contexts.push(
      RamanOpticalContextSchema.parse({
        model_version: RAMAN_OPTICAL_CONTEXT_VERSION,
        path_state: 'no-excitation-path',
        sample_component_id: sample.id,
        material_id: sample.parameters.material_id,
        source_component_id: null,
        excitation_ray_id: null,
        sample_return_ray_id: null,
        excitation_wavelength_nm: null,
        excitation_reached_sample: false,
        excitation_power_at_sample_mw: 0,
        focus,
        effective_excitation_power_mw: 0,
        raman_return: {
          path_reaches_spectrometer: false,
          power_at_spectrometer_input_mw: 0,
          throughput_to_spectrometer_input: 0,
          detected_return_probe_power_mw: 0,
          throughput: 0,
          detected_effective_excitation_power_mw: 0,
          spectrometer_component_ids: [],
        },
        rayleigh_return: {
          geometric_path_reaches_spectrometer: false,
          leakage_throughput_to_spectrometer_input: 0,
          effective_leakage_power_at_spectrometer_input_mw: 0,
          leakage_throughput: 0,
          detected_effective_leakage_power_mw: 0,
        },
      }),
    )
  }

  return Object.freeze(contexts)
}

/** Bridges the 3C optical result into the existing 3B synthesis input scale. */
export const createSpectrumConfigurationFromOpticalContext = (
  context: RamanOpticalContext,
  broadening: SpectralBroadeningConfiguration =
    DEFAULT_RAMAN_SPECTRUM_SYNTHESIS_CONFIGURATION.broadening,
): RamanSpectrumSynthesisConfiguration =>
  RamanSpectrumSynthesisConfigurationSchema.parse({
    model_version: RAMAN_SPECTRUM_MODEL_VERSION,
    effective_excitation_scale:
      context.raman_return.detected_effective_excitation_power_mw *
      RAMAN_OPTICAL_COUPLING_PARAMETERS.effective_excitation_scale_per_mw,
    rayleigh_leakage_scale:
      context.rayleigh_return.detected_effective_leakage_power_mw *
      RAMAN_OPTICAL_COUPLING_PARAMETERS.rayleigh_leakage_scale_per_mw,
    broadening,
  })
