import type { OpticalComponentType, ComponentId, Vec2 } from '../model'
import type { OpticalRay, RayId } from './opticalRay'

export type TraceTerminationReason =
  | 'escaped-scene'
  | 'absorbed'
  | 'detected'
  | 'max-generation'
  | 'max-ray-count'
  | 'below-minimum-power'

export type InteractionOutcome =
  | 'ideal-reflection'
  | 'sample-placeholder-return'
  | 'terminal-detection'
  | 'absorbed'

export interface TraceSegment {
  readonly rayId: RayId
  readonly start: Vec2
  readonly end: Vec2
  readonly distance_mm: number
  readonly hitComponentId: ComponentId | null
}

interface TraceEventBase {
  readonly sequence: number
  readonly rayId: RayId
}

export interface SourceEmissionEvent extends TraceEventBase {
  readonly kind: 'source-emission'
  readonly componentId: ComponentId
}

export interface ComponentInteractionEvent extends TraceEventBase {
  readonly kind: 'component-interaction'
  readonly componentId: ComponentId
  readonly componentType: OpticalComponentType
  readonly point: Vec2
  readonly outcome: InteractionOutcome
  readonly outgoingRayIds: readonly RayId[]
}

export interface TerminationEvent extends TraceEventBase {
  readonly kind: 'termination'
  readonly reason: TraceTerminationReason
  readonly componentId: ComponentId | null
}

export type TraceEvent =
  | SourceEmissionEvent
  | ComponentInteractionEvent
  | TerminationEvent

export interface TraceResult {
  readonly rays: readonly OpticalRay[]
  readonly segments: readonly TraceSegment[]
  readonly events: readonly TraceEvent[]
  readonly processedRayCount: number
}
