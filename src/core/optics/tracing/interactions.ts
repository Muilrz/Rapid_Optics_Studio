import { add, reflect, scale, type GeometryHit } from '../geometry'
import type { MirrorComponent } from '../model'
import type { TraceTerminationReason, InteractionOutcome } from './contracts'
import type { TraceInteractionComponent } from './geometryAdapter'
import {
  createChildOpticalRay,
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
  readonly terminationReason?: Extract<
    TraceTerminationReason,
    'absorbed' | 'detected'
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

const interactWithMirror = (
  incoming: OpticalRay,
  component: MirrorComponent,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  const power_mw = incoming.power_mw * component.parameters.reflectivity
  if (power_mw === 0) {
    return Object.freeze({
      outgoingRays: Object.freeze([]),
      outcome: 'absorbed' as const,
      terminationReason: 'absorbed' as const,
    })
  }

  const direction = reflect(incoming.geometry.direction, hit.normal)
  const outgoing = createChildOpticalRay(incoming, {
    rayId: context.nextRayId(),
    origin: offsetOrigin(hit, direction, context.rayOriginOffset_mm),
    direction,
    power_mw,
  })

  return Object.freeze({
    outgoingRays: Object.freeze([outgoing]),
    outcome: 'ideal-reflection' as const,
  })
}

const interactWithSample = (
  incoming: OpticalRay,
  hit: GeometryHit,
  context: InteractionContext,
): OpticalInteractionResult => {
  // Tracer-stage placeholder only: strict elastic back-return, not Raman physics.
  const direction = scale(incoming.geometry.direction, -1)
  const outgoing = createChildOpticalRay(incoming, {
    rayId: context.nextRayId(),
    origin: offsetOrigin(hit, direction, context.rayOriginOffset_mm),
    direction,
    power_mw: incoming.power_mw,
    kind: 'sample-return-placeholder',
  })

  return Object.freeze({
    outgoingRays: Object.freeze([outgoing]),
    outcome: 'sample-placeholder-return' as const,
  })
}

const interactWithSpectrometer = (): OpticalInteractionResult =>
  Object.freeze({
    outgoingRays: Object.freeze([]),
    outcome: 'terminal-detection' as const,
    terminationReason: 'detected' as const,
  })

export const interactWithComponent: OpticalInteraction = (
  incoming,
  component,
  hit,
  context,
) => {
  switch (component.type) {
    case 'mirror':
      return interactWithMirror(incoming, component, hit, context)
    case 'sample':
      return interactWithSample(incoming, hit, context)
    case 'spectrometer':
      return interactWithSpectrometer()
  }
}
