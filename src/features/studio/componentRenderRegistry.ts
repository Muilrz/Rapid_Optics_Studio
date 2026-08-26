import type { OpticalComponentType } from '../../core/optics'
import {
  BeamSplitterGlyph,
  DichroicGlyph,
  FilterGlyph,
  LaserGlyph,
  MirrorGlyph,
  ObjectiveGlyph,
  PinholeGlyph,
  PrismGlyph,
  SampleGlyph,
  SpectrometerGlyph,
  type ComponentGlyph,
} from './componentGlyphs'

export interface ComponentRendererDefinition {
  readonly label: string
  readonly shortLabel: string
  readonly accent: string
  readonly Glyph: ComponentGlyph
}

export const COMPONENT_RENDER_REGISTRY = Object.freeze({
  laser: {
    label: 'Laser',
    shortLabel: 'LASER',
    accent: '#4ee88a',
    Glyph: LaserGlyph,
  },
  mirror: {
    label: 'Mirror',
    shortLabel: 'MIRROR',
    accent: '#dce7f1',
    Glyph: MirrorGlyph,
  },
  dichroic: {
    label: 'Dichroic',
    shortLabel: 'DICHROIC',
    accent: '#62c8f2',
    Glyph: DichroicGlyph,
  },
  objective: {
    label: 'Objective',
    shortLabel: 'OBJECTIVE',
    accent: '#b8d7ff',
    Glyph: ObjectiveGlyph,
  },
  sample: {
    label: 'Sample',
    shortLabel: 'SAMPLE',
    accent: '#e8b84b',
    Glyph: SampleGlyph,
  },
  filter: {
    label: 'Edge Filter',
    shortLabel: 'FILTER',
    accent: '#e8848f',
    Glyph: FilterGlyph,
  },
  spectrometer: {
    label: 'Spectrometer',
    shortLabel: 'SPECTROMETER',
    accent: '#a899ff',
    Glyph: SpectrometerGlyph,
  },
  prism: {
    label: 'Prism',
    shortLabel: 'PRISM',
    accent: '#55d8d0',
    Glyph: PrismGlyph,
  },
  'beam-splitter': {
    label: 'Beam Splitter',
    shortLabel: 'BEAM SPLITTER',
    accent: '#8fb8da',
    Glyph: BeamSplitterGlyph,
  },
  pinhole: {
    label: 'Pinhole',
    shortLabel: 'PINHOLE',
    accent: '#f2c56b',
    Glyph: PinholeGlyph,
  },
} satisfies Record<OpticalComponentType, ComponentRendererDefinition>)
