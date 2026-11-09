import type { CompletedAcquisitionRun } from '../acquisition'

export const PROCESSING_VERSION = 'spectrum-processing-v1'

export type ProcessingStep = Readonly<
  { id: number; enabled: boolean } & (
    { kind: 'baseline' | 'smoothing'; radius: number } |
    { kind: 'normalize'; method: 'max-absolute' | 'min-max' }
  )
>

export interface ProcessingPipeline {
  readonly runId: string
  readonly rawSpectrumId: string
  readonly algorithmVersion: typeof PROCESSING_VERSION
  readonly steps: readonly ProcessingStep[]
}

export interface SpectrumSeries {
  readonly id: string
  readonly runId: string
  readonly kind: 'expected' | 'raw' | 'processed'
  readonly axis: readonly number[]
  readonly values: readonly number[]
  readonly unit: 'counts/bin' | 'dimensionless'
  readonly saturated: boolean
}

export interface ProcessedSpectrum extends SpectrumSeries {
  readonly kind: 'processed'
  readonly pipeline: ProcessingPipeline
}

export function runSpectra(run: CompletedAcquisitionRun) {
  const runId = run.input.id
  const expected = run.input.expected_spectrum
  const raw = run.acquired_spectrum
  return {
    expected: {
      id: `${runId}/expected`, runId, kind: 'expected',
      axis: expected.axis.values_cm_1, values: expected.expected_counts,
      unit: 'counts/bin', saturated: expected.saturated_bin_count > 0,
    } satisfies SpectrumSeries,
    raw: {
      id: `${runId}/raw`, runId, kind: 'raw',
      axis: raw.axis.values_cm_1, values: raw.counts,
      unit: 'counts/bin', saturated: run.exposures.some((frame) => frame.clipped_high.some(Boolean)),
    } satisfies SpectrumSeries,
  }
}

export function createPipeline(runId: string): ProcessingPipeline {
  return { runId, rawSpectrumId: `${runId}/raw`, algorithmVersion: PROCESSING_VERSION, steps: [] }
}

function windowOperation(values: readonly number[], radius: number, mode: 'min' | 'max' | 'mean') {
  return values.map((_, i) => {
    const start = Math.max(0, i - radius)
    const end = Math.min(values.length - 1, i + radius)
    let result = mode === 'min' ? Infinity : mode === 'max' ? -Infinity : 0
    for (let j = start; j <= end; j++) {
      const value = values[j]!
      if (mode === 'min') result = Math.min(result, value)
      else if (mode === 'max') result = Math.max(result, value)
      else result += value / (end - start + 1)
    }
    return result
  })
}

export function validateSamples(axis: readonly number[], values: readonly number[]) {
  if (axis.length !== values.length || values.some((v) => !Number.isFinite(v)) ||
      axis.some((x, i) => !Number.isFinite(x) || (i > 0 && !(x > axis[i - 1]!))) ||
      (axis.length > 1 && !Number.isFinite(axis.at(-1)! - axis[0]!))) {
    throw new Error('Spectrum requires finite intensities and a matching, strictly increasing axis.')
  }
}

export function applyStep(values: readonly number[], step: ProcessingStep): number[] {
  if (values.some((v) => !Number.isFinite(v))) throw new Error('Intensity must be finite.')
  let result: number[]
  if (step.kind === 'normalize') {
    if (step.method !== 'max-absolute' && step.method !== 'min-max') throw new Error('Unknown normalization method.')
    let scale = 0
    for (const value of values) scale = Math.max(scale, Math.abs(value))
    const scaled = values.map((value) => scale === 0 ? 0 : value / scale)
    if (step.method === 'max-absolute' || scaled.length === 0) return scaled
    let low = Infinity
    let high = -Infinity
    for (const value of scaled) {
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
    result = scaled.map((value) => high === low ? 0 : (value - low) / (high - low))
  } else {
    const { radius } = step
    if (!Number.isInteger(radius) || radius < 1 || radius > 200) throw new Error('Radius must be an integer from 1 to 200 bins.')
    if (step.kind === 'smoothing') result = windowOperation(values, radius, 'mean')
    else {
      // Flat morphological opening: erosion followed by dilation.
      const baseline = windowOperation(windowOperation(values, radius, 'min'), radius, 'max')
      result = values.map((value, i) => value - baseline[i]!)
    }
  }
  if (result.some((v) => !Number.isFinite(v))) throw new Error('Processing exceeded the finite intensity range.')
  return result
}

export function replayPipeline(run: CompletedAcquisitionRun, pipeline: ProcessingPipeline): ProcessedSpectrum | null {
  const { raw } = runSpectra(run)
  if (pipeline.runId !== raw.runId || pipeline.rawSpectrumId !== raw.id ||
      pipeline.algorithmVersion !== PROCESSING_VERSION) throw new Error('Pipeline provenance does not match this Raw spectrum.')
  const enabled = pipeline.steps.filter((step) => step.enabled)
  if (enabled.length === 0) return null
  validateSamples(raw.axis, raw.values)
  const values = enabled.reduce((samples, step) => applyStep(samples, step), [...raw.values])
  return Object.freeze({
    ...raw, id: `${raw.runId}/processed`, kind: 'processed',
    unit: enabled.some((step) => step.kind === 'normalize') ? 'dimensionless' : raw.unit,
    values: Object.freeze(values),
    pipeline: Object.freeze({ ...pipeline, steps: Object.freeze(pipeline.steps.map((step) => Object.freeze({ ...step }))) }),
  })
}
