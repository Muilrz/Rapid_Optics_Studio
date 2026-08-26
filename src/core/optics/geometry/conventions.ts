export const GEOMETRY_CONVENTION = Object.freeze({
  coordinateSystem: 'right-handed-cartesian-2d',
  positiveX: 'right',
  positiveY: 'up',
  positiveRotation: 'counter-clockwise',
  publicAngleUnit: 'degree',
  worldLengthUnit: 'mm',
  planarSurfaceRotationZero: 'tangent-along-positive-x',
  orientedNormalRule: 'counter-clockwise-perpendicular-to-tangent',
  finiteApertureMeaning: 'full-width',
  circularApertureMeaning: 'full-diameter',
} as const)
