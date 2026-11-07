export interface ExcitationWavelengthPresentation {
  readonly color: string
  readonly glow: string
}

/**
 * UI-only palette inherited from the reference Demo. These colors are
 * presentation tokens, not a scientific wavelength-to-RGB calculation;
 * notably, 785 nm is represented by a visible near-infrared surrogate.
 */
export const EXCITATION_WAVELENGTH_PRESENTATION = Object.freeze({
  532: Object.freeze({ color: '#3de675', glow: 'rgb(61 230 117 / 80%)' }),
  633: Object.freeze({ color: '#ff4d4d', glow: 'rgb(255 77 77 / 80%)' }),
  785: Object.freeze({ color: '#e24a63', glow: 'rgb(226 74 99 / 80%)' }),
}) satisfies Readonly<Record<number, ExcitationWavelengthPresentation>>

const CUSTOM_WAVELENGTH_FALLBACK = Object.freeze({
  color: '#8bd5ff',
  glow: 'rgb(139 213 255 / 76%)',
}) satisfies ExcitationWavelengthPresentation

export const getExcitationWavelengthPresentation = (
  wavelength_nm: number,
): ExcitationWavelengthPresentation =>
  EXCITATION_WAVELENGTH_PRESENTATION[
    wavelength_nm as keyof typeof EXCITATION_WAVELENGTH_PRESENTATION
  ] ?? CUSTOM_WAVELENGTH_FALLBACK
