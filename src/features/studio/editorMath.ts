import {
  Transform2DSchema,
  type OpticalComponent,
  type OpticalComponentType,
  type Transform2D,
  type Vec2,
} from '../../core/optics'

export type StudioAlignment =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'horizontal-center'
  | 'vertical-center'

export type StudioDistribution = 'horizontal' | 'vertical'

export interface ComponentEditability {
  readonly selectable: boolean
  readonly movable: boolean
  readonly rotatable: boolean
}

const FULL_EDITABILITY = Object.freeze({
  selectable: true,
  movable: true,
  rotatable: true,
})

/**
 * Phase 2B policy: every formal component transform is editable, including a
 * disabled component. Presentation metadata never grants or removes editing.
 */
export const COMPONENT_EDITABILITY_POLICY = Object.freeze({
  laser: FULL_EDITABILITY,
  mirror: FULL_EDITABILITY,
  dichroic: FULL_EDITABILITY,
  objective: FULL_EDITABILITY,
  sample: FULL_EDITABILITY,
  filter: FULL_EDITABILITY,
  spectrometer: FULL_EDITABILITY,
  prism: FULL_EDITABILITY,
  'beam-splitter': FULL_EDITABILITY,
  pinhole: FULL_EDITABILITY,
} satisfies Record<OpticalComponentType, ComponentEditability>)

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`)
}

const assertPoint = (point: Vec2, label: string): void => {
  assertFinite(point.x, `${label} X`)
  assertFinite(point.y, `${label} Y`)
}

/** Canonical Studio angle representation: [-180°, 180°). */
export const normalizeEditorAngleDeg = (angle_deg: number): number => {
  assertFinite(angle_deg, 'Angle')
  const normalized = ((angle_deg + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

/**
 * Nearest grid coordinate in world millimeters. Exact half-grid ties resolve
 * toward the greater world coordinate, including for negative coordinates.
 */
export const snapCoordinateToGrid = (
  value_mm: number,
  pitch_mm: number,
  origin_mm = 0,
): number => {
  assertFinite(value_mm, 'Coordinate')
  assertFinite(pitch_mm, 'Grid pitch')
  assertFinite(origin_mm, 'Grid origin')
  if (pitch_mm <= 0) throw new RangeError('Grid pitch must be positive.')

  const gridIndex = Math.floor((value_mm - origin_mm) / pitch_mm + 0.5)
  const snapped = origin_mm + gridIndex * pitch_mm
  return Object.is(snapped, -0) ? 0 : snapped
}

export const snapWorldPoint = (
  point_mm: Vec2,
  pitch_mm: number,
  origin_mm: Vec2 = { x: 0, y: 0 },
): Vec2 => {
  assertPoint(point_mm, 'Point')
  assertPoint(origin_mm, 'Grid origin')
  return Object.freeze({
    x: snapCoordinateToGrid(point_mm.x, pitch_mm, origin_mm.x),
    y: snapCoordinateToGrid(point_mm.y, pitch_mm, origin_mm.y),
  })
}

export const moveTransformFromWorldPointers = (
  startingTransform: Transform2D,
  startingPointer_mm: Vec2,
  currentPointer_mm: Vec2,
  snap?: { readonly pitch_mm: number; readonly origin_mm: Vec2 },
): Transform2D => {
  assertPoint(startingPointer_mm, 'Starting pointer')
  assertPoint(currentPointer_mm, 'Current pointer')
  const position = {
    x: startingTransform.x_mm + currentPointer_mm.x - startingPointer_mm.x,
    y: startingTransform.y_mm + currentPointer_mm.y - startingPointer_mm.y,
  }
  const finalPosition = snap
    ? snapWorldPoint(position, snap.pitch_mm, snap.origin_mm)
    : position

  return Transform2DSchema.parse({
    x_mm: finalPosition.x,
    y_mm: finalPosition.y,
    rotation_deg: startingTransform.rotation_deg,
  })
}

export interface ComponentTransformUpdate {
  readonly id: string
  readonly transform: Transform2D
}

/**
 * Snaps only the designated group anchor, then applies its exact world-space
 * delta to every member so relative layout is preserved.
 */
export const moveTransformGroupFromWorldPointers = (
  startingTransforms: readonly ComponentTransformUpdate[],
  anchorId: string,
  startingPointer_mm: Vec2,
  currentPointer_mm: Vec2,
  snap?: { readonly pitch_mm: number; readonly origin_mm: Vec2 },
): readonly ComponentTransformUpdate[] => {
  const anchor = startingTransforms.find(({ id }) => id === anchorId)
  if (!anchor) throw new RangeError(`Unknown group anchor: ${anchorId}`)
  const movedAnchor = moveTransformFromWorldPointers(
    anchor.transform,
    startingPointer_mm,
    currentPointer_mm,
    snap,
  )
  const delta = {
    x: movedAnchor.x_mm - anchor.transform.x_mm,
    y: movedAnchor.y_mm - anchor.transform.y_mm,
  }
  return Object.freeze(
    startingTransforms.map(({ id, transform }) => ({
      id,
      transform: Transform2DSchema.parse({
        x_mm: transform.x_mm + delta.x,
        y_mm: transform.y_mm + delta.y,
        rotation_deg: transform.rotation_deg,
      }),
    })),
  )
}

/**
 * Rotation is the world-space angle from component center to pointer. Because
 * world +Y points up, atan2 directly matches the Phase 1 positive-CCW contract.
 */
export const rotationDegFromWorldPointer = (
  center_mm: Vec2,
  pointer_mm: Vec2,
): number => {
  assertPoint(center_mm, 'Component center')
  assertPoint(pointer_mm, 'Rotation pointer')
  const dx = pointer_mm.x - center_mm.x
  const dy = pointer_mm.y - center_mm.y
  if (dx === 0 && dy === 0) {
    throw new RangeError('Rotation pointer must differ from component center.')
  }
  return normalizeEditorAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI)
}

export const rotateTransformTowardWorldPointer = (
  transform: Transform2D,
  pointer_mm: Vec2,
): Transform2D =>
  Transform2DSchema.parse({
    ...transform,
    rotation_deg: rotationDegFromWorldPointer(
      { x: transform.x_mm, y: transform.y_mm },
      pointer_mm,
    ),
  })

const coordinateForAlignment = (
  components: readonly OpticalComponent[],
  alignment: StudioAlignment,
): number => {
  const values = components.map(({ transform }) =>
    alignment === 'top' || alignment === 'bottom' || alignment === 'vertical-center'
      ? transform.y_mm
      : transform.x_mm,
  )
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  if (alignment === 'left' || alignment === 'bottom') return minimum
  if (alignment === 'right' || alignment === 'top') return maximum
  return (minimum + maximum) / 2
}

/** Aligns component centers in formal +Y-up world millimeters. */
export const createAlignmentUpdates = (
  components: readonly OpticalComponent[],
  alignment: StudioAlignment,
): readonly ComponentTransformUpdate[] => {
  if (components.length < 2) return Object.freeze([])
  const target = coordinateForAlignment(components, alignment)
  const updateX = alignment === 'left' || alignment === 'right' || alignment === 'horizontal-center'
  return Object.freeze(
    components.map(({ id, transform }) => ({
      id,
      transform: Transform2DSchema.parse({
        ...transform,
        x_mm: updateX ? target : transform.x_mm,
        y_mm: updateX ? transform.y_mm : target,
      }),
    })),
  )
}

/**
 * Distributes world-space centers. Coordinate ties use stable IDs, making the
 * result independent from authoritative component array order.
 */
export const createDistributionUpdates = (
  components: readonly OpticalComponent[],
  axis: StudioDistribution,
): readonly ComponentTransformUpdate[] => {
  if (components.length < 3) return Object.freeze([])
  const coordinate = (component: OpticalComponent) =>
    axis === 'horizontal' ? component.transform.x_mm : component.transform.y_mm
  const ordered = [...components].sort(
    (left, right) => coordinate(left) - coordinate(right) || left.id.localeCompare(right.id),
  )
  const first = coordinate(ordered[0]!)
  const last = coordinate(ordered.at(-1)!)
  const spacing = (last - first) / (ordered.length - 1)
  return Object.freeze(
    ordered.map(({ id, transform }, index) => ({
      id,
      transform: Transform2DSchema.parse({
        ...transform,
        x_mm: axis === 'horizontal' ? first + spacing * index : transform.x_mm,
        y_mm: axis === 'vertical' ? first + spacing * index : transform.y_mm,
      }),
    })),
  )
}
