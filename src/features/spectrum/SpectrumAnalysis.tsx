import { useMemo, useState } from 'react'
import { detectPeaks, manualPeak, referencePeaks, type PeakAssignment } from '../../core/analysis/peaks'
import { createPipeline, replayPipeline, runSpectra, type ProcessingPipeline, type ProcessingStep } from '../../core/analysis/processing'
import type { CompletedAcquisitionRun } from '../../core/acquisition'
import { useStudioStore } from '../../store/studioStore'
import { AnalysisViewer } from './AnalysisViewer'

interface PeakEdits {
  readonly threshold: number
  readonly detecting: boolean
  readonly manual: readonly number[]
  readonly ignored: readonly number[]
  readonly assignments: Readonly<Record<string, PeakAssignment>>
}

interface SpectrumAnalysisState {
  readonly pipelines: ReadonlyMap<string, ProcessingPipeline>
  readonly visible: ReadonlyMap<string, boolean>
  readonly peakEdits: ReadonlyMap<string, PeakEdits>
}

const emptyEdits: PeakEdits = { threshold: 10, detecting: false, manual: [], ignored: [], assignments: {} }
const stepNames = { baseline: 'Baseline Correction', smoothing: 'Smoothing', normalize: 'Normalize' }

function defaultStep(kind: ProcessingStep['kind'], id: number): ProcessingStep {
  return kind === 'normalize' ?
    { id, kind, enabled: true, method: 'max-absolute' } :
    { id, kind, enabled: true, radius: kind === 'baseline' ? 20 : 2 }
}

function RadiusInput({ step, update }: {
  step: Extract<ProcessingStep, { radius: number }>
  update: (step: ProcessingStep) => void
}) {
  return <label>Radius (bins) <input key={step.radius} type="number" min="1" max="200" step="1"
    defaultValue={step.radius} onBlur={(event) => {
      const value = event.target.valueAsNumber
      if (Number.isInteger(value) && value >= 1 && value <= 200) update({ ...step, radius: value })
      else event.target.value = String(step.radius)
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

function RunAnalysis({ run, runs, state, setState }: {
  run: CompletedAcquisitionRun
  runs: readonly CompletedAcquisitionRun[]
  state: SpectrumAnalysisState
  setState: React.Dispatch<React.SetStateAction<SpectrumAnalysisState>>
}) {
  const runId = run.input.id
  const pipeline = state.pipelines.get(runId)
  const [marking, setMarking] = useState(false)
  const [showReferences, setShowReferences] = useState(false)
  const [markBin, setMarkBin] = useState('')
  const spectra = useMemo(() => runs.map((record) => {
    const current = state.pipelines.get(record.input.id)
    return { ...runSpectra(record), processed: current ? replayPipeline(record, current) : null }
  }), [runs, state.pipelines])
  const active = spectra.find(({ raw }) => raw.runId === runId)!
  const target = active.processed ?? active.raw
  const available = spectra.flatMap(({ raw, expected, processed }) => [expected, raw, ...(processed ? [processed] : [])])
  const visible = available.filter((entry) => state.visible.get(entry.id) ??
    (entry.runId === runId && entry.id === target.id))
  const edits = state.peakEdits.get(target.id) ?? emptyEdits
  const references = referencePeaks(run.input.instrument_snapshot.material)
  const detected = edits.detecting ? detectPeaks(target, edits.threshold / 100) : []
  const peaks = [
    ...detected.filter(({ bin }) => !edits.ignored.includes(bin)),
    ...edits.manual.map((bin) => manualPeak(target, bin)),
  ].map((peak) => ({ ...peak, assignment: edits.assignments[`${peak.source}-${peak.bin}`] ?? null })).sort((a, b) => a.position_cm_1 - b.position_cm_1)

  const updateSteps = (edit: (steps: readonly ProcessingStep[]) => readonly ProcessingStep[]) =>
    setState((current) => {
      const previous = current.pipelines.get(runId) ?? createPipeline(runId)
      const steps = edit(previous.steps)
      const pipelines = new Map(current.pipelines).set(runId, { ...previous, steps })
      if (steps.some((step) => step.enabled)) return { ...current, pipelines }
      // A fully disabled or empty pipeline returns focus to Raw.
      const visible = new Map(current.visible)
      visible.delete(active.raw.id)
      return { ...current, pipelines, visible }
    })
  const updateEdits = (edit: (previous: PeakEdits) => PeakEdits) =>
    setState((current) => ({ ...current, peakEdits: new Map(current.peakEdits)
      .set(target.id, edit(current.peakEdits.get(target.id) ?? emptyEdits)) }))
  const addManual = (bin: number) => {
    updateEdits((current) => current.manual.includes(bin) ? current :
      { ...current, manual: [...current.manual, bin] })
    setMarking(false)
  }
  const replace = (step: ProcessingStep) => updateSteps((steps) =>
    steps.map((item) => item.id === step.id ? step : item))

  return <>
    <h3>Processing Pipeline</h3>
    <div className="analysis-controls">
      {(Object.keys(stepNames) as ProcessingStep['kind'][]).map((kind) =>
        <button key={kind} onClick={() => updateSteps((steps) => {
          const id = Math.max(0, ...steps.map((step) => step.id)) + 1
          return [...steps, defaultStep(kind, id)]
        })}>Add {stepNames[kind]}</button>)}
      <button onClick={() => updateSteps(() => [])}>Reset Pipeline</button>
    </div>
    <ol className="analysis-steps">
      {pipeline?.steps.map((step) => <li key={step.id}>
        <div className="analysis-controls">
          <label><input type="checkbox" checked={step.enabled} onChange={(event) =>
            replace({ ...step, enabled: event.target.checked })} /> {stepNames[step.kind]}</label>
          {step.kind === 'normalize' ? <label>Method <select value={step.method} onChange={(event) =>
            replace({ ...step, method: event.target.value === 'min-max' ? 'min-max' : 'max-absolute' })}>
            <option value="max-absolute">Max absolute</option><option value="min-max">Min–max</option>
          </select></label> : <RadiusInput step={step} update={replace} />}
          <button onClick={() => replace(defaultStep(step.kind, step.id))}>Reset {stepNames[step.kind]}</button>
          <button onClick={() => updateSteps((steps) => steps.filter((item) => item.id !== step.id))}>Delete {stepNames[step.kind]}</button>
        </div>
      </li>)}
    </ol>
    <p>Analyzing {target.kind} · {target.unit}{pipeline?.steps.length ? ` · ${pipeline.algorithmVersion}` : ''}</p>
    <details open>
      <summary>Spectrum Overlay</summary>
      <div className="analysis-controls">
        {available.map((entry) => <label key={entry.id}>
          <input type="checkbox" checked={visible.includes(entry)} onChange={(event) => {
            const checked = event.target.checked
            setState((current) => ({ ...current, visible: new Map(current.visible).set(entry.id, checked) }))
          }} /> {entry.kind} · {entry.runId}
        </label>)}
      </div>
    </details>
    <AnalysisViewer series={visible} target={target} peaks={[...peaks, ...(showReferences ? references : [])]}
      marking={marking} onMark={addManual} />
    <h3>Peak Analysis</h3>
    <div className="analysis-controls">
      <label>Prominence (% of range) <input type="number" min="1" max="100" key={target.id} defaultValue={edits.threshold}
        onChange={(event) => {
          const value = event.target.valueAsNumber
          if (value >= 1 && value <= 100) updateEdits((current) => ({ ...current, threshold: value }))
        }} /></label>
      <button onClick={() => updateEdits((current) => ({ ...current, detecting: true }))}>Detect Peaks</button>
      <button onClick={() => updateEdits((current) => ({ ...current, ignored: [] }))}>Restore Ignored</button>
      <button aria-pressed={marking} onClick={() => setMarking(!marking)}>{marking ? 'Click a bin to mark' : 'Mark on Chart'}</button>
      <label>Sample bin (0–{target.axis.length - 1}) <input type="number" min="0" max={target.axis.length - 1}
        value={markBin} onChange={(event) => setMarkBin(event.target.value)} /></label>
      <button disabled={!markBin || !Number.isInteger(Number(markBin)) || Number(markBin) < 0 ||
        Number(markBin) >= target.axis.length} onClick={() => addManual(Number(markBin))}>Add Manual Peak</button>
      <label><input type="checkbox" checked={showReferences} onChange={(event) => setShowReferences(event.target.checked)} />
        Reference markers · {run.input.instrument_snapshot.material.name}</label>
    </div>
    <p>FWHM uses half prominence above the local baseline. Reference labels describe the frozen material dataset.</p>
    <ul className="analysis-peaks">
      {peaks.map((peak) => {
        const key = `${peak.source}-${peak.bin}`
        const assignment = peak.assignment
        return <li key={key}>
          <div>{peak.source} · {peak.position_cm_1.toFixed(2)} cm⁻¹ · {peak.intensity.toPrecision(5)} {target.unit} ·
            FWHM {peak.fwhm === null ? 'Undefined' : `${peak.fwhm.toFixed(2)} cm⁻¹`}</div>
          <div className="analysis-controls">
            <label>Reference assignment <select value={assignment?.referencePosition_cm_1 ?? ''} onChange={(event) => {
              const selected = references.find((ref) => String(ref.position_cm_1) === event.target.value)
              updateEdits((current) => {
                const assignments = { ...current.assignments }
                if (selected?.assignment) assignments[key] = selected.assignment
                else delete assignments[key]
                return { ...current, assignments }
              })
            }}>
              <option value="">Unassigned</option>
              {references.filter((ref) => ref.assignment).map((ref) => <option key={ref.bin} value={ref.position_cm_1}>
                {ref.position_cm_1} cm⁻¹
              </option>)}
            </select></label>
            <button onClick={() => updateEdits((current) => ({
              ...current,
              manual: peak.source === 'manual' ? current.manual.filter((bin) => bin !== peak.bin) : current.manual,
              ignored: peak.source === 'auto' ? [...current.ignored, peak.bin] : current.ignored,
              assignments: Object.fromEntries(Object.entries(current.assignments).filter(([id]) => id !== key)),
            }))}>{peak.source === 'manual' ? 'Delete Peak' : 'Ignore Peak'}</button>
          </div>
          {assignment && <p>Selected reference · {assignment.label}</p>}
        </li>
      })}
    </ul>
    {showReferences && <ul>{references.map((ref) => <li key={ref.bin}>
      Reference · {ref.position_cm_1} cm⁻¹ · {ref.assignment?.label ?? 'Unassigned'}
    </li>)}</ul>}
  </>
}

export function SpectrumAnalysis() {
  const runs = useStudioStore((state) => state.acquisition.completedRuns)
  const [selected, setSelected] = useState('')
  const [state, setState] = useState<SpectrumAnalysisState>(() => ({
    pipelines: new Map(), visible: new Map(), peakEdits: new Map(),
  }))
  const run = runs.find((entry) => entry.input.id === selected) ?? runs.at(-1)
  return <section className="spectrum-panel analysis-panel" aria-label="Spectrum Analysis">
    <div className="spectrum-panel-heading"><div>
      <p className="panel-kicker">Completed runs · session analysis</p><h2>Spectrum Analysis</h2>
    </div></div>
    {run ? <>
      <label>Analysis Run <select value={run.input.id} onChange={(event) => setSelected(event.target.value)}>
        {runs.map((entry) => <option key={entry.input.id} value={entry.input.id}>
          {entry.input.id} · {entry.input.instrument_snapshot.material.name} · {entry.completed_at}
        </option>)}
      </select></label>
      <RunAnalysis key={run.input.id} run={run} runs={runs} state={state} setState={setState} />
    </> : <p>Complete an acquisition to analyze its Raw Mean.</p>}
  </section>
}
