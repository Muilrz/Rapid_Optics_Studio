import { rotate, vec2 } from '../geometry'
import type { LaserComponent } from '../model'
import {
  createInitialOpticalRay,
  type OpticalRay,
  type RayIdGenerator,
} from './opticalRay'

export const emitLaserRay = (
  laser: LaserComponent,
  idGenerator: RayIdGenerator,
): OpticalRay | null => {
  if (!laser.enabled) return null

  return createInitialOpticalRay({
    rayId: idGenerator.next(),
    sourceComponentId: laser.id,
    origin: vec2(laser.transform.x_mm, laser.transform.y_mm),
    direction: rotate(vec2(1, 0), laser.transform.rotation_deg),
    wavelength_nm: laser.parameters.wavelength_nm,
    power_mw: laser.parameters.power_mw,
    kind: 'excitation',
  })
}
