import {
  add,
  findNearestPositiveIntersection,
  scale,
  vec2,
} from '../geometry'
import type {
  ComponentId,
  LaserComponent,
  OpticalScene,
  SimulationConfiguration,
  Vec2,
} from '../model'
import type {
  ComponentInteractionEvent,
  SourceEmissionEvent,
  TerminationEvent,
  TraceEvent,
  TraceResult,
  TraceSegment,
  TraceTerminationReason,
} from './contracts'
import { buildComponentGeometryCandidates } from './geometryAdapter'
import { interactWithComponent } from './interactions'
import { emitLaserRay } from './laserSource'
import {
  createSequentialRayIdGenerator,
  type OpticalRay,
} from './opticalRay'

const compareIds = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const freezePoint = (point: Vec2): Vec2 => vec2(point.x, point.y)

export const traceOpticalScene = (
  scene: OpticalScene,
  configuration: SimulationConfiguration,
): TraceResult => {
  const idGenerator = createSequentialRayIdGenerator()
  const candidates = buildComponentGeometryCandidates(scene.components)
  const candidateComponents = new Map(
    candidates.map((candidate) => [candidate.key, candidate.component]),
  )
  const lasers = scene.components
    .filter(
      (component): component is LaserComponent =>
        component.type === 'laser' && component.enabled,
    )
    .sort((left, right) => compareIds(left.id, right.id))

  const rays: OpticalRay[] = []
  const queue: OpticalRay[] = []
  const segments: TraceSegment[] = []
  const events: TraceEvent[] = []
  let processedRayCount = 0
  let eventSequence = 0

  const recordEvent = <Event extends TraceEvent>(
    event: Omit<Event, 'sequence'>,
  ): void => {
    eventSequence += 1
    events.push(Object.freeze({ ...event, sequence: eventSequence }) as Event)
  }

  const terminate = (
    ray: OpticalRay,
    reason: TraceTerminationReason,
    componentId: ComponentId | null = null,
  ): void =>
    recordEvent<TerminationEvent>({
      kind: 'termination',
      rayId: ray.rayId,
      reason,
      componentId,
    })

  for (const laser of lasers) {
    const ray = emitLaserRay(laser, idGenerator)
    if (!ray) continue
    rays.push(ray)
    queue.push(ray)
    recordEvent<SourceEmissionEvent>({
      kind: 'source-emission',
      rayId: ray.rayId,
      componentId: laser.id,
    })
  }

  let queueIndex = 0
  while (queueIndex < queue.length) {
    if (processedRayCount >= configuration.max_rays) {
      for (; queueIndex < queue.length; queueIndex += 1) {
        terminate(queue[queueIndex]!, 'max-ray-count')
      }
      break
    }

    const ray = queue[queueIndex]!
    queueIndex += 1
    processedRayCount += 1

    if (ray.generation >= configuration.max_generations) {
      terminate(ray, 'max-generation')
      continue
    }
    if (ray.power_mw < configuration.min_ray_power_mw) {
      terminate(ray, 'below-minimum-power')
      continue
    }

    const nearest = findNearestPositiveIntersection(ray.geometry, candidates)
    if (
      !nearest ||
      nearest.hit.distance_mm > configuration.scene_escape_distance_mm
    ) {
      const end = add(
        ray.geometry.origin,
        scale(ray.geometry.direction, configuration.scene_escape_distance_mm),
      )
      segments.push(
        Object.freeze({
          rayId: ray.rayId,
          start: freezePoint(ray.geometry.origin),
          end,
          distance_mm: configuration.scene_escape_distance_mm,
          hitComponentId: null,
        }),
      )
      terminate(ray, 'escaped-scene')
      continue
    }

    const component = candidateComponents.get(nearest.candidateKey)
    if (!component) {
      throw new Error(`Missing component for candidate: ${nearest.candidateKey}`)
    }

    segments.push(
      Object.freeze({
        rayId: ray.rayId,
        start: freezePoint(ray.geometry.origin),
        end: freezePoint(nearest.hit.point),
        distance_mm: nearest.hit.distance_mm,
        hitComponentId: component.id,
      }),
    )

    const result = interactWithComponent(ray, component, nearest.hit, {
      nextRayId: () => idGenerator.next(),
      rayOriginOffset_mm: configuration.ray_origin_offset_mm,
    })

    recordEvent<ComponentInteractionEvent>({
      kind: 'component-interaction',
      rayId: ray.rayId,
      componentId: component.id,
      componentType: component.type,
      point: freezePoint(nearest.hit.point),
      outcome: result.outcome,
      outgoingRayIds: Object.freeze(
        result.outgoingRays.map((outgoing) => outgoing.rayId),
      ),
      power: result.power,
      metadata: result.metadata,
    })

    if (result.outgoingRays.length === 0) {
      terminate(ray, result.terminationReason ?? 'absorbed', component.id)
      continue
    }

    for (const outgoing of result.outgoingRays) {
      rays.push(outgoing)
      queue.push(outgoing)
    }
  }

  return Object.freeze({
    rays: Object.freeze(rays),
    segments: Object.freeze(segments),
    events: Object.freeze(events),
    processedRayCount,
  })
}
