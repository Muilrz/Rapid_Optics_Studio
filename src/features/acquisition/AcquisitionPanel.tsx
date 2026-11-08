import { useState, type FormEvent } from 'react'
import {
  AcquisitionRequestSchema, DEFAULT_ACQUISITION_EXPOSURES,
  type AcquisitionRun,
} from '../../core/acquisition'
import type { StudioAcquisitionState } from '../../store/acquisitionRuntime'
import { useStudioStore } from '../../store/studioStore'
import { SpectrumChart } from '../spectrum/SpectrumPreview'

export function AcquisitionStatus({ acquisition }: { readonly acquisition: StudioAcquisitionState }) {
  const runtime = acquisition.runtime
  const active = runtime.status === 'running' || runtime.status === 'error' ? runtime : null
  const run = runtime.status === 'completed' || runtime.status === 'cancelled' ? runtime.run : null
  const n = active?.input.request.number_of_exposures ?? run?.input.request.number_of_exposures ?? 0
  const k = active?.exposures.length ?? run?.exposures.length ?? 0
  return <div className="acquisition-status" role="status" aria-live="polite" data-acquisition-status={runtime.status}>
    <strong>{runtime.status === 'idle' ? 'Ready' : runtime.status[0]!.toUpperCase() + runtime.status.slice(1)}</strong>
    {n > 0 && <><span>{k} / {n} exposures</span><progress aria-label="Acquisition progress" max={n} value={k} /></>}
    {runtime.status === 'cancelled' && <span>{runtime.run.cancellation_reason} Accepted frames retained; no complete raw mean.</span>}
    {runtime.status === 'error' && <span role="alert">{runtime.error_reason} No completed Run was created. You can start a new acquisition.</span>}
    {acquisition.lastStartError && <span role="alert">{acquisition.lastStartError}</span>}
  </div>
}

export function AcquisitionRunInspector({ run }: { readonly run: AcquisitionRun }) {
  const input = run.input
  const snapshot = input.instrument_snapshot
  const expected = input.expected_spectrum
  return <article className="acquisition-result" data-acquisition-run={input.id}>
    <h3>{run.status === 'completed' ? 'Raw acquired mean' : 'Cancelled acquisition'} · {input.request.mode}</h3>
    <p>{input.id} · {run.exposures.length}/{input.request.number_of_exposures} exposures · {snapshot.detector.integration_time_s} s each · counts/bin</p>
    {run.status === 'completed' ? <>
      <SpectrumChart shifts={expected.axis.values_cm_1} expected={expected.expected_counts}
        preview={run.acquired_spectrum.counts} fullWell={snapshot.detector.full_well_counts} secondaryKind="raw" />
      <div className="spectrum-legend"><span><i className="spectrum-legend-expected" />Expected at acquisition</span>
        <span><i className="spectrum-legend-raw" />Raw acquired mean · unprocessed</span></div>
      <dl className="acquisition-details" aria-label="Acquisition numerical metrics">
        <dt>Peak SNR (predicted model)</dt><dd data-metric="peak-snr">{run.metrics.snr.status === 'available'
          ? <>{run.metrics.snr.value.toPrecision(5)} ratio · Raman bin {run.metrics.snr.peak_shift_cm_1.toFixed(2)} cm⁻¹ · N={run.metrics.snr.number_of_exposures}</>
          : <>Undefined — {run.metrics.snr.undefined_reason}</>}</dd>
        <dt>Rayleigh path OD (model)</dt><dd data-metric="rayleigh-od">{run.metrics.rayleigh_od.status === 'available'
          ? <>{run.metrics.rayleigh_od.value.toPrecision(5)} OD · {run.metrics.rayleigh_od.excitation_wavelength_nm} nm · Sample return → Spectrometer input</>
          : <>Undefined — {run.metrics.rayleigh_od.undefined_reason}</>}</dd>
      </dl>
    </> : <p>{run.cancellation_reason} No complete raw mean. {run.exposures.length} accepted frames retained.</p>}
    <details>
      <summary>Instrument snapshot and metrics</summary>
      <dl className="acquisition-details">
        <dt>Started (UTC)</dt><dd>{input.started_at}</dd>
        <dt>{run.status === 'completed' ? 'Completed' : 'Cancelled'} (UTC)</dt><dd>{run.status === 'completed' ? run.completed_at : run.cancelled_at}</dd>
        <dt>Material</dt><dd>{snapshot.material.name} · {snapshot.material.id}</dd>
        <dt>Laser / Sample</dt><dd>{snapshot.target.laser_component_id} / {snapshot.target.sample_component_id}</dd>
        <dt>Spectrometer</dt><dd>{snapshot.target.spectrometer_component_id}</dd>
        <dt>Path / Focus efficiency</dt><dd>{snapshot.context.path_state} / {snapshot.context.focus.efficiency.toPrecision(5)}</dd>
        <dt>Detector at acquisition</dt><dd>Full well {snapshot.detector.full_well_counts} counts; gain {snapshot.detector.gain_counts_per_photoelectron}; read noise {snapshot.detector.read_noise_rms_counts} counts; dark {snapshot.detector.dark_current_counts_per_second_per_bin} counts/s/bin</dd>
        <dt>RNG provenance</dt><dd>{input.rng.algorithm_version}, seed {input.rng.seed_uint32}; {input.rng.sampling_algorithm_version}; {input.rng.consumption_order_version}</dd>
        <dt>Scientific model versions</dt><dd>{Object.values(snapshot.simulation_model_version).join(' · ')}</dd>
        {run.status === 'completed' && <>
          <dt>Raman effective power proxy</dt><dd>{run.metrics.raman_power.value.toPrecision(5)} mW · {run.metrics.raman_power.source} · {run.metrics.raman_power.model_version}</dd>
          <dt>Rayleigh leakage proxy</dt><dd>{run.metrics.rayleigh_leakage.value.toPrecision(5)} mW · {run.metrics.rayleigh_leakage.source} · {run.metrics.rayleigh_leakage.model_version}</dd>
          <dt>Power semantics</dt><dd>Detected effective power proxies; not absolute Raman radiant power.</dd>
          {run.metrics.snr.status === 'available' && <><dt>Peak SNR evidence</dt><dd>Expected Raman-only signal {run.metrics.snr.signal_counts.toPrecision(5)} counts/bin; Gaussian RMS of mean {run.metrics.snr.noise_rms_counts.toPrecision(5)} counts/bin. Pre-clipping model prediction, not empirical SNR. {run.metrics.snr.model_version} · {run.metrics.snr.source}</dd></>}
          {run.metrics.rayleigh_od.status === 'available' && <><dt>OD reference</dt><dd>−log₁₀(T), T={run.metrics.rayleigh_od.transmission.toExponential(5)}. Includes return-path routing/losses, excludes detector response. Empirical filter model, not calibrated spectral filter OD. {run.metrics.rayleigh_od.model_version} · {run.metrics.rayleigh_od.source}</dd></>}
          <dt>Saturation evidence</dt><dd>{expected.saturated_bin_count} expected saturated bins; {run.exposures.filter((f) => f.clipped_high.some(Boolean)).length} exposures with high clipping. Mean alone does not establish absence of saturation.</dd>
        </>}
      </dl>
      <p>Simplified / First-order model. Frozen data stays separate from live Preview. Records remain in memory for this session; reload clears them.</p>
    </details>
  </article>
}

export function AcquisitionPanel() {
  const acquisition = useStudioStore((s) => s.acquisition)
  const detector = useStudioStore((s) => s.authoritative.detectorConfiguration)
  const start = useStudioStore((s) => s.startAcquisition)
  const [mode, setMode] = useState<'single' | 'average'>('average')
  const [draftN, setDraftN] = useState(String(DEFAULT_ACQUISITION_EXPOSURES))
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const running = acquisition.runtime.status === 'running'
  const records = [...acquisition.completedRuns, ...acquisition.cancelledRuns]
  const selectedRun = selected ? records.find((r) => r.input.id === selected) :
    acquisition.completedRuns.at(-1) ?? acquisition.cancelledRuns.at(-1)
  const acquire = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      if (mode === 'average' && !draftN.trim()) throw new Error('Enter a positive integer exposure count.')
      const request = AcquisitionRequestSchema.parse({ mode, number_of_exposures: mode === 'single' ? 1 : Number(draftN) })
      setError(null)
      start(request)
    } catch { setError('Single requires N=1; Average requires a safe integer N greater than 1.') }
  }
  return <section className="spectrum-panel acquisition-panel" aria-label="Acquisition">
    <div className="spectrum-panel-heading"><div><p className="panel-kicker">Formal acquisition · frozen instrument</p><h2>Acquisition</h2></div>
      <span className="spectrum-model-badge">Simplified / First-order</span></div>
    <div className="acquisition-body">
      <form className="acquisition-controls" onSubmit={acquire}>
        <label className="spectrum-control"><span>Mode</span><select aria-label="Acquisition mode" className="spectrum-control-input" value={mode} disabled={running}
          onChange={(e) => { setMode(e.target.value as 'single' | 'average'); setError(null) }}>
          <option value="single">Single (N=1)</option><option value="average">Average N</option></select></label>
        <label className="spectrum-control"><span>Number of exposures</span><input aria-label="Number of exposures" className="spectrum-control-input" inputMode="numeric"
          value={mode === 'single' ? '1' : draftN} disabled={running || mode === 'single'} aria-invalid={error !== null}
          onChange={(e) => { setDraftN(e.target.value); setError(null) }} /></label>
        <span className="acquisition-integration">Integration {detector.integration_time_s} s<br /><small>Edit in Spectrum parameters above</small></span>
        <button className="toolbar-button" type="submit" disabled={running}>Acquire</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p className="acquisition-note">Accelerated simulation: integration controls counts, not wall-clock waiting. Each exposure uses fresh noise. Editing scientific configuration stops the active acquisition.</p>
      <AcquisitionStatus acquisition={acquisition} />
      <label className="spectrum-control acquisition-history"><span>Run history · {acquisition.completedRuns.length} completed / {acquisition.cancelledRuns.length} cancelled</span>
        <select aria-label="Run history" className="spectrum-control-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Latest completed Run</option>
          {records.map((r) => <option key={r.input.id} value={r.input.id}>{r.input.started_at} · {r.status} · {r.exposures.length}/{r.input.request.number_of_exposures} · {r.input.id}</option>)}
        </select></label>
      {selectedRun ? <AcquisitionRunInspector run={selectedRun} /> : <p>No formal acquisition data yet. Live Preview is not saved as a Run.</p>}
    </div>
  </section>
}
