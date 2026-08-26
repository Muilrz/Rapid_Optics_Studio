import type { OpticalComponentType, ComponentId, Vec2 } from '../model'
import type {
  ObjectiveFocusMetadata,
  OpticalRay,
  RayId,
} from './opticalRay'

export type TraceTerminationReason =
  | 'escaped-scene'
  | 'absorbed'
  | 'detected'
  | 'blocked-by-aperture'
  | 'rejected-by-acceptance'
  | 'max-generation'
  | 'max-ray-count'
  | 'below-minimum-power'

export type InteractionOutcome =
  | 'ideal-reflection'
  | 'sample-placeholder-return'
  | 'terminal-detection'
  | 'detector-rejected'
  | 'objective-pass'
  | 'dichroic-routing'
  | 'filter-transmission'
  | 'beam-split'
  | 'prism-deflection'
  | 'aperture-pass'
  | 'aperture-blocked'
  | 'absorbed'

export interface InteractionPowerAccounting {
  readonly incoming_power_mw: number
  readonly outgoing_power_mw: number
  readonly detected_power_mw: number
  readonly lost_power_mw: number
}

export type IncidenceSide = 'front' | 'back'

export type OpticalInteractionMetadata =
  | {
      readonly kind: 'objective-focus'
      readonly focus: ObjectiveFocusMetadata
    }
  | {
      readonly kind: 'sample-placeholder'
      readonly focus?: ObjectiveFocusMetadata
    }
  | {
      readonly kind: 'dichroic-routing'
      readonly incidenceSide: IncidenceSide
      readonly branchOrder: readonly ('transmitted' | 'reflected')[]
    }
  | {
      readonly kind: 'filter-aoi'
      readonly incidenceAngle_deg: number
      readonly transmission: number
    }
  | {
      readonly kind: 'beam-splitter'
      readonly incidenceSide: IncidenceSide
      readonly branchOrder: readonly ('transmitted' | 'reflected')[]
    }
  | {
      readonly kind: 'prism-deflection'
      readonly signedDeflection_deg: number
    }
  | {
      readonly kind: 'pinhole-aperture'
      readonly localOffset_mm: number
      readonly passed: boolean
    }
  | {
      readonly kind: 'spectrometer-acceptance'
      readonly incidenceAngle_deg: number
      readonly accepted: boolean
    }

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
  readonly power: InteractionPowerAccounting
  readonly metadata?: OpticalInteractionMetadata
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
