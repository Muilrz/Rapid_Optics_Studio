import type { RamanMaterial } from '../raman'
import { validateSamples, type SpectrumSeries } from './processing'

export interface PeakAssignment {
  readonly materialId: string
  readonly label: string
  readonly referencePosition_cm_1: number
}

export interface Peak {
  readonly bin: number
  readonly position_cm_1: number
  readonly intensity: number
  readonly fwhm: number | null
  readonly assignment: PeakAssignment | null
  readonly source: 'auto' | 'manual' | 'reference'
}

// Scan to the first higher sample on each side. The higher valley sets
// the local baseline. A half-prominence crossing is interpolated on each side.
function measure(values: readonly number[], axis: readonly number[], bin: number, scale: number) {
  const top = values[bin]! / scale
  let left = bin
  let right = bin
  let leftMin = top
  let rightMin = top
  while (left > 0 && values[left - 1]! <= values[bin]!) {
    left--
    leftMin = Math.min(leftMin, values[left]! / scale)
  }
  while (right < values.length - 1 && values[right + 1]! <= values[bin]!) {
    right++
    rightMin = Math.min(rightMin, values[right]! / scale)
  }
  const prominence = top - Math.max(leftMin, rightMin)
  if (prominence <= 0) return { prominence: 0, fwhm: null }
  const half = top - prominence / 2
  const crossing = (direction: -1 | 1, limit: number) => {
    for (let i = bin; i !== limit; i += direction) {
      const j = i + direction
      const next = values[j]! / scale
      if (next <= half) {
        const current = values[i]! / scale
        return axis[i]! + (axis[j]! - axis[i]!) * ((current - half) / (current - next))
      }
    }
    return null
  }
  const a = crossing(-1, left)
  const b = crossing(1, right)
  return { prominence, fwhm: a === null || b === null ? null : b - a }
}

function peakAt(series: SpectrumSeries, bin: number, source: 'auto' | 'manual', fwhm: number | null): Peak {
  return { bin, position_cm_1: series.axis[bin]!, intensity: series.values[bin]!, fwhm, source, assignment: null }
}

export function manualPeak(series: SpectrumSeries, bin: number): Peak {
  validateSamples(series.axis, series.values)
  if (!Number.isInteger(bin) || bin < 0 || bin >= series.values.length) throw new Error('Select a sampled bin.')
  const scale = series.values.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1
  return peakAt(series, bin, 'manual', measure(series.values, series.axis, bin, scale).fwhm)
}

export function detectPeaks(series: SpectrumSeries, fraction: number): Peak[] {
  validateSamples(series.axis, series.values)
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) throw new Error('Peak prominence fraction must be in (0, 1].')
  const { axis, values } = series
  const scale = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  if (!scale) return []
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    min = Math.min(min, value / scale)
    max = Math.max(max, value / scale)
  }
  const peaks: Peak[] = []
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i]! <= values[i - 1]!) continue
    let end = i
    while (values[end + 1] === values[i]) end++
    if (end < values.length - 1 && values[end]! > values[end + 1]!) {
      const bin = Math.floor((i + end) / 2)
      const result = measure(values, axis, bin, scale)
      if (result.prominence > 0 && result.prominence >= fraction * (max - min)) {
        peaks.push(peakAt(series, bin, 'auto', result.fwhm))
      }
    }
    i = end
  }
  return peaks
}

export function referencePeaks(material: RamanMaterial): Peak[] {
  return material.peaks.map((peak, bin) => ({
    bin, position_cm_1: peak.shift_cm_1, intensity: peak.relative_intensity,
    fwhm: null, source: 'reference',
    assignment: peak.assignment ? { materialId: material.id, label: peak.assignment, referencePosition_cm_1: peak.shift_cm_1 } : null,
  }))
}
