import { CURRENT_PHASE } from './app/stage'
import { OpticalBench } from './features/studio/OpticalBench'
import { useStudioStore } from './store/studioStore'

function App() {
  const scene = useStudioStore((state) => state.authoritative.scene)
  const trace = useStudioStore((state) => state.derived.trace)
  const selectedComponentId = useStudioStore(
    (state) => state.editor.selectedComponentId,
  )
  const snapEnabled = useStudioStore((state) => state.editor.snapEnabled)
  const gridVisible = useStudioStore((state) => state.view.gridVisible)
  const setGridVisible = useStudioStore((state) => state.setGridVisible)
  const setSnapEnabled = useStudioStore((state) => state.setSnapEnabled)
  const resetView = useStudioStore((state) => state.resetView)
  const detected = trace.events.some(
    (event) => event.kind === 'termination' && event.reason === 'detected',
  )
  const pitch_mm = scene.breadboards[0]?.hole_pitch_mm ?? 25
  const selectedComponent = scene.components.find(
    ({ id }) => id === selectedComponentId,
  )

  return (
    <main className="studio-shell">
      <header className="studio-toolbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Raman instrument workspace</p>
            <h1>Rapid Optics Studio</h1>
          </div>
        </div>

        <div className="toolbar-actions" aria-label="Studio controls">
          <button
            type="button"
            className="toolbar-button"
            aria-pressed={gridVisible}
            onClick={() => setGridVisible(!gridVisible)}
          >
            <span className="button-icon" aria-hidden="true">
              #
            </span>
            Grid {gridVisible ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className="toolbar-button"
            aria-pressed={snapEnabled}
            onClick={() => setSnapEnabled(!snapEnabled)}
          >
            <span className="button-icon" aria-hidden="true">
              ◉
            </span>
            Snap {snapEnabled ? 'On' : 'Off'}
          </button>
          <button type="button" className="toolbar-button" onClick={resetView}>
            <span className="button-icon" aria-hidden="true">
              ⌖
            </span>
            Reset View
          </button>
        </div>

        <div
          className={`toolbar-status${detected ? '' : ' toolbar-status--broken'}`}
          aria-live="polite"
        >
          <span className="status-indicator" aria-hidden="true" />
          <span className="toolbar-status-label">Derived trace</span>
          <span className="toolbar-status-value">
            {detected ? 'PATH DETECTED' : 'NO DETECTOR PATH'} · optics-v1
          </span>
        </div>
      </header>

      <section className="studio-workspace" aria-label="2D Studio">
        <div className="bench-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Authoritative view</p>
              <h2>Optical Bench</h2>
            </div>
            <div className="ray-legend" aria-label="Ray legend">
              <span className="legend-item">
                <i className="legend-swatch legend-swatch--excitation" />
                Excitation
              </span>
              <span className="legend-item">
                <i className="legend-swatch legend-swatch--return" />
                Sample return
              </span>
            </div>
          </div>
          <OpticalBench />
          <footer className="bench-statusbar">
            <span>{scene.components.length} components</span>
            <span>{trace.rays.length} rays</span>
            <span>{trace.segments.length} segments</span>
            <span>Grid {pitch_mm} mm</span>
            <span>World coordinates · mm</span>
          </footer>
        </div>

        <aside className="info-panel" aria-label="Studio information">
          <div className="info-panel-header">
            <p className="info-label">Workspace context</p>
            <h2>Scene Information</h2>
          </div>
          <dl className="info-list">
            <div className="info-row">
              <dt className="info-label">Current phase</dt>
              <dd className="info-value">{CURRENT_PHASE}</dd>
            </div>
            <div className="info-row">
              <dt className="info-label">Scene</dt>
              <dd className="info-value">
                {scene.breadboards[0]?.name ?? 'Optical Scene'}
              </dd>
            </div>
            <div className="info-row">
              <dt className="info-label">Selection</dt>
              <dd className="info-value" data-selection-status>
                {selectedComponent
                  ? `${selectedComponent.name} · ${selectedComponent.type}`
                  : 'None'}
              </dd>
            </div>
            {selectedComponent && (
              <div className="info-row">
                <dt className="info-label">Transform</dt>
                <dd className="info-value transform-readout">
                  <span>X {selectedComponent.transform.x_mm.toFixed(2)} mm</span>
                  <span>Y {selectedComponent.transform.y_mm.toFixed(2)} mm</span>
                  <span>
                    θ {selectedComponent.transform.rotation_deg.toFixed(1)}°
                  </span>
                </dd>
              </div>
            )}
            <div className="info-row">
              <dt className="info-label">Pitch</dt>
              <dd className="info-value">{pitch_mm} mm</dd>
            </div>
            <div className="info-row">
              <dt className="info-label">Laser</dt>
              <dd className="info-value">532 nm</dd>
            </div>
            <div className="info-row">
              <dt className="info-label">Optical model</dt>
              <dd className="info-value">Phase 1 simplified tracer</dd>
            </div>
          </dl>
          <p className="read-only-note">
            Selection and Snap are editor-only. Camera controls never modify
            optical geometry.
          </p>
        </aside>
      </section>
    </main>
  )
}

export default App
