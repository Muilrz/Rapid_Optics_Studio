import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AcquisitionPanel, AcquisitionRunInspector, AcquisitionStatus } from '../../src/features/acquisition/AcquisitionPanel'
import { AcquisitionInputSchema, CancelledAcquisitionRunSchema, CompletedAcquisitionRunSchema } from '../../src/core/acquisition'
import { initialAcquisitionState } from '../../src/store/acquisitionRuntime'
import { acquisitionContractFixture, cancelledContractFixture } from '../fixtures/acquisitionContracts'

describe('Phase 4E acquisition rendering', () => {
  it('renders Average default20, Single option, authoritative integration and separate Preview semantics', () => {
    const markup = renderToStaticMarkup(<AcquisitionPanel />)
    expect(markup).toContain('Acquisition mode')
    expect(markup).toContain('Single (N=1)')
    expect(markup).toContain('value="20"')
    expect(markup).toContain('Acquire')
    expect(markup).toContain('Edit in Spectrum parameters above')
    expect(markup).toContain('Live Preview is not saved as a Run')
  })

  it('renders frozen expected/raw and scientific provenance without a misleading Preview label', () => {
    const run = CompletedAcquisitionRunSchema.parse(acquisitionContractFixture())
    const markup = renderToStaticMarkup(<AcquisitionRunInspector run={run} />)
    expect(markup).toContain('Frozen expected and raw acquired mean spectra')
    expect(markup).toContain('spectrum-raw-path')
    expect(markup).not.toContain('seeded CCD preview spectra')
    expect(markup).toContain('Expected at acquisition')
    expect(markup).toContain('SNR')
    expect(markup).toContain('Undefined')
    expect(markup).toContain('not absolute Raman radiant power')
    expect(markup).toContain('seed 0')
    expect(markup).toContain(run.input.instrument_snapshot.target.spectrometer_component_id)
    expect(markup).toContain('2026-11-08T00:00:00.000Z')
    expect(markup).toContain('10 mW at 532 nm')
    expect(markup).toContain('2 retained frames × 2 bins; raw mean 2 bins, N=2')
  })

  it('shows k/N, retained cancelled frames and no complete result chart', () => {
    const input = AcquisitionInputSchema.parse(acquisitionContractFixture().input)
    const run = CancelledAcquisitionRunSchema.parse(cancelledContractFixture(input))
    const markup = renderToStaticMarkup(<><AcquisitionStatus acquisition={{ ...initialAcquisitionState(), runtime: { status: 'cancelled', run }, cancelledRuns: [run] }} /><AcquisitionRunInspector run={run} /></>)
    expect(markup).toContain('0 / 2 exposures')
    expect(markup).toContain('Instrument configuration changed')
    expect(markup).toContain('No complete raw mean')
    expect(markup).not.toContain('<svg')
  })

  it('shows running progress and readable runtime/start errors', () => {
    const input = AcquisitionInputSchema.parse(acquisitionContractFixture().input)
    const running = { status: 'running' as const, token: 'test', input, exposures: [] }
    const markup = renderToStaticMarkup(<AcquisitionStatus acquisition={{ ...initialAcquisitionState(), runtime: running }} />)
    expect(markup).toContain('data-acquisition-status="running"')
    expect(markup).toContain('Acquisition progress')
    const failed = renderToStaticMarkup(<AcquisitionStatus acquisition={{ ...initialAcquisitionState(),
      runtime: { ...running, status: 'error', error_reason: 'Exposure failed.' }, lastStartError: 'Integration must be positive.' }} />)
    expect(failed).toContain('Exposure failed.')
    expect(failed).toContain('Integration must be positive.')
    expect(failed).toContain('start a new acquisition')
  })
})
