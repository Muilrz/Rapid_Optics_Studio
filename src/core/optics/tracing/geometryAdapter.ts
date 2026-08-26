import {
  createCircularTarget,
  createFiniteOpticalSurface,
  type GeometryIntersectionCandidate,
} from '../geometry'
import type {
  MirrorComponent,
  OpticalComponent,
  SampleComponent,
  SpectrometerComponent,
} from '../model'

export type TraceInteractionComponent =
  | MirrorComponent
  | SampleComponent
  | SpectrometerComponent

export interface ComponentGeometryCandidate
  extends GeometryIntersectionCandidate {
  readonly component: TraceInteractionComponent
}

/**
 * Phase 1C maps only components with an implemented interaction. Unsupported
 * component types remain absent instead of silently behaving as transparent.
 */
export const componentToGeometryCandidate = (
  component: OpticalComponent,
): ComponentGeometryCandidate | null => {
  if (!component.enabled) return null

  switch (component.type) {
    case 'mirror':
    case 'spectrometer':
      return Object.freeze({
        key: component.id,
        primitive: createFiniteOpticalSurface(
          component.transform,
          component.geometry,
        ),
        component,
      })
    case 'sample':
      return Object.freeze({
        key: component.id,
        primitive: createCircularTarget(
          component.transform,
          component.geometry,
        ),
        component,
      })
    default:
      return null
  }
}

export const buildComponentGeometryCandidates = (
  components: readonly OpticalComponent[],
): readonly ComponentGeometryCandidate[] =>
  Object.freeze(
    components
      .map(componentToGeometryCandidate)
      .filter(
        (candidate): candidate is ComponentGeometryCandidate =>
          candidate !== null,
      )
      .sort((left, right) => {
        if (left.key < right.key) return -1
        if (left.key > right.key) return 1
        return 0
      }),
  )
