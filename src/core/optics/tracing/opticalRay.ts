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

/** Minimal lineage-carried focus context; no focus-efficiency physics. */
export interface ObjectiveFocusMetadata {
  readonly objectiveComponentId: ComponentId
  readonly objectivePosition_mm: Vec2
  readonly targetFocalDistance_mm: number
  readonly sampleComponentId?: ComponentId
  readonly actualDistance_mm?: number
  readonly defocus_mm?: number
}

export interface OpticalRay {
  readonly rayId: RayId
  readonly parentRayId: RayId | null
  readonly generation: number
  readonly sourceComponentId: ComponentId
  readonly geometry: Ray2D
  readonly wavelength_nm: Nanometers
  readonly power_mw: NonNegativeMilliwatts
  readonly kind: OpticalRayKind
  readonly focusMetadata?: ObjectiveFocusMetadata
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
  readonly focusMetadata?: ObjectiveFocusMetadata
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
  focusMetadata?: ObjectiveFocusMetadata,
): OpticalRay => {
  assertGeneration(generation)

  let frozenFocusMetadata: ObjectiveFocusMetadata | undefined
  if (focusMetadata) {
    const distances = [
      focusMetadata.targetFocalDistance_mm,
      focusMetadata.actualDistance_mm,
      focusMetadata.defocus_mm,
    ].filter((value): value is number => value !== undefined)
    if (!distances.every(Number.isFinite)) {
      throw new RangeError('Focus metadata distances must be finite.')
    }
    if (focusMetadata.targetFocalDistance_mm <= 0) {
      throw new RangeError('Target focal distance must be positive.')
    }
    if (
      focusMetadata.actualDistance_mm !== undefined &&
      focusMetadata.actualDistance_mm < 0
    ) {
      throw new RangeError('Actual focus distance must not be negative.')
    }

    frozenFocusMetadata = Object.freeze({
      ...focusMetadata,
      objectivePosition_mm: Object.freeze({
        x: focusMetadata.objectivePosition_mm.x,
        y: focusMetadata.objectivePosition_mm.y,
      }),
    })
  }

  return Object.freeze({
    rayId: RayIdSchema.parse(rayId),
    parentRayId,
    generation,
    sourceComponentId,
    geometry,
    wavelength_nm: NanometersSchema.parse(wavelength_nm),
    power_mw: NonNegativeMilliwattsSchema.parse(power_mw),
    kind,
    focusMetadata: frozenFocusMetadata,
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
    undefined,
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
    input.focusMetadata ?? parent.focusMetadata,
  )
