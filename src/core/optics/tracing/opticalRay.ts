import { createRay2D, type Ray2D } from '../geometry'
import {
  NanometersSchema,
  NonNegativeMilliwattsSchema,
  StableIdSchema,
  type ComponentId,
  type Nanometers,
  type NonNegativeMilliwatts,
  type Vec2,
} from '../model'
import { z } from 'zod'

export const RayIdSchema = StableIdSchema.brand<'RayId'>()
export type RayId = z.infer<typeof RayIdSchema>

/** Minimal Phase 1C taxonomy; the sample return is not a Raman signal model. */
export type OpticalRayKind = 'excitation' | 'sample-return-placeholder'

export interface OpticalRay {
  readonly rayId: RayId
  readonly parentRayId: RayId | null
  readonly generation: number
  readonly sourceComponentId: ComponentId
  readonly geometry: Ray2D
  readonly wavelength_nm: Nanometers
  readonly power_mw: NonNegativeMilliwatts
  readonly kind: OpticalRayKind
}

export interface RayIdGenerator {
  next(): RayId
}

export const createSequentialRayIdGenerator = (): RayIdGenerator => {
  let sequence = 0

  return Object.freeze({
    next: () => {
      sequence += 1
      return RayIdSchema.parse(`ray:${sequence.toString().padStart(6, '0')}`)
    },
  })
}

interface InitialOpticalRayInput {
  readonly rayId: RayId
  readonly sourceComponentId: ComponentId
  readonly origin: Vec2
  readonly direction: Vec2
  readonly wavelength_nm: number
  readonly power_mw: number
  readonly kind?: OpticalRayKind
}

interface ChildOpticalRayInput {
  readonly rayId: RayId
  readonly origin: Vec2
  readonly direction: Vec2
  readonly wavelength_nm?: number
  readonly power_mw: number
  readonly kind?: OpticalRayKind
}

const assertGeneration = (generation: number): void => {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new RangeError('Optical ray generation must be a non-negative integer.')
  }
}

const createOpticalRay = (
  rayId: RayId,
  parentRayId: RayId | null,
  generation: number,
  sourceComponentId: ComponentId,
  geometry: Ray2D,
  wavelength_nm: number,
  power_mw: number,
  kind: OpticalRayKind,
): OpticalRay => {
  assertGeneration(generation)

  return Object.freeze({
    rayId: RayIdSchema.parse(rayId),
    parentRayId,
    generation,
    sourceComponentId,
    geometry,
    wavelength_nm: NanometersSchema.parse(wavelength_nm),
    power_mw: NonNegativeMilliwattsSchema.parse(power_mw),
    kind,
  })
}

export const createInitialOpticalRay = (
  input: InitialOpticalRayInput,
): OpticalRay =>
  createOpticalRay(
    input.rayId,
    null,
    0,
    input.sourceComponentId,
    createRay2D(input.origin, input.direction),
    input.wavelength_nm,
    input.power_mw,
    input.kind ?? 'excitation',
  )

export const createChildOpticalRay = (
  parent: OpticalRay,
  input: ChildOpticalRayInput,
): OpticalRay =>
  createOpticalRay(
    input.rayId,
    parent.rayId,
    parent.generation + 1,
    parent.sourceComponentId,
    createRay2D(input.origin, input.direction),
    input.wavelength_nm ?? parent.wavelength_nm,
    input.power_mw,
    input.kind ?? parent.kind,
  )
