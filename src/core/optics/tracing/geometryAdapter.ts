import {
  createAperturePlane,
  createCircularTarget,
  createFiniteOpticalSurface,
  type GeometryIntersectionCandidate,
} from '../geometry'
import type { OpticalComponent } from '../model'

export type TraceInteractionComponent = Exclude<
  OpticalComponent,
  { readonly type: 'laser' }
>

export interface ComponentGeometryCandidate
  extends GeometryIntersectionCandidate {
  readonly component: TraceInteractionComponent
}

/**
 * Laser is a source rather than a hit candidate. Every other V1 component is
 * mapped to a generic geometry primitive; optical semantics remain elsewhere.
 */
export const componentToGeometryCandidate = (
  component: OpticalComponent,
): ComponentGeometryCandidate | null => {
  if (!component.enabled) return null

  switch (component.type) {
    case 'mirror':
    case 'dichroic':
    case 'objective':
    case 'filter':
    case 'spectrometer':
    case 'prism':
    case 'beam-splitter':
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
    case 'pinhole':
      return Object.freeze({
        key: component.id,
        primitive: createAperturePlane(
          component.transform,
          component.geometry,
        ),
        component,
      })
    case 'laser':
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
