import type { OpticalGeometry, Transform2D, Vec2 } from '../model'
import { rotate, perpendicularCounterClockwise, vec2 } from './vector'

export interface FiniteOpticalSurface2D {
  readonly kind: 'finite-optical-surface'
  /** Surface center in world millimetres. */
  readonly center: Vec2
  readonly rotation_deg: number
  /** Full effective width, centered on `center`. */
  readonly aperture_mm: number
  readonly halfAperture_mm: number
  /** Unit tangent; rotation_deg=0 means +X. */
  readonly tangent: Vec2
  /** Unit tangent rotated counter-clockwise by 90 degrees. */
  readonly normal: Vec2
}

export interface CircularTarget2D {
  readonly kind: 'circular-target'
  /** Circle center in world millimetres. */
  readonly center: Vec2
  /** Full effective diameter. */
  readonly aperture_mm: number
  readonly radius_mm: number
}

export type GeometryPrimitive2D = FiniteOpticalSurface2D | CircularTarget2D

const assertPositiveAperture = (aperture_mm: number): void => {
  if (!Number.isFinite(aperture_mm) || aperture_mm <= 0) {
    throw new RangeError('Geometry aperture must be finite and positive.')
  }
}

export const createFiniteOpticalSurface = (
  transform: Transform2D,
  geometry: OpticalGeometry,
): FiniteOpticalSurface2D => {
  assertPositiveAperture(geometry.aperture_mm)
  if (!Number.isFinite(transform.rotation_deg)) {
    throw new RangeError('Surface rotation must be finite.')
  }

  const tangent = rotate(vec2(1, 0), transform.rotation_deg)
  const normal = perpendicularCounterClockwise(tangent)

  return Object.freeze({
    kind: 'finite-optical-surface' as const,
    center: vec2(transform.x_mm, transform.y_mm),
    rotation_deg: transform.rotation_deg,
    aperture_mm: geometry.aperture_mm,
    halfAperture_mm: geometry.aperture_mm / 2,
    tangent,
    normal,
  })
}

export const createCircularTarget = (
  transform: Transform2D,
  geometry: OpticalGeometry,
): CircularTarget2D => {
  assertPositiveAperture(geometry.aperture_mm)

  return Object.freeze({
    kind: 'circular-target' as const,
    center: vec2(transform.x_mm, transform.y_mm),
    aperture_mm: geometry.aperture_mm,
    radius_mm: geometry.aperture_mm / 2,
  })
}
