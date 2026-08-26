import {
  add,
  cross,
  dot,
  length,
  reflect,
  rotate,
  scale,
  subtract,
  vec2,
  type GeometryHit,
} from '../geometry'
import type {
  BeamSplitterComponent,
  DichroicComponent,
  FilterComponent,
  MirrorComponent,
  ObjectiveComponent,
  PinholeComponent,
  PrismComponent,
  SampleComponent,
  SpectrometerComponent,
} from '../model'
import type {
  IncidenceSide,
  InteractionOutcome,
  InteractionPowerAccounting,
  OpticalInteractionMetadata,
  TraceTerminationReason,
} from './contracts'
import type { TraceInteractionComponent } from './geometryAdapter'
import { TRACING_NUMERIC_POLICY } from './numericPolicy'
import {
  createChildOpticalRay,
  type ObjectiveFocusMetadata,
  type OpticalRay,
  type RayId,
} from './opticalRay'

export interface InteractionContext {
  readonly nextRayId: () => RayId
  /** Forward offset in world millimetres applied to every outgoing ray. */
  readonly rayOriginOffset_mm: number
}

export interface OpticalInteractionResult {
  readonly outgoingRays: readonly OpticalRay[]
  readonly outcome: InteractionOutcome
  readonly power: InteractionPowerAccounting
  readonly metadata?: OpticalInteractionMetadata
  readonly terminationReason?: Extract<
    TraceTerminationReason,
    | 'absorbed'
    | 'detected'
    | 'blocked-by-aperture'
    | 'rejected-by-acceptance'
  >
}

export type OpticalInteraction = (
  incoming: OpticalRay,
  component: TraceInteractionComponent,
  hit: GeometryHit,
  context: InteractionContext,
) => OpticalInteractionResult

const offsetOrigin = (
  hit: GeometryHit,
  direction: OpticalRay['geometry']['direction'],
  offset_mm: number,
) => {
  if (!Number.isFinite(offset_mm) || offset_mm <= 0) {
    throw new RangeError('Ray origin offset must be finite and positive.')
  }
  return add(hit.point, scale(direction, offset_mm))
}

const incidenceAngle_deg = (ray: OpticalRay, hit: GeometryHit): number => {
  const cosine = Math.min(1, Math.max(0, Math.abs(dot(ray.geometry.direction, hit.normal))))
  return (Math.acos(cosine) * 180) / Math.PI
}

const incidenceSide = (ray: OpticalRay, hit: GeometryHit): IncidenceSide =>
  dot(ray.geometry.direction, hit.normal) < 0 ? 'front' : 'back'

const normalizedCoefficients = (
  first: number,
  second: number,
): readonly [number, number] => {
  const total = first + second
  if (total <= 1) return Object.freeze([first, second])
  return Object.freeze([first / total, second / total])
}

interface ResultOptions {
  readonly outcome: InteractionOutcome
  readonly metadata?: OpticalInteractionMetadata
  readonly terminationReason?: OpticalInteractionResult['terminationReason']
  readonly detectedPower_mw?: number
}

const createResult = (
  incoming: OpticalRay,
  outgoingRays: readonly OpticalRay[],
  options: ResultOptions,
): OpticalInteractionResult => {
  const outgoing_power_mw = outgoingRays.reduce(
    (sum, outgoing) => sum + outgoing.power_mw,
    0,
  )
  const detected_power_mw = options.detectedPower_mw ?? 0
  const accountedPower = outgoing_power_mw + detected_power_mw
  const tolerance =
    Math.max(1, incoming.power_mw) * TRACING_NUMERIC_POLICY.relativePower
  if (accountedPower > incoming.power_mw + tolerance) {
    throw new RangeError('Optical interaction cannot create power.')
  }

  const power = Object.freeze({
    incoming_power_mw: incoming.power_mw,
    outgoing_power_mw,
    detected_power_mw,
    lost_power_mw: Math.max(0, incoming.power_mw - accountedPower),
  })

  return Object.freeze({
    outgoingRays: Object.freeze([...outgoingRays]),
    outcome: options.outcome,
    power,
    metadata: options.metadata,
    terminationReason: options.terminationReason,
  })
}

interface OutgoingOptions {
  readonly direction: OpticalRay['geometry']['direction']
  readonly power_mw: number
  readonly kind?: OpticalRay['kind']
  readonly focusMetadata?: ObjectiveFocusMetadata
}

const createOutgoingRay = (
  incoming: OpticalRay,
  hit: GeometryHit,
  context: InteractionContext,
  options: OutgoingOptions,
): OpticalRay =>
  createChildOpticalRay(incoming, {
    rayId: context.nextRayId(),
    origin: offsetOrigin(hit, options.direction, context.rayOriginOffset_mm),
    direction: options.direction,
    power_mw: options.power_mw,
    kind: options.kind,
    focusMetadata: options.focusMetadata,
  })

const interactWithMirror = (
  incoming: OpticalRay,
  component: MirrorComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const power_mw = incoming.power_mw * component.parameters.reflectivity
  if (power_mw === 0) {
    return createResult(incoming, [], {
      outcome: 'absorbed',
      terminationReason: 'absorbed',
    })
  }

  const direction = reflect(incoming.geometry.direction, hit.normal)
  return createResult(
    incoming,
    [createOutgoingRay(incoming, hit, context, { direction, power_mw })],
    { outcome: 'ideal-reflection' },
  )
}

const interactWithObjective = (
  incoming: OpticalRay,
  component: ObjectiveComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const focus: ObjectiveFocusMetadata =
    incoming.kind === 'sample-return-placeholder' && incoming.focusMetadata
      ? incoming.focusMetadata
      : Object.freeze({
          objectiveComponentId: component.id,
          objectivePosition_mm: vec2(
            component.transform.x_mm,
            component.transform.y_mm,
          ),
          targetFocalDistance_mm: component.parameters.focal_length_mm,
        })
  const outgoing = createOutgoingRay(incoming, hit, context, {
    direction: incoming.geometry.direction,
    power_mw: incoming.power_mw,
    focusMetadata: focus,
  })

  return createResult(incoming, [outgoing], {
    outcome: 'objective-pass',
    metadata: Object.freeze({ kind: 'objective-focus', focus }),
  })
}

const interactWithSample = (
  incoming: OpticalRay,
  component: SampleComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  if (incoming.kind !== 'excitation') {
    return createResult(incoming, [], {
      outcome: 'absorbed',
      terminationReason: 'absorbed',
    })
  }

  let focus: ObjectiveFocusMetadata | undefined
  if (incoming.focusMetadata) {
    const actualDistance_mm = length(
      subtract(
        vec2(component.transform.x_mm, component.transform.y_mm),
        incoming.focusMetadata.objectivePosition_mm,
      ),
    )
    focus = Object.freeze({
      ...incoming.focusMetadata,
      sampleComponentId: component.id,
      actualDistance_mm,
      defocus_mm:
        actualDistance_mm - incoming.focusMetadata.targetFocalDistance_mm,
    })
  }

  // Tracer-stage placeholder only: strict elastic back-return, not Raman physics.
  const direction = scale(incoming.geometry.direction, -1)
  const outgoing = createOutgoingRay(incoming, hit, context, {
    direction,
    power_mw: incoming.power_mw,
    kind: 'sample-return-placeholder',
    focusMetadata: focus,
  })

  return createResult(incoming, [outgoing], {
    outcome: 'sample-placeholder-return',
    metadata: Object.freeze({ kind: 'sample-placeholder', focus }),
  })
}

const interactWithDichroic = (
  incoming: OpticalRay,
  component: DichroicComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const outgoing: OpticalRay[] = []
  const branchOrder: ('transmitted' | 'reflected')[] = []

  if (incoming.kind === 'sample-return-placeholder') {
    const transmission = component.parameters.raman_transmission
    if (transmission > 0) {
      branchOrder.push('transmitted')
      outgoing.push(
        createOutgoingRay(incoming, hit, context, {
          direction: incoming.geometry.direction,
          power_mw: incoming.power_mw * transmission,
        }),
      )
    }
  } else {
    const [transmission, reflection] = normalizedCoefficients(
      component.parameters.excitation_transmission,
      component.parameters.excitation_reflectivity,
    )
    if (transmission > 0) {
      branchOrder.push('transmitted')
      outgoing.push(
        createOutgoingRay(incoming, hit, context, {
          direction: incoming.geometry.direction,
          power_mw: incoming.power_mw * transmission,
        }),
      )
    }
    if (reflection > 0) {
      branchOrder.push('reflected')
      outgoing.push(
        createOutgoingRay(incoming, hit, context, {
          direction: reflect(incoming.geometry.direction, hit.normal),
          power_mw: incoming.power_mw * reflection,
        }),
      )
    }
  }

  return createResult(incoming, outgoing, {
    outcome: 'dichroic-routing',
    metadata: Object.freeze({
      kind: 'dichroic-routing',
      incidenceSide: incidenceSide(incoming, hit),
      branchOrder: Object.freeze(branchOrder),
    }),
    terminationReason: outgoing.length === 0 ? 'absorbed' : undefined,
  })
}

const filterTransmission = (
  component: FilterComponent,
  ray: OpticalRay,
  hit: GeometryHit,
): readonly [number, number] => {
  const angle = incidenceAngle_deg(ray, hit)
  if (ray.kind === 'sample-return-placeholder') {
    return Object.freeze([component.parameters.raman_transmission, angle])
  }

  const baseline = 10 ** -component.parameters.rayleigh_suppression_od
  if (component.parameters.leakage_model === 'constant') {
    return Object.freeze([baseline, angle])
  }

  const exponent =
    -(angle - component.parameters.leakage_midpoint_aoi_deg) /
    component.parameters.leakage_transition_width_deg
  const leakage = baseline + (1 - baseline) / (1 + Math.exp(exponent))
  return Object.freeze([Math.min(1, Math.max(0, leakage)), angle])
}

const interactWithFilter = (
  incoming: OpticalRay,
  component: FilterComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const [transmission, angle] = filterTransmission(component, incoming, hit)
  const outgoing =
    transmission > 0
      ? [
          createOutgoingRay(incoming, hit, context, {
            direction: incoming.geometry.direction,
            power_mw: incoming.power_mw * transmission,
          }),
        ]
      : []

  return createResult(incoming, outgoing, {
    outcome: 'filter-transmission',
    metadata: Object.freeze({
      kind: 'filter-aoi',
      incidenceAngle_deg: angle,
      transmission,
    }),
    terminationReason: outgoing.length === 0 ? 'absorbed' : undefined,
  })
}

const interactWithBeamSplitter = (
  incoming: OpticalRay,
  component: BeamSplitterComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const [transmission, reflection] = normalizedCoefficients(
    component.parameters.transmission_ratio,
    component.parameters.reflection_ratio,
  )
  const outgoing: OpticalRay[] = []
  const branchOrder: ('transmitted' | 'reflected')[] = []

  // Fixed semantic order controls both ray IDs and FIFO processing.
  if (transmission > 0) {
    branchOrder.push('transmitted')
    outgoing.push(
      createOutgoingRay(incoming, hit, context, {
        direction: incoming.geometry.direction,
        power_mw: incoming.power_mw * transmission,
      }),
    )
  }
  if (reflection > 0) {
    branchOrder.push('reflected')
    outgoing.push(
      createOutgoingRay(incoming, hit, context, {
        direction: reflect(incoming.geometry.direction, hit.normal),
        power_mw: incoming.power_mw * reflection,
      }),
    )
  }

  return createResult(incoming, outgoing, {
    outcome: 'beam-split',
    metadata: Object.freeze({
      kind: 'beam-splitter',
      incidenceSide: incidenceSide(incoming, hit),
      branchOrder: Object.freeze(branchOrder),
    }),
    terminationReason: outgoing.length === 0 ? 'absorbed' : undefined,
  })
}

const interactWithPrism = (
  incoming: OpticalRay,
  component: PrismComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const sign = cross(incoming.geometry.direction, hit.tangent) >= 0 ? 1 : -1
  const signedDeflection_deg = sign * component.parameters.deflection_angle_deg
  const direction = rotate(
    incoming.geometry.direction,
    signedDeflection_deg,
  )
  const outgoing = createOutgoingRay(incoming, hit, context, {
    direction,
    power_mw: incoming.power_mw,
  })

  return createResult(incoming, [outgoing], {
    outcome: 'prism-deflection',
    metadata: Object.freeze({
      kind: 'prism-deflection',
      signedDeflection_deg,
    }),
  })
}

const interactWithPinhole = (
  incoming: OpticalRay,
  _component: PinholeComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  if (hit.primitiveKind !== 'aperture-plane') {
    throw new TypeError('Pinhole requires an aperture-plane geometry hit.')
  }

  if (!hit.insideAperture) {
    return createResult(incoming, [], {
      outcome: 'aperture-blocked',
      metadata: Object.freeze({
        kind: 'pinhole-aperture',
        localOffset_mm: hit.localOffset_mm,
        passed: false,
      }),
      terminationReason: 'blocked-by-aperture',
    })
  }

  const outgoing = createOutgoingRay(incoming, hit, context, {
    direction: incoming.geometry.direction,
    power_mw: incoming.power_mw,
  })
  return createResult(incoming, [outgoing], {
    outcome: 'aperture-pass',
    metadata: Object.freeze({
      kind: 'pinhole-aperture',
      localOffset_mm: hit.localOffset_mm,
      passed: true,
    }),
  })
}

const interactWithSpectrometer = (
  incoming: OpticalRay,
  component: SpectrometerComponent,
  hit: GeometryHit,
): OpticalInteractionResult => {
  const angle = incidenceAngle_deg(incoming, hit)
  const accepted =
    angle <=
    component.parameters.acceptance_half_angle_deg +
      TRACING_NUMERIC_POLICY.angleBoundary_deg
  const detectedPower = accepted
    ? incoming.power_mw * component.parameters.optical_throughput
    : 0

  return createResult(incoming, [], {
    outcome: accepted ? 'terminal-detection' : 'detector-rejected',
    metadata: Object.freeze({
      kind: 'spectrometer-acceptance',
      incidenceAngle_deg: angle,
      accepted,
    }),
    terminationReason: accepted ? 'detected' : 'rejected-by-acceptance',
    detectedPower_mw: detectedPower,
  })
}

export const interactWithComponent: OpticalInteraction = (
  incoming,
  component,
  hit,
  context,
) => {
  switch (component.type) {
    case 'mirror':
      return interactWithMirror(incoming, component, hit, context)
    case 'dichroic':
      return interactWithDichroic(incoming, component, hit, context)
    case 'objective':
      return interactWithObjective(incoming, component, hit, context)
    case 'sample':
      return interactWithSample(incoming, component, hit, context)
    case 'filter':
      return interactWithFilter(incoming, component, hit, context)
    case 'spectrometer':
      return interactWithSpectrometer(incoming, component, hit)
    case 'prism':
      return interactWithPrism(incoming, component, hit, context)
    case 'beam-splitter':
      return interactWithBeamSplitter(incoming, component, hit, context)
    case 'pinhole':
      return interactWithPinhole(incoming, component, hit, context)
  }
}
