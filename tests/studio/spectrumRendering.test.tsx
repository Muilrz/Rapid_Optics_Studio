import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  SpectrumChart,
  SpectrumPreview,
} from '../../src/features/spectrum/SpectrumPreview'

describe('Phase 3F Spectrum Preview rendering', () => {
  it('renders separate deterministic and seeded-preview curves', () => {
    const markup = renderToStaticMarkup(
      <SpectrumChart
        shifts={[-100, 0, 520.7, 1000]}
        expected={[0, 1, 100, 10]}
        preview={[0, 2, 94, 12]}
        fullWell={60_000}
      />,
    )

    expect(markup).toContain('Expected and seeded CCD preview spectra')
    expect(markup).toContain('spectrum-expected-path')
    expect(markup).toContain('spectrum-preview-path')
    expect(markup).toContain('-100 cm⁻¹')
    expect(markup).toContain('1000 cm⁻¹')
  })

  it('renders scientific controls, telemetry, and the model-quality label', () => {
    const markup = renderToStaticMarkup(<SpectrumPreview />)

    expect(markup).toContain('Spectrum Preview')
    expect(markup).toContain('Simplified / First-order Model')
    expect(markup).toContain('Expected CCD')
    expect(markup).toContain('Seeded preview')
    expect(markup).toContain('data-spectrum-control="material_id"')
    expect(markup).toContain('data-spectrum-control="laser_wavelength_nm"')
    expect(markup).toContain('data-spectrum-control="integration_time_s"')
    expect(markup).toContain('data-spectrum-control="gain_counts_per_photoelectron"')
    expect(markup).toContain('data-focus-state="lineage-focus"')
    expect(markup).toContain('data-raman-path-state="valid-signal-path"')
    expect(markup).toContain('data-saturation-state')
  })
})

