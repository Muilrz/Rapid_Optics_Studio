import type { Breadboard, OpticalComponent, OpticalScene, RayId, TraceResult, Vec2 } from '../../core/optics'
import type { RamanOpticalContext } from '../../core/raman'

export type Point3 = readonly [x: number, height: number, z: number]

export const benchPoint = ({ x, y }: Vec2, height = 0): Point3 => [x, height, -y]

export const boardCenter = (board: Breadboard): Point3 =>
  benchPoint({
    x: board.origin_mm.x + board.width_mm / 2,
    y: board.origin_mm.y - board.height_mm / 2,
  })

export const componentPose = ({ transform, visualization }: OpticalComponent) => ({
  position: benchPoint({ x: transform.x_mm, y: transform.y_mm }, visualization.beam_height_mm),
  yaw: (transform.rotation_deg % 360) * Math.PI / 180,
})

export interface BeamSegment {
  readonly id: RayId
  readonly start: Point3
  readonly end: Point3
  readonly wavelength: number
  readonly kind: 'excitation' | 'return-probe' | 'raman'
  readonly rayleigh: boolean
}

export interface SampleMarker {
  readonly id: RayId
  readonly position: Point3
  readonly wavelength: number
  readonly focus: RamanOpticalContext['focus']
  readonly cone: { readonly base: Point3; readonly radius: number } | null
}

export function buildOpticalPresentation(
  scene: OpticalScene,
  trace: TraceResult,
  contexts: readonly RamanOpticalContext[],
) {
  const components = new Map(scene.components.map((component) => [component.id, component]))
  const rays = new Map(trace.rays.map((ray) => [ray.rayId, ray]))
  const interactions = trace.events.filter((event) => event.kind === 'component-interaction')
  const hits = new Map(interactions.map((event) => [event.rayId, event]))
  const contextByReturn = new Map(contexts.map((context) => [context.sample_return_ray_id, context]))
  const raman = new Set<RayId>()
  const rayleighCandidates = new Map<RamanOpticalContext, RayId[][]>()

  for (const event of interactions) {
    if (event.outcome !== 'terminal-detection') continue
    const lineage: RayId[] = []
    for (let ray = rays.get(event.rayId); ray?.kind === 'sample-return-placeholder';
      ray = ray.parentRayId ? rays.get(ray.parentRayId) : undefined) {
      lineage.push(ray.rayId)
      const context = contextByReturn.get(ray.rayId)
      if (!context) continue
      if (context.effective_excitation_power_mw > 0 && context.raman_return.path_reaches_spectrometer) {
        lineage.forEach((id) => raman.add(id))
      }
      if (context.rayleigh_return.effective_leakage_power_at_spectrometer_input_mw > 0) {
        const paths = rayleighCandidates.get(context) ?? []
        paths.push(lineage.reverse())
        rayleighCandidates.set(context, paths)
      }
      break
    }
  }

  // Context exposes aggregate leakage. With multiple possible branches, only
  // their common prefix can be attributed to leakage without new physics.
  const rayleigh = new Set<RayId>()
  for (const [first, ...rest] of rayleighCandidates.values()) {
    for (const [index, id] of first.entries()) {
      if (!rest.every((path) => path[index] === id)) break
      rayleigh.add(id)
    }
  }

  const beams: BeamSegment[] = []
  for (const segment of trace.segments) {
    const ray = rays.get(segment.rayId)
    if (!ray) continue
    const from = ray.parentRayId ? hits.get(ray.parentRayId)?.componentId : ray.sourceComponentId
    const startHeight = from ? components.get(from)?.visualization.beam_height_mm ?? 0 : 0
    const endHeight = segment.hitComponentId
      ? components.get(segment.hitComponentId)?.visualization.beam_height_mm ?? startHeight
      : startHeight
    beams.push({
      id: ray.rayId,
      start: benchPoint(segment.start, startHeight),
      end: benchPoint(segment.end, endHeight),
      wavelength: ray.wavelength_nm,
      kind: ray.kind === 'excitation' ? 'excitation' : raman.has(ray.rayId) ? 'raman' : 'return-probe',
      rayleigh: rayleigh.has(ray.rayId),
    })
  }

  const markers: SampleMarker[] = []
  for (const context of contexts) {
    if (!context.excitation_reached_sample || !context.excitation_ray_id) continue
    const sample = components.get(context.sample_component_id)
    const hit = hits.get(context.excitation_ray_id)
    const incoming = rays.get(context.excitation_ray_id)
    if (!sample?.enabled || hit?.componentId !== sample.id || !incoming) continue
    const objectiveId = context.focus.objective_component_id
    const objective = objectiveId ? components.get(objectiveId) : undefined
    const objectivePosition = incoming.focusMetadata?.objectivePosition_mm
    markers.push({
      id: incoming.rayId,
      position: benchPoint(hit.point, sample.visualization.beam_height_mm),
      wavelength: incoming.wavelength_nm,
      focus: context.focus,
      cone: context.focus.state === 'lineage-focus' && objective?.enabled && objectivePosition
        ? {
            base: benchPoint(objectivePosition, objective.visualization.beam_height_mm),
            radius: objective.geometry.aperture_mm / 2,
          }
        : null,
    })
  }
  return { beams, markers }
}
