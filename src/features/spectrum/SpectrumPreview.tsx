import { useState, type KeyboardEvent } from 'react'
import type { VirtualCcdConfiguration } from '../../core/acquisition'
import { BUILT_IN_RAMAN_MATERIALS } from '../../core/raman'
import { LASER_WAVELENGTH_PRESETS } from '../../project/defaults/laserPresets'
import { useStudioStore } from '../../store/studioStore'
import {
  formatInspectorError,
  parseFiniteNumericDraft,
} from '../studio/inspectorValidation'

const CHART_WIDTH = 920
const CHART_HEIGHT = 230
const CHART_PADDING = Object.freeze({ left: 58, right: 18, top: 18, bottom: 34 })

const pathForValues = (
  shifts: readonly number[],
  values: readonly number[],
  maximum: number,
): string => {
  const minimumShift = shifts[0] ?? 0
  const maximumShift = shifts.at(-1) ?? 1
  const shiftRange = Math.max(maximumShift - minimumShift, 1)
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  return values
    .map((value, index) => {
      const x =
        CHART_PADDING.left +
        (((shifts[index] ?? minimumShift) - minimumShift) / shiftRange) *
          plotWidth
      const y =
        CHART_PADDING.top +
        (1 - Math.min(value / Math.max(maximum, 1), 1)) * plotHeight
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

interface SpectrumChartProps {
  readonly shifts: readonly number[]
  readonly expected: readonly number[]
  readonly preview: readonly number[]
  readonly fullWell: number
}

export function SpectrumChart({
  shifts,
  expected,
  preview,
  fullWell,
}: SpectrumChartProps) {
  const maximum = Math.max(1, ...expected, ...preview)
  const expectedPath = pathForValues(shifts, expected, maximum)
  const previewPath = pathForValues(shifts, preview, maximum)
  const minimumShift = shifts[0] ?? 0
  const maximumShift = shifts.at(-1) ?? 0
  const saturated = maximum >= fullWell

  return (
    <svg
      className="spectrum-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label="Expected and seeded CCD preview spectra"
      data-spectrum-saturated={saturated}
    >
      <rect
        className="spectrum-chart-background"
        x={CHART_PADDING.left}
        y={CHART_PADDING.top}
        width={CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right}
        height={CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom}
      />
      {[0, 0.5, 1].map((fraction) => {
        const y =
          CHART_PADDING.top +
          fraction *
            (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom)
        return (
          <line
            key={fraction}
            className="spectrum-grid-line"
            x1={CHART_PADDING.left}
            x2={CHART_WIDTH - CHART_PADDING.right}
            y1={y}
            y2={y}
          />
        )
      })}
      <path className="spectrum-expected-path" d={expectedPath} />
      <path className="spectrum-preview-path" d={previewPath} />
      <text className="spectrum-axis-label" x={CHART_PADDING.left} y={CHART_HEIGHT - 10}>
        {minimumShift.toFixed(0)} cm⁻¹
      </text>
      <text
        className="spectrum-axis-label spectrum-axis-label--end"
        x={CHART_WIDTH - CHART_PADDING.right}
        y={CHART_HEIGHT - 10}
      >
        {maximumShift.toFixed(0)} cm⁻¹
      </text>
      <text className="spectrum-axis-label" x={8} y={CHART_PADDING.top + 9}>
        {maximum.toPrecision(3)} counts
      </text>
    </svg>
  )
}

interface NumericControlProps {
  readonly fieldKey: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly onCommit: (value: number) => void
}

function NumericControl({
  fieldKey,
  label,
  value,
  unit,
  onCommit,
}: NumericControlProps) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    try {
      onCommit(parseFiniteNumericDraft(draft))
      setError(null)
    } catch (commitError) {
      setError(formatInspectorError(commitError))
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setDraft(String(value))
      setError(null)
      event.currentTarget.blur()
    }
  }

  return (
    <label className="spectrum-control">
      <span>{label}</span>
      <span className="spectrum-control-input-wrap">
        <input
          className="spectrum-control-input"
          data-spectrum-control={fieldKey}
          value={draft}
          inputMode="decimal"
          aria-invalid={error !== null}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        <small>{unit}</small>
      </span>
      {error && <em role="alert">{error}</em>}
    </label>
  )
}

type DetectorNumericKey =
  | 'integration_time_s'
  | 'gain_counts_per_photoelectron'
  | 'full_well_counts'
  | 'read_noise_rms_counts'
  | 'dark_current_counts_per_second_per_bin'

const detectorControls = [
  ['integration_time_s', 'Integration', 's'],
  ['gain_counts_per_photoelectron', 'Gain', 'counts / e⁻'],
  ['full_well_counts', 'Full well', 'counts'],
  ['read_noise_rms_counts', 'Read noise', 'RMS counts'],
  ['dark_current_counts_per_second_per_bin', 'Dark current', 'counts / s / bin'],
] as const satisfies readonly (readonly [DetectorNumericKey, string, string])[]

export function SpectrumPreview() {
  const scene = useStudioStore((state) => state.authoritative.scene)
  const detector = useStudioStore(
    (state) => state.authoritative.detectorConfiguration,
  )
  const simulation = useStudioStore((state) => state.derived.spectrum)
  const lockedIds = useStudioStore((state) => state.editor.lockedComponentIds)
  const updateParameters = useStudioStore(
    (state) => state.updateComponentParameters,
  )
  const setDetectorConfiguration = useStudioStore(
    (state) => state.setDetectorConfiguration,
  )
  const context = simulation.context
  const sampleCandidate = scene.components.find(
    (component) =>
      component.type === 'sample' &&
      (context ? component.id === context.sample_component_id : true),
  )
  const sample =
    sampleCandidate?.type === 'sample' ? sampleCandidate : undefined
  const laserCandidate = scene.components.find(
    (component) =>
      component.type === 'laser' &&
      (context?.source_component_id
        ? component.id === context.source_component_id
        : true),
  )
  const laser = laserCandidate?.type === 'laser' ? laserCandidate : undefined
  const material = BUILT_IN_RAMAN_MATERIALS.find(
    ({ id }) => id === sample?.parameters.material_id,
  )
  const updateDetectorNumber = (
    key: DetectorNumericKey,
    value: number,
  ) =>
    setDetectorConfiguration({
      ...detector,
      [key]: value,
    } as VirtualCcdConfiguration)

  return (
    <section className="spectrum-panel" aria-label="Spectrum Preview">
      <div className="spectrum-panel-heading">
        <div>
          <p className="panel-kicker">Derived simulation · automatic</p>
          <h2>Spectrum Preview</h2>
        </div>
        <div className="spectrum-model-badge">
          Simplified / First-order Model
        </div>
      </div>

      <div className="spectrum-panel-body">
        <div className="spectrum-plot-region">
          {simulation.kind === 'ready' ? (
            <>
              <SpectrumChart
                shifts={simulation.expectedCcdSpectrum.axis.values_cm_1}
                expected={simulation.expectedCcdSpectrum.expected_counts}
                preview={simulation.previewExposure.counts}
                fullWell={simulation.expectedCcdSpectrum.detector.full_well_counts}
              />
              <div className="spectrum-legend" aria-label="Spectrum legend">
                <span><i className="spectrum-legend-expected" />Expected CCD</span>
                <span><i className="spectrum-legend-preview" />Seeded preview</span>
                <span>Seed {simulation.previewSeed_uint32}</span>
              </div>
            </>
          ) : (
            <div className="spectrum-unavailable" data-spectrum-unavailable>
              <strong>No spectrum preview</strong>
              <span>{simulation.reason}</span>
            </div>
          )}
        </div>

        <div className="spectrum-controls" aria-label="Spectrum parameters">
          <label className="spectrum-control">
            <span>Material</span>
            <select
              className="spectrum-control-input"
              data-spectrum-control="material_id"
              value={sample?.parameters.material_id ?? ''}
              disabled={!sample || lockedIds.includes(sample.id)}
              onChange={(event) => {
                if (sample?.type === 'sample') {
                  updateParameters(sample.id, {
                    material_id: event.target.value,
                  })
                }
              }}
            >
              {!material && <option value="">Unavailable</option>}
              {BUILT_IN_RAMAN_MATERIALS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="spectrum-control">
            <span>Laser wavelength</span>
            <select
              className="spectrum-control-input"
              data-spectrum-control="laser_wavelength_nm"
              value={laser?.parameters.wavelength_nm ?? ''}
              disabled={!laser || lockedIds.includes(laser.id)}
              onChange={(event) => {
                if (laser?.type === 'laser') {
                  updateParameters(laser.id, {
                    ...laser.parameters,
                    wavelength_nm: Number(event.target.value),
                  })
                }
              }}
            >
              {!laser && <option value="">Unavailable</option>}
              {LASER_WAVELENGTH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.wavelength_nm}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          {detectorControls.map(([key, label, unit]) => (
            <NumericControl
              key={`${key}:${detector[key]}`}
              fieldKey={key}
              label={label}
              value={detector[key]}
              unit={unit}
              onCommit={(value) => updateDetectorNumber(key, value)}
            />
          ))}
          <div className="spectrum-qe-readout">
            <span>QE model</span>
            <code>{detector.qe_model.kind}</code>
          </div>
        </div>

        <dl className="spectrum-telemetry" aria-label="Raman telemetry">
          <div><dt>Material</dt><dd>{material?.name ?? 'Unavailable'}</dd></div>
          <div><dt>Laser</dt><dd>{laser?.parameters.wavelength_nm ?? '—'} nm</dd></div>
          <div>
            <dt>Focus</dt>
            <dd data-focus-state={context?.focus.state ?? 'unavailable'}>
              {context
                ? `${context.focus.state} · η ${context.focus.efficiency.toFixed(4)}`
                : 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>Path state</dt>
            <dd data-raman-path-state={context?.path_state ?? 'unavailable'}>
              {context?.path_state ?? 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>At Sample</dt>
            <dd>{context?.excitation_power_at_sample_mw.toPrecision(5) ?? '—'} mW</dd>
          </div>
          <div>
            <dt>Effective</dt>
            <dd>{context?.effective_excitation_power_mw.toPrecision(5) ?? '—'} mW</dd>
          </div>
          <div>
            <dt>Detected Raman</dt>
            <dd data-detected-raman-power>
              {context?.raman_return.detected_effective_excitation_power_mw.toPrecision(5) ?? '—'} mW
            </dd>
          </div>
          <div>
            <dt>Saturation</dt>
            <dd data-saturation-state>
              {simulation.kind === 'ready'
                ? simulation.expectedCcdSpectrum.saturated_bin_count > 0
                  ? `${simulation.expectedCcdSpectrum.saturated_bin_count} bins`
                  : 'None'
                : 'Unavailable'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

