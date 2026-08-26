import type { ReactNode } from 'react'

export interface GlyphProps {
  readonly size_px: number
  readonly aperture_px: number
}

export type ComponentGlyph = (props: GlyphProps) => ReactNode

export const LaserGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <rect
      x={-size_px * 0.52}
      y={-size_px * 0.3}
      width={size_px * 0.72}
      height={size_px * 0.6}
      rx={3}
    />
    <path
      d={`M ${size_px * 0.2} ${-size_px * 0.2} L ${size_px * 0.52} 0 L ${size_px * 0.2} ${size_px * 0.2} Z`}
    />
    <line x1={size_px * 0.52} y1={0} x2={size_px * 0.8} y2={0} />
  </>
)

export const MirrorGlyph: ComponentGlyph = ({ aperture_px }) => (
  <>
    <line x1={-aperture_px / 2} y1={0} x2={aperture_px / 2} y2={0} />
    <line
      className="glyph-secondary"
      x1={-aperture_px / 2}
      y1={4}
      x2={aperture_px / 2}
      y2={4}
    />
  </>
)

export const DichroicGlyph: ComponentGlyph = ({ aperture_px }) => (
  <>
    <rect
      x={-aperture_px / 2}
      y={-3}
      width={aperture_px}
      height={6}
      rx={2}
    />
    <line
      className="glyph-secondary"
      x1={-aperture_px * 0.35}
      y1={-6}
      x2={aperture_px * 0.35}
      y2={6}
    />
  </>
)

export const ObjectiveGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <ellipse rx={size_px * 0.22} ry={size_px * 0.52} />
    <line
      className="glyph-secondary"
      x1={-size_px * 0.45}
      y1={0}
      x2={size_px * 0.45}
      y2={0}
    />
  </>
)

export const SampleGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <circle r={size_px * 0.36} />
    <circle className="glyph-secondary" r={size_px * 0.14} />
  </>
)

export const FilterGlyph: ComponentGlyph = ({ aperture_px }) => (
  <>
    <rect
      x={-aperture_px / 2}
      y={-4}
      width={aperture_px}
      height={8}
      rx={2}
    />
    <line
      className="glyph-secondary"
      x1={-aperture_px * 0.3}
      y1={0}
      x2={aperture_px * 0.3}
      y2={0}
    />
  </>
)

export const SpectrometerGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <rect
      x={-size_px * 0.48}
      y={-size_px * 0.38}
      width={size_px * 0.96}
      height={size_px * 0.76}
      rx={4}
    />
    <line
      x1={-size_px * 0.62}
      y1={-size_px * 0.22}
      x2={-size_px * 0.48}
      y2={-size_px * 0.22}
    />
    <path
      className="glyph-secondary"
      d={`M ${-size_px * 0.15} ${size_px * 0.18} L 0 ${-size_px * 0.14} L ${size_px * 0.18} ${size_px * 0.12}`}
    />
  </>
)

export const PrismGlyph: ComponentGlyph = ({ size_px }) => (
  <polygon
    points={`0,${-size_px * 0.5} ${size_px * 0.5},${size_px * 0.42} ${-size_px * 0.5},${size_px * 0.42}`}
  />
)

export const BeamSplitterGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <rect
      x={-size_px * 0.38}
      y={-size_px * 0.38}
      width={size_px * 0.76}
      height={size_px * 0.76}
      rx={2}
    />
    <line
      className="glyph-secondary"
      x1={-size_px * 0.34}
      y1={size_px * 0.34}
      x2={size_px * 0.34}
      y2={-size_px * 0.34}
    />
  </>
)

export const PinholeGlyph: ComponentGlyph = ({ size_px }) => (
  <>
    <line x1={-size_px * 0.52} y1={0} x2={-size_px * 0.12} y2={0} />
    <circle className="glyph-opening" r={size_px * 0.12} />
    <line x1={size_px * 0.12} y1={0} x2={size_px * 0.52} y2={0} />
  </>
)
