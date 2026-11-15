import type { ReactNode } from 'react'

/**
 * Presentation-only optical instrument pictograms.
 *
 * Optical apertures, transforms, hit targets and tracing remain governed by
 * the scene and Optical Core. These are deliberately not physics primitives.
 */
export interface GlyphProps {
  readonly size_px: number
  readonly aperture_px: number
}

export type ComponentGlyph = (props: GlyphProps) => ReactNode

export const LaserGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <rect className="glyph-metal" x={-s * .55} y={-s * .29} width={s * .76} height={s * .58} rx={s * .1} />
    <rect className="glyph-surface" x={-s * .41} y={-s * .19} width={s * .34} height={s * .38} rx={s * .04} />
    <line className="glyph-etched" x1={-s * .32} y1={-s * .08} x2={-s * .13} y2={-s * .08} />
    <line className="glyph-etched" x1={-s * .32} y1={s * .06} x2={-s * .13} y2={s * .06} />
    <rect className="glyph-metal" x={s * .19} y={-s * .21} width={s * .19} height={s * .42} rx={s * .035} />
    <circle className="glyph-opening" cx={s * .38} cy={0} r={s * .085} />
    <line className="glyph-highlight" x1={s * .42} y1={0} x2={s * .65} y2={0} />
  </>
)

export const MirrorGlyph: ComponentGlyph = ({ aperture_px: a }) => (
  <>
    <rect className="glyph-metal" x={-a / 2} y={-4.8} width={a} height={9.6} rx={2.7} />
    <rect className="glyph-glass" x={-a / 2 + 1.2} y={-2.5} width={a - 2.4} height={5} rx={1.7} />
    <line className="glyph-highlight" x1={-a / 2 + 3} y1={-1.5} x2={a / 2 - 3} y2={-1.5} />
    <circle className="glyph-etched" cx={-a / 2 + 3.6} cy={5} r={1.5} />
    <circle className="glyph-etched" cx={a / 2 - 3.6} cy={5} r={1.5} />
  </>
)

export const DichroicGlyph: ComponentGlyph = ({ aperture_px: a }) => (
  <>
    <rect className="glyph-metal" x={-a / 2} y={-5.2} width={a} height={10.4} rx={2.6} />
    <rect className="glyph-glass" x={-a / 2 + 2} y={-3.4} width={a - 4} height={6.8} rx={1.3} />
    <line className="glyph-highlight" x1={-a * .33} y1={-2.4} x2={a * .25} y2={-2.4} />
    <line className="glyph-secondary" x1={-a * .19} y1={3.2} x2={a * .35} y2={-3.2} />
  </>
)

export const ObjectiveGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <rect className="glyph-metal" x={-s * .36} y={-s * .38} width={s * .72} height={s * .76} rx={s * .11} />
    <ellipse className="glyph-glass" rx={s * .2} ry={s * .45} />
    <ellipse className="glyph-highlight" rx={s * .115} ry={s * .38} />
    <line className="glyph-etched" x1={-s * .34} y1={-s * .26} x2={-s * .34} y2={s * .26} />
    <line className="glyph-etched" x1={s * .34} y1={-s * .26} x2={s * .34} y2={s * .26} />
    <line className="glyph-secondary" x1={-s * .5} y1={0} x2={-s * .37} y2={0} />
    <line className="glyph-secondary" x1={s * .37} y1={0} x2={s * .5} y2={0} />
  </>
)

export const SampleGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <circle className="glyph-metal" r={s * .42} />
    <circle className="glyph-surface" r={s * .34} />
    <circle className="glyph-glass" r={s * .23} />
    <circle className="glyph-opening" r={s * .085} />
    <path className="glyph-secondary" d={`M 0 ${-s * .3} V ${-s * .17} M 0 ${s * .17} V ${s * .3} M ${-s * .3} 0 H ${-s * .17} M ${s * .17} 0 H ${s * .3}`} />
  </>
)

export const FilterGlyph: ComponentGlyph = ({ aperture_px: a }) => (
  <>
    <rect className="glyph-metal" x={-a / 2} y={-5.3} width={a} height={10.6} rx={2.4} />
    <rect className="glyph-glass" x={-a / 2 + 2.5} y={-3.5} width={a - 5} height={7} rx={1.1} />
    <line className="glyph-highlight" x1={-a * .34} y1={-2} x2={a * .25} y2={-2} />
    <line className="glyph-secondary" x1={-a / 2 + 3.8} y1={4.4} x2={a / 2 - 3.8} y2={4.4} />
  </>
)

export const SpectrometerGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <rect className="glyph-metal" x={-s * .46} y={-s * .38} width={s * .92} height={s * .76} rx={s * .09} />
    <rect className="glyph-opening" x={-s * .48} y={-s * .19} width={s * .09} height={s * .38} rx={1} />
    <rect className="glyph-surface" x={-s * .27} y={-s * .23} width={s * .46} height={s * .46} rx={s * .04} />
    <path className="glyph-highlight" d={`M ${-s * .18} ${s * .14} L ${-s * .06} ${-s * .12} L ${s * .06} ${s * .1} L ${s * .14} ${-s * .08}`} />
    <line className="glyph-etched" x1={s * .29} y1={-s * .19} x2={s * .29} y2={s * .19} />
    <line className="glyph-etched" x1={s * .35} y1={-s * .19} x2={s * .35} y2={s * .19} />
  </>
)

export const PrismGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <polygon className="glyph-metal" points={`0,${-s * .49} ${s * .49},${s * .39} ${-s * .49},${s * .39}`} />
    <polygon className="glyph-glass" points={`0,${-s * .37} ${s * .38},${s * .32} ${-s * .38},${s * .32}`} />
    <path className="glyph-highlight" d={`M 0 ${-s * .36} L ${-s * .27} ${s * .25} L ${s * .23} ${s * .25}`} />
  </>
)

export const BeamSplitterGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <rect className="glyph-metal" x={-s * .4} y={-s * .4} width={s * .8} height={s * .8} rx={s * .08} />
    <rect className="glyph-glass" x={-s * .31} y={-s * .31} width={s * .62} height={s * .62} rx={s * .025} />
    <line className="glyph-highlight" x1={-s * .29} y1={s * .29} x2={s * .29} y2={-s * .29} />
    <line className="glyph-etched" x1={-s * .25} y1={-s * .24} x2={s * .25} y2={s * .24} />
  </>
)

export const PinholeGlyph: ComponentGlyph = ({ size_px: s }) => (
  <>
    <circle className="glyph-metal" r={s * .43} />
    <circle className="glyph-surface" r={s * .34} />
    <circle className="glyph-opening" r={s * .1} />
    <line className="glyph-secondary" x1={-s * .36} y1={0} x2={-s * .15} y2={0} />
    <line className="glyph-secondary" x1={s * .15} y1={0} x2={s * .36} y2={0} />
    <line className="glyph-etched" x1={0} y1={-s * .36} x2={0} y2={-s * .2} />
    <line className="glyph-etched" x1={0} y1={s * .2} x2={0} y2={s * .36} />
  </>
)
