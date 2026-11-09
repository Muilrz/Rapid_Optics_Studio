import { useEffect, useRef, useState } from 'react'
import { useStudioStore } from '../../store/studioStore'
import type { CameraPreset } from './camera3d'
import { mountViewer } from './viewerRuntime'

const presets: readonly CameraPreset[] = ['Top', 'Front', 'Isometric', 'Reset Camera']

export default function PresentationPanel() {
  const host = useRef<HTMLDivElement>(null)
  const viewer = useRef<ReturnType<typeof mountViewer> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<{ message: string; retry: boolean } | null>(null)
  const [beam, setBeam] = useState(true)
  const [cone, setCone] = useState(true)
  const [label, setLabel] = useState(true)
  const contexts = useStudioStore((state) => state.derived.ramanContexts)
  const scene = useStudioStore((state) => state.authoritative.scene)

  useEffect(() => {
    if (!host.current) return
    try {
      const instance = mountViewer(host.current, setStatus)
      viewer.current = instance
      return () => {
        viewer.current = null
        instance.dispose()
      }
    } catch (error) {
      // Schedule the fallback after mounting so this effect also works under Strict Mode.
      const timer = window.setTimeout(() => setStatus({
        message: error instanceof Error ? error.message : 'The 3D viewer could not start.',
        retry: true,
      }), 0)
      return () => window.clearTimeout(timer)
    }
  }, [attempt])

  useEffect(() => viewer.current?.visibility(beam, cone, label), [attempt, beam, cone, label])

  return (
    <>
      <div className="presentation-controls" aria-label="3D controls">
        {presets.map((view) => (
          <button className="toolbar-button" type="button" key={view} disabled={Boolean(status)}
            onClick={() => viewer.current?.preset(view)}>{view}</button>
        ))}
        <button className="toolbar-button" type="button" aria-pressed={beam} onClick={() => setBeam(!beam)}>Beam</button>
        <button className="toolbar-button" type="button" aria-pressed={cone} onClick={() => setCone(!cone)}>Cone</button>
        <button className="toolbar-button" type="button" aria-pressed={label} onClick={() => setLabel(!label)}>Label</button>
      </div>
      <div className="presentation-viewport">
        <div className="presentation-canvas" ref={host} />
        {status && <div className="presentation-error" role="alert">
          <p>{status.message}</p>
          {status.retry && <button className="toolbar-button" type="button" onClick={() => {
            setStatus(null)
            setAttempt(attempt + 1)
          }}>Retry 3D</button>}
        </div>}
      </div>
      <div className="presentation-details">
        <p>Drag to orbit · right drag to pan · scroll or pinch to zoom</p>
        <p>
          <span className="presentation-raman">Amber Raman</span> ·{' '}
          <span className="presentation-rayleigh">Dashed Rayleigh</span> ·{' '}
          <span className="presentation-probe">Blue return probe</span>.
          Excitation color follows wavelength. Beam widths, spots and cones are illustrative.
        </p>
        <ul aria-label="Sample focus states">
          {contexts.map((context, index) => {
            const name = scene.components.find(({ id }) => id === context.sample_component_id)?.name
            const focus = context.focus
            const focusText = focus.state === 'lineage-focus'
              ? 'defocus ' + focus.defocus_mm?.toFixed(2) + ' mm · focus efficiency ' + (focus.efficiency * 100).toFixed(1) + '%'
              : focus.state === 'not-excited' ? 'not excited' : 'no objective in lineage'
            const path = context.path_state === 'valid-signal-path' ? 'signal path' :
              context.path_state === 'excited-no-return-path' ? 'no return signal' : 'no excitation'
            const leakage = context.rayleigh_return.effective_leakage_power_at_spectrometer_input_mw > 0
            return <li key={context.excitation_ray_id ?? context.sample_component_id + ':' + index}>
              {name} · {path} · {focusText}{leakage && ' · modeled Rayleigh leakage'}
            </li>
          })}
          {contexts.length === 0 && <li>No sample focus data</li>}
        </ul>
      </div>
    </>
  )
}
