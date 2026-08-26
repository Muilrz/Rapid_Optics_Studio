# Optical Geometry Conventions

This module is a deterministic two-dimensional geometry layer. It has no
optical propagation or component interaction semantics.

## World coordinates

- World length is measured in millimetres.
- `+X` points right and `+Y` points up in a right-handed Cartesian plane.
- Public angles are degrees.
- Positive rotation is counter-clockwise.
- Screen and Canvas coordinates are view-layer concerns and never enter this
  module.

The reference Demo uses downward-positive screen Y. Demo fixtures convert at
their boundary with `y_world = -y_demo` and
`rotation_world = -rotation_demo`.

## Finite planar surfaces

For every finite planar optical surface:

- `rotation_deg = 0` means its tangent points along world `+X`.
- The tangent is local `+X` rotated by `rotation_deg`.
- The oriented normal is the tangent rotated counter-clockwise by 90 degrees.
- `aperture_mm` is the full effective width, centered on the transform.
- Surface endpoints are therefore at `±aperture_mm / 2` along the tangent.

The oriented normal is stable geometry information. A later optical
interaction may use it, but this module never reflects or routes a ray.

## Circular targets

`aperture_mm` is the full effective diameter. The radius is always
`aperture_mm / 2`. A hit normal points radially outward.

## Ray2D

`Ray2D` contains only `origin` and `direction`. Origin coordinates are world
millimetres. Direction is a normalized, dimensionless vector. Construction
rejects zero-length and non-finite directions. No optical metadata belongs in
this type.

## Hits and epsilon

Because ray directions are normalized, `distance_mm` is both the positive ray
parameter and physical forward distance in millimetres. Hits expose point,
tangent, and oriented normal, plus primitive-specific geometry only.

All tolerances live in `epsilon.ts`. Near-ties within `distanceTie_mm` are
resolved by a stable candidate key using code-unit lexical order, so candidate
array order does not affect the result.
