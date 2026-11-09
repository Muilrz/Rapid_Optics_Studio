import {
  BufferGeometry, CylinderGeometry, DoubleSide, Group, Line, LineDashedMaterial,
  Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type Object3D,
} from 'three'
import { getExcitationWavelengthPresentation } from '../studio/wavelengthPresentation'
import type { BeamSegment, Point3, SampleMarker } from './model'

function aim(mesh: Object3D, start: Point3, end: Point3, radius: number) {
  const direction = new Vector3(...end).sub(new Vector3(...start))
  const length = direction.length()
  mesh.visible = length > 0
  if (!mesh.visible) return
  mesh.position.set(...start).addScaledVector(direction, 0.5)
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.divideScalar(length))
  mesh.scale.set(radius, length, radius)
}

export function buildBeam(beam: BeamSegment) {
  const group = new Group()
  const color = beam.kind === 'excitation' ? getExcitationWavelengthPresentation(beam.wavelength).color :
    beam.kind === 'raman' ? 0xffc457 : 0x78a9cb
  const tube = new Mesh(
    new CylinderGeometry(1, 1, 1, 8),
    new MeshBasicMaterial({ color, transparent: true, opacity: beam.kind === 'return-probe' ? 0.48 : 0.87 }),
  )
  aim(tube, beam.start, beam.end, beam.kind === 'raman' ? 0.95 : 0.7)
  group.add(tube)
  if (beam.rayleigh) {
    const geometry = new BufferGeometry().setFromPoints([new Vector3(...beam.start), new Vector3(...beam.end)])
    const overlay = new Line(geometry, new LineDashedMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, dashSize: 5, gapSize: 4, depthTest: false, depthWrite: false,
    }))
    overlay.computeLineDistances()
    overlay.renderOrder = 2
    group.add(overlay)
  }
  return group
}

export function buildSpot(marker: SampleMarker) {
  const mesh = new Mesh(
    new SphereGeometry(2.4, 16, 12),
    new MeshBasicMaterial({ color: getExcitationWavelengthPresentation(marker.wavelength).color }),
  )
  mesh.position.set(...marker.position)
  return mesh
}

export function buildCone(marker: SampleMarker) {
  const group = new Group()
  if (!marker.cone) return group
  const cone = new Mesh(
    new CylinderGeometry(0, 1, 1, 24, 1, true),
    new MeshBasicMaterial({
      color: getExcitationWavelengthPresentation(marker.wavelength).color,
      transparent: true, opacity: 0.23, side: DoubleSide, depthWrite: false,
    }),
  )
  aim(cone, marker.cone.base, marker.position, marker.cone.radius)
  group.add(cone)
  return group
}
