import { calculateContextRayleighOd } from '../acquisition/numericalMetrics'
import type { RamanOpticalContext } from '../raman'

export const DIAGNOSTICS_VERSION = 'engineering-diagnostics-v1'
export const DEFAULT_DIAGNOSTIC_THRESHOLDS: Readonly<{ od: number; focus: number; snr: number }> =
  Object.freeze({ od: 3, focus: 0.5, snr: 3 })
export type DiagnosticCode = 'OPT_PATH_001' | 'OPT_PATH_002' | 'RAMAN_001' | 'CCD_001' | 'FOCUS_001' | 'SNR_001'
export type DiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO'
export interface DiagnosticMetric {
  readonly value: number
  readonly unit: string
  readonly threshold: number
}
export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly severity: DiagnosticSeverity
  readonly message: string
  readonly sampleId: string
  readonly sourceId: string | null
  readonly rayId: string | null
  readonly componentIds: readonly string[]
  readonly runId?: string
  readonly metric?: DiagnosticMetric
}
export interface DetectorEvidence {
  readonly expectedBins: number
  readonly clippedBins: number
  readonly snr?: { readonly status: 'available' | 'undefined'; readonly value: number | null }
  readonly runId?: string
}

export function diagnoseContext(
  context: RamanOpticalContext,
  detector?: DetectorEvidence,
  thresholds: Readonly<typeof DEFAULT_DIAGNOSTIC_THRESHOLDS> = DEFAULT_DIAGNOSTIC_THRESHOLDS,
): readonly Diagnostic[] {
  const results: Diagnostic[] = []
  const add = (code: DiagnosticCode, severity: DiagnosticSeverity, message: string, metric?: DiagnosticMetric) => {
    results.push({
      code, severity, message, metric, sampleId: context.sample_component_id,
      sourceId: context.source_component_id,
      rayId: context.sample_return_ray_id ?? context.excitation_ray_id,
      componentIds: [...new Set([
        context.sample_component_id, context.source_component_id,
        context.focus.objective_component_id, ...context.raman_return.spectrometer_component_ids,
      ].filter((id) => id !== null))],
      runId: detector?.runId,
    })
  }
  if (context.path_state === 'no-excitation-path') {
    add('OPT_PATH_001', 'ERROR', 'Excitation does not reach the sample.')
  } else if (context.path_state === 'excited-no-return-path') {
    add('OPT_PATH_002', 'ERROR', 'Raman return does not reach the spectrometer.')
  } else {
    const od = calculateContextRayleighOd(context)
    if (od.status === 'available' && od.value < thresholds.od) {
      add('RAMAN_001', 'WARNING', 'Rayleigh path suppression is below the review threshold.', { value: od.value, unit: 'OD', threshold: thresholds.od })
    }
    const snr = detector?.snr
    if (snr?.status === 'available' && snr.value !== null && Number.isFinite(snr.value) && snr.value >= 0 && snr.value < thresholds.snr) {
      add('SNR_001', 'INFO', 'Predicted peak SNR is below the review threshold.', { value: snr.value, unit: 'ratio', threshold: thresholds.snr })
    }
  }
  const focus = context.focus
  if (context.excitation_reached_sample && focus.state === 'lineage-focus' && Number.isFinite(focus.efficiency) && focus.efficiency >= 0 && focus.efficiency < thresholds.focus) {
    add('FOCUS_001', 'WARNING', 'The sample is outside the focus review region.', { value: focus.efficiency, unit: 'η', threshold: thresholds.focus })
  }
  if (detector) {
    const bins = Math.max(detector.expectedBins, detector.clippedBins)
    if (Number.isSafeInteger(bins) && bins > 0) {
      add('CCD_001', 'WARNING', 'CCD saturation is present in the expected mask or exposure clipping.', { value: bins, unit: 'bins', threshold: 0 })
    }
  }
  return results
}
