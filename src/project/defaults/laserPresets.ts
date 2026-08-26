import {
  LaserWavelengthPresetSchema,
  type LaserWavelengthPreset,
} from '../../core/optics'

export const LASER_WAVELENGTH_PRESETS = [
  LaserWavelengthPresetSchema.parse({
    id: 'laser-preset:532nm',
    label: '532 nm',
    wavelength_nm: 532,
  }),
  LaserWavelengthPresetSchema.parse({
    id: 'laser-preset:633nm',
    label: '633 nm',
    wavelength_nm: 633,
  }),
  LaserWavelengthPresetSchema.parse({
    id: 'laser-preset:785nm',
    label: '785 nm · NIR',
    wavelength_nm: 785,
  }),
] as const satisfies readonly LaserWavelengthPreset[]
