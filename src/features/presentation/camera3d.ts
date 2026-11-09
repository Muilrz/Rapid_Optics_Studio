import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type CameraPreset = 'Top' | 'Front' | 'Isometric' | 'Reset Camera'
const directions: Record<CameraPreset, Vector3> = {
  Top: new Vector3(0, 1, 0.0001),
  Front: new Vector3(0, 0.14, 1),
  Isometric: new Vector3(1, 1, 1),
  'Reset Camera': new Vector3(1, 1, 1),
}

export function frameCamera(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  bounds: Box3,
  preset: CameraPreset,
) {
  const center = bounds.getCenter(new Vector3())
  const radius = Math.max(10, bounds.getSize(new Vector3()).length() / 2)
  const direction = directions[preset].clone().normalize()
  const right = new Vector3(0, 1, 0).cross(direction).normalize()
  const up = direction.clone().cross(right)
  const verticalSlope = Math.tan(camera.fov * Math.PI / 360)
  const horizontalSlope = verticalSlope * camera.aspect
  let distance = 10
  const corner = new Vector3()
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(center)
        const projectedExtent = Math.max(
          Math.abs(corner.dot(right)) / horizontalSlope,
          Math.abs(corner.dot(up)) / verticalSlope,
        )
        distance = Math.max(distance, corner.dot(direction) + projectedExtent * 1.22)
      }
    }
  }

  controls.target.copy(center)
  controls.cursor.copy(center)
  controls.maxTargetRadius = radius * 2
  controls.minDistance = Math.max(5, radius * 0.15)
  controls.maxDistance = Math.max(distance * 3, radius * 10)
  camera.near = Math.max(0.05, radius / 10000)
  camera.far = Math.max(5000, controls.maxDistance + radius * 5)
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.updateProjectionMatrix()
  controls.update()
}
