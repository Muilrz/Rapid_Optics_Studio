import { Box3, Group, InstancedMesh, Line, Mesh, type Object3D } from 'three'
import type { OpticalComponent, OpticalScene, TraceResult } from '../../core/optics'
import type { RamanOpticalContext } from '../../core/raman'
import { buildBoard, buildComponent } from './geometry'
import { buildOpticalPresentation, componentPose } from './model'
import { buildBeam, buildCone, buildSpot } from './paths'

export function disposeObject(object: Object3D) {
  object.removeFromParent()
  object.traverse((child) => {
    if (child instanceof InstancedMesh) child.dispose()
    if (child instanceof Mesh || child instanceof Line) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

interface Entry {
  key: string
  object: Object3D
}

function reconcile<T extends { id: string }, E extends Entry>(
  entries: Map<string, E>,
  values: readonly T[],
  parent: Group,
  keyFor: (value: T) => string,
  build: (value: T) => Omit<E, 'key'>,
  update?: (entry: E, value: T) => void,
) {
  const current = new Set<string>()
  for (const value of values) {
    current.add(value.id)
    const key = keyFor(value)
    let entry = entries.get(value.id)
    if (entry?.key !== key) {
      const next = { ...build(value), key } as E
      if (entry) disposeObject(entry.object)
      entry = next
      entries.set(value.id, entry)
      entry.object.name = value.id
      parent.add(entry.object)
    }
    update?.(entry, value)
  }
  for (const [id, entry] of entries) {
    if (current.has(id)) continue
    disposeObject(entry.object)
    entries.delete(id)
  }
}

const componentKey = (component: OpticalComponent) => JSON.stringify([
  component.type, component.enabled, component.geometry.aperture_mm,
  component.visualization.beam_height_mm, component.visualization.post_height_mm,
  component.visualization.visual_depth_mm, component.visualization.holder,
  component.type === 'laser' ? component.parameters.wavelength_nm : null,
])

export function createSceneObjects() {
  const root = new Group()
  const hardware = new Group()
  const beams = new Group()
  const cones = new Group()
  const spots = new Group()
  const boards = new Map<string, Entry>()
  const components = new Map<string, Entry & ReturnType<typeof buildComponent>>()
  const beamEntries = new Map<string, Entry>()
  const coneEntries = new Map<string, Entry>()
  const spotEntries = new Map<string, Entry>()
  root.add(hardware, beams, cones, spots)

  return {
    root, hardware, beams, cones, components,
    update(scene: OpticalScene, trace: TraceResult, contexts: readonly RamanOpticalContext[]) {
      reconcile(boards, scene.breadboards, hardware, (board) => JSON.stringify([
        board.origin_mm.x, board.origin_mm.y, board.width_mm, board.height_mm, board.hole_pitch_mm,
      ]), (board) => ({ object: buildBoard(board) }))
      reconcile(components, scene.components, hardware, componentKey,
        (component) => {
          const visual = buildComponent(component)
          return { ...visual, object: visual.group }
        },
        ({ group }, component) => {
          const pose = componentPose(component)
          group.position.set(...pose.position)
          group.rotation.y = pose.yaw
        })
      const { beams: segments, markers } = buildOpticalPresentation(scene, trace, contexts)
      reconcile(beamEntries, segments, beams, JSON.stringify, (beam) => ({ object: buildBeam(beam) }))
      reconcile(coneEntries, markers.filter((marker) => marker.cone), cones,
        ({ position, cone, wavelength }) => JSON.stringify([position, cone, wavelength]),
        (marker) => ({ object: buildCone(marker) }))
      reconcile(spotEntries, markers, spots,
        ({ position, wavelength }) => JSON.stringify([position, wavelength]),
        (marker) => ({ object: buildSpot(marker) }))
    },
    select(ids: readonly string[]) {
      const selected = new Set(ids)
      for (const [id, { marker }] of components) marker.visible = selected.has(id)
    },
    bounds() {
      return new Box3().setFromObject(hardware)
    },
    dispose() {
      disposeObject(root)
      for (const entries of [boards, components, beamEntries, coneEntries, spotEntries]) entries.clear()
      for (const group of [hardware, beams, cones, spots]) group.clear()
      root.clear()
    },
  }
}
