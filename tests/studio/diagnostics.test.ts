import { describe, expect, it } from 'vitest'
import { diagnoseContext } from '../../src/core/diagnostics/diagnostics'
import { createStudioStore } from '../../src/store/studioStore'
import { ComponentIdSchema, UnitIntervalSchema } from '../../src/core/optics'

const context = createStudioStore().getState().derived.ramanContexts[0]!

describe('engineering diagnostics', () => {
  it('reports deterministic rules with frozen-run and optical lineage', () => {
    const input = { expectedBins: 2, clippedBins: 1, runId: 'run-1',
      snr: { status: 'available' as const, value: 1 } }
    const evaluate = () => diagnoseContext(context, input, { od: 100, focus: 0.5, snr: 3 })
    expect(evaluate()).toEqual(evaluate())
    expect(evaluate()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RAMAN_001', severity: 'WARNING' }),
      expect.objectContaining({ code: 'CCD_001', runId: 'run-1' }),
      expect.objectContaining({ code: 'SNR_001', sampleId: context.sample_component_id }),
    ]))
  })

  it('does not infer return, focus or SNR failures from a missing excitation path', () => {
    const result = diagnoseContext({ ...context, path_state: 'no-excitation-path', excitation_reached_sample: false },
      { expectedBins: 0, clippedBins: 0, snr: { status: 'undefined', value: null } })
    expect(result.map(({ code }) => code)).toEqual(['OPT_PATH_001'])
  })

  it('preserves distinct sample attribution and reports defocus with missing return', () => {
    const result = diagnoseContext({ ...context, sample_component_id: ComponentIdSchema.parse('sample-other'),
      path_state: 'excited-no-return-path', focus: { ...context.focus, efficiency: UnitIntervalSchema.parse(0.25) } })
    expect(result.map(({ code, sampleId }) => [code, sampleId])).toEqual([
      ['OPT_PATH_002', 'sample-other'], ['FOCUS_001', 'sample-other'],
    ])
  })
})
