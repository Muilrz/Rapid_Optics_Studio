import { useMemo } from 'react'
import { calculateContextRayleighOd } from '../../core/acquisition/numericalMetrics'
import { diagnoseContext, DEFAULT_DIAGNOSTIC_THRESHOLDS, type Diagnostic } from '../../core/diagnostics/diagnostics'
import { useStudioStore } from '../../store/studioStore'

const number = (value: number) => value.toPrecision(4)

export function EngineeringStatus() {
  const spectrum = useStudioStore((state) => state.derived.spectrum)
  const snr = useStudioStore((state) => state.acquisition.completedRuns.at(-1)?.metrics.snr)
  const context = spectrum.context
  const od = context ? calculateContextRayleighOd(context) : undefined
  const signal = context?.path_state === 'valid-signal-path'
    ? od?.status === 'available' && od.value < DEFAULT_DIAGNOSTIC_THRESHOLDS.od ? 'LEAK' : 'SIGNAL'
    : context ? 'NO PATH' : 'Unavailable'
  const saturation = spectrum.kind === 'ready'
    ? spectrum.expectedCcdSpectrum.saturated_bin_count > 0 || spectrum.previewExposure.clipped_high.some(Boolean)
      ? 'Saturated' : 'Clear'
    : 'Unavailable'
  return <aside className="engineering-status" aria-label="Engineering telemetry">
    <span>Path <strong data-path-state={signal}>{signal}</strong></span>
    <span>Focus η <strong title={context?.focus.state}>{context?.focus.state === 'lineage-focus' ? number(context.focus.efficiency) : 'Unavailable'}</strong></span>
    <span>Rayleigh <strong title={od?.status === 'undefined' ? od.undefined_reason : 'Model path OD'}>{od?.status === 'available' ? number(od.value) + ' OD' : 'Undefined'}</strong></span>
    <span>CCD <strong title={spectrum.kind === 'unavailable' ? spectrum.reason : 'Current preview'}>{saturation}</strong></span>
    <span>Peak SNR <strong title={snr?.status === 'undefined' ? snr.undefined_reason : snr ? 'Latest completed acquisition' : 'No completed acquisition'}>{snr?.status === 'available' ? number(snr.value) : 'Undefined'}</strong></span>
  </aside>
}

export function DiagnosticsPanel({ onLocate }: { onLocate: () => void }) {
  const derived = useStudioStore((state) => state.derived)
  const run = useStudioStore((state) => state.acquisition.completedRuns.at(-1))
  const components = useStudioStore((state) => state.authoritative.scene.components)
  const select = useStudioStore((state) => state.setSelection)
  const { spectrum } = derived
  const live = spectrum.context
  const preview = useMemo(() => spectrum.kind === 'ready' ? {
    expectedBins: spectrum.expectedCcdSpectrum.saturated_bin_count,
    clippedBins: spectrum.previewExposure.clipped_high.filter(Boolean).length,
  } : undefined, [spectrum])
  const od = live ? calculateContextRayleighOd(live) : null
  const snr = run?.metrics.snr
  const liveFindings = useMemo(() => derived.ramanContexts.flatMap((context) =>
    diagnoseContext(context, context === live ? preview : undefined)), [derived.ramanContexts, live, preview])
  const frozen = useMemo(() => run ? diagnoseContext(run.input.instrument_snapshot.context, {
    expectedBins: run.metrics.saturation.expected_saturated_bin_count,
    clippedBins: run.exposures.reduce((max, exposure) => Math.max(max, exposure.clipped_high.filter(Boolean).length), 0),
    snr: run.metrics.snr, runId: run.input.id,
  }).filter(({ code }) => code === 'SNR_001' || code === 'CCD_001') : [], [run])
  const path = live?.path_state === 'valid-signal-path'
    ? od?.status === 'available' && od.value < DEFAULT_DIAGNOSTIC_THRESHOLDS.od ? 'LEAK' : 'SIGNAL'
    : live ? 'NO PATH' : 'Unavailable'
  const findings = [...liveFindings, ...frozen]
  const locate = (item: Diagnostic) => {
    const component = components.find(({ id }) => id === item.sampleId)
    if (component) {
      select(component.id)
      onLocate()
    }
  }
  return <section className="diagnostics-panel" aria-label="Engineering diagnostics">
    <div className="panel-heading">
      <div><p className="panel-kicker">Engineering review</p><h2>Diagnostics</h2></div>
      <span>{findings.length} {findings.length === 1 ? 'finding' : 'findings'}</span>
    </div>
    <dl className="engineering-telemetry">
      <div><dt>Optical path</dt><dd data-path-state={path}>{path}</dd><small>{live?.path_state ?? 'No current Raman context'}</small></div>
      <div><dt>Focus efficiency η</dt><dd>{live?.focus.state === 'lineage-focus' ? number(live.focus.efficiency) : 'Unavailable'}</dd><small>{live?.focus.state ?? 'No current Raman context'}</small></div>
      <div><dt>Rayleigh path OD</dt><dd>{od?.status === 'available' ? number(od.value) + ' OD' : 'Undefined'}</dd><small>{od?.status === 'undefined' ? od.undefined_reason : od ? 'Model attenuation at excitation wavelength' : 'No current Raman context'}</small></div>
      <div><dt>CCD saturation</dt><dd>{preview ? preview.expectedBins || preview.clippedBins ? 'Saturated' : 'Clear' : 'Unavailable'}</dd><small>{preview ? `${preview.expectedBins} expected · ${preview.clippedBins} clipped preview bins` : spectrum.kind === 'unavailable' ? spectrum.reason : ''}</small></div>
      <div><dt>Peak SNR · latest Run</dt><dd>{snr?.status === 'available' ? number(snr.value) + ' ratio' : 'Undefined'}</dd><small>{snr?.status === 'undefined' ? snr.undefined_reason : run ? run.input.id : 'No completed acquisition'}</small></div>
    </dl>
    {spectrum.kind === 'unavailable' && <p role="status" className="diagnostic-summary">{spectrum.reason}</p>}
    {findings.length ? <ul className="diagnostic-findings">{findings.map((item, index) => {
      const component = components.find(({ id }) => id === item.sampleId)
      return <li key={`${item.runId ?? 'live'}:${item.sampleId}:${item.code}:${index}`}>
        <div><strong data-severity={item.severity}>{item.severity}</strong> <code>{item.code}</code></div>
        <p>{item.message}</p>
        <small>{item.runId ? 'Frozen Run ' + item.runId : 'Current design'} · Sample {component?.name ?? item.sampleId}
          {item.sourceId && ' · Source ' + item.sourceId}
          {item.rayId && ' · Ray ' + item.rayId}</small>
        {item.metric && <small>{number(item.metric.value)} {item.metric.unit} · review threshold {item.metric.threshold}</small>}
        {!item.runId && component && <button type="button" onClick={() => locate(item)}>Locate {component.name}</button>}
      </li>
    })}</ul> : <p className="diagnostic-summary">{live ? 'No diagnostic findings for the available evidence.' : 'Diagnostics await a valid Raman context.'}</p>}
  </section>
}
