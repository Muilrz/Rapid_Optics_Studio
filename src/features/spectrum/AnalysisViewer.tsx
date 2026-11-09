import { useId, useRef, useState, type PointerEvent } from 'react'
import type { Peak } from '../../core/analysis/peaks'
import type { SpectrumSeries } from '../../core/analysis/processing'

type Domain = readonly [number, number]
const colors = ['#87dfb7', '#ffe08a', '#91bcff', '#ffa7d2', '#c5a6ff', '#ffaf88']
const left = 75
const right = 725
const top = 18
const bottom = 195
const units = ['counts/bin', 'dimensionless'] as const

function nearestBin(axis: readonly number[], shift: number): number {
  if (!axis.length || shift < axis[0]! || shift > axis.at(-1)!) return -1
  let low = 0
  let high = axis.length - 1
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (axis[mid]! > shift) high = mid
    else low = mid
  }
  return shift - axis[low]! <= axis[high]! - shift ? low : high
}

function analysisDomain(series: readonly SpectrumSeries[]): Domain {
  let low = Infinity
  let high = -Infinity
  for (const entry of series) {
    low = Math.min(low, entry.axis[0] ?? Infinity)
    high = Math.max(high, entry.axis.at(-1) ?? -Infinity)
  }
  if (low === Infinity) return [0, 1]
  return low === high ? [low - 1, high + 1] : [low, high]
}

interface ViewerProps {
  readonly series: readonly SpectrumSeries[]
  readonly target: SpectrumSeries
  readonly peaks: readonly Peak[]
  readonly marking: boolean
  readonly onMark: (bin: number) => void
}

export function AnalysisViewer({ series, target, peaks, marking, onMark }: ViewerProps) {
  const id = useId()
  const [window, setWindow] = useState<Domain | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [draft, setDraft] = useState({ low: '', high: '' })
  const [invalid, setInvalid] = useState(false)
  const drag = useRef<{ pixel: number; domain: Domain } | null>(null)
  const domain = window ?? analysisDomain(series.length ? series : [target])
  const span = domain[1] - domain[0]
  const ranges = units.map((unit) => {
    let low = 0
    let high = 0
    for (const entry of series) {
      if (entry.unit !== unit) continue
      entry.values.forEach((value, i) => {
        if (entry.axis[i]! < domain[0] || entry.axis[i]! > domain[1]) return
        low = Math.min(low, value)
        high = Math.max(high, value)
      })
    }
    return [low, high === low ? low + 1 : high] as const
  })
  const x = (shift: number) => left + (shift - domain[0]) / span * (right - left)
  const y = (value: number, unit: SpectrumSeries['unit']) => {
    const [low, high] = ranges[unit === 'counts/bin' ? 0 : 1]!
    return bottom - (value - low) / (high - low) * (bottom - top)
  }
  const pixel = (event: PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget
    const matrix = svg.getScreenCTM()
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x : left
  }
  const toShift = (px: number) => domain[0] + (px - left) / (right - left) * span
  const zoom = (factor: number) => {
    const mid = domain[0] + span / 2
    const radius = span * factor / 2
    if (radius >= 0.005 && radius <= 1e7) setWindow([mid - radius, mid + radius])
  }
  const reset = () => {
    setWindow(null)
    setCursor(null)
    setInvalid(false)
    setDraft({ low: '', high: '' })
  }
  return <>
    <div className="analysis-controls">
      <button onClick={() => zoom(0.5)}>Zoom in</button>
      <button onClick={() => zoom(2)}>Zoom out</button>
      <button onClick={() => setWindow([domain[0] - span / 4, domain[1] - span / 4])}>Pan left</button>
      <button onClick={() => setWindow([domain[0] + span / 4, domain[1] + span / 4])}>Pan right</button>
      <button onClick={reset}>Auto Window / Reset View</button>
    </div>
    <form className="analysis-controls" onSubmit={(event) => {
      event.preventDefault()
      const low = Number(draft.low)
      const high = Number(draft.high)
      const valid = draft.low.trim() && draft.high.trim() && Number.isFinite(low) &&
        Number.isFinite(high) && Math.max(Math.abs(low), Math.abs(high)) <= 1e8 && high - low >= 0.01 && high - low <= 2e7
      setInvalid(!valid)
      if (valid) setWindow([low, high])
    }}>
      <label>Min cm⁻¹ <input value={draft.low} onChange={(event) => setDraft({ ...draft, low: event.target.value })} /></label>
      <label>Max cm⁻¹ <input value={draft.high} onChange={(event) => setDraft({ ...draft, high: event.target.value })} /></label>
      <button>Custom Window</button>
      {invalid && <span role="alert">Enter increasing bounds within ±100,000,000 cm⁻¹ and a span of 0.01–20,000,000 cm⁻¹.</span>}
    </form>
    <svg className="spectrum-chart analysis-chart" viewBox="0 0 800 225" role="img"
      aria-label="Interactive analysis spectrum" data-window={domain.join(',')}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const px = pixel(event)
        if (px < left || px > right) return
        if (marking) {
          const bin = nearestBin(target.axis, toShift(px))
          if (bin >= 0) onMark(bin)
        } else {
          drag.current = { pixel: px, domain }
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }}
      onPointerMove={(event) => {
        const px = pixel(event)
        const start = drag.current
        if (start) {
          const offset = (start.pixel - px) / (right - left) * (start.domain[1] - start.domain[0])
          setWindow([start.domain[0] + offset, start.domain[1] + offset])
          setCursor(null)
        } else setCursor(px >= left && px <= right ? toShift(px) : null)
      }}
      onLostPointerCapture={() => { drag.current = null }}
      onPointerLeave={() => setCursor(null)}>
      <defs><clipPath id={id}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      <rect className="spectrum-chart-background" x={left} y={top} width={right - left} height={bottom - top} />
      <g clipPath={`url(#${id})`}>
        {series.map((entry, i) => <path key={entry.id} data-series={entry.id}
          d={entry.values.map((value, bin) => `${bin ? 'L' : 'M'}${x(entry.axis[bin]!)},${y(value, entry.unit)}`).join(' ')}
          stroke={colors[i % colors.length]} fill="none" vectorEffect="non-scaling-stroke" />)}
        {series.some((entry) => entry.id === target.id) && peaks.map((peak) => peak.source === 'reference' ?
          <line key={`reference-${peak.bin}`} x1={x(peak.position_cm_1)} x2={x(peak.position_cm_1)}
            y1={bottom - 17} y2={bottom} stroke="#ffe08a" strokeDasharray="3 2" /> :
          <circle key={`${peak.source}-${peak.bin}`} cx={x(peak.position_cm_1)} cy={y(peak.intensity, target.unit)} r={4} fill="#fff" />)}
        {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={top} y2={bottom} stroke="#aab5c7" />}
      </g>
      <text className="spectrum-axis-label" x={left} y={217}>{domain[0].toFixed(1)} cm⁻¹</text>
      <text className="spectrum-axis-label spectrum-axis-label--end" x={right} y={217}>{domain[1].toFixed(1)} cm⁻¹</text>
      {units.map((unit, i) => series.some((entry) => entry.unit === unit) &&
        <g key={unit} className="spectrum-axis-label">
          <text x={i ? right + 4 : 4} y={top + 10}>{ranges[i]![1].toPrecision(3)}</text>
          <text x={i ? right + 4 : 4} y={bottom - 15}>{ranges[i]![0].toPrecision(3)}</text>
          <text x={i ? right + 4 : 4} y={bottom}>{unit}</text>
        </g>)}
    </svg>
    <div className="spectrum-legend" aria-label="Visible analysis spectra">
      {series.map((entry, i) => <span key={entry.id}><i style={{ background: colors[i % colors.length] }} />
        {entry.kind} · {entry.runId} · {entry.unit}{entry.saturated ? ' · saturation evidence' : ''}</span>)}
    </div>
    <div className="analysis-cursor">Cursor {cursor === null ? '—' : `${cursor.toFixed(2)} cm⁻¹`}
      {cursor !== null && series.map((entry) => {
        const bin = nearestBin(entry.axis, cursor)
        return <div key={entry.id}>{entry.kind} · {entry.runId} · {bin < 0 ? 'outside sampled range' :
          `${entry.axis[bin]!.toFixed(2)} cm⁻¹ / ${entry.values[bin]!.toPrecision(5)} ${entry.unit}`}</div>
      })}
    </div>
  </>
}
