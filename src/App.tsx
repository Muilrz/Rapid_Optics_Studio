import { useState } from 'react'
import { DiagnosticsPanel, EngineeringStatus } from './features/studio/DiagnosticsPanel'
import { ProjectControls } from './features/project/ProjectControls'
import { PresentationSection } from './features/presentation/PresentationSection'
import { CURRENT_PHASE } from './app/stage'
import { ComponentLibrary } from './features/studio/ComponentLibrary'
import { OpticalBench } from './features/studio/OpticalBench'
import { PropertyInspector } from './features/studio/PropertyInspector'
import { SpectrumPreview } from './features/spectrum/SpectrumPreview'
import { SpectrumAnalysis } from './features/spectrum/SpectrumAnalysis'
import { AcquisitionPanel } from './features/acquisition/AcquisitionPanel'
import { useStudioStore } from './store/studioStore'

function App() {
  const [workspace, setWorkspace] = useState('Bench')
  const epoch = useStudioStore((state) => state.projectEpoch)
  const scene = useStudioStore((state) => state.authoritative.scene)
  const trace = useStudioStore((state) => state.derived.trace)
  const traceFailure = useStudioStore((state) => state.derived.traceFailure)
  const spectrum = useStudioStore((state) => state.derived.spectrum)
  const snapEnabled = useStudioStore((state) => state.editor.snapEnabled)
  const selectedCount = useStudioStore(
    (state) => state.editor.selectedComponentIds.length,
  )
  const undoLabel = useStudioStore((state) => state.history.past.at(-1)?.label)
  const redoLabel = useStudioStore((state) => state.history.future.at(-1)?.label)
  const gridVisible = useStudioStore((state) => state.view.gridVisible)
  const setGridVisible = useStudioStore((state) => state.setGridVisible)
  const setSnapEnabled = useStudioStore((state) => state.setSnapEnabled)
  const resetView = useStudioStore((state) => state.resetView)
  const undo = useStudioStore((state) => state.undo)
  const redo = useStudioStore((state) => state.redo)
  const signalDetected = spectrum.context?.path_state === 'valid-signal-path'
  const signalStatus =
    spectrum.kind === 'unavailable'
      ? 'SPECTRUM UNAVAILABLE'
      : spectrum.context.path_state === 'valid-signal-path'
        ? 'SIGNAL PATH'
        : spectrum.context.path_state === 'excited-no-return-path'
          ? 'NO RETURN SIGNAL'
          : 'NO EXCITATION'
  const pitch_mm = scene.breadboards[0]?.hole_pitch_mm ?? 25

  return (
    <main className="studio-shell">
      <header className="studio-toolbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">{CURRENT_PHASE}</p>
            <h1>Rapid Optics Studio</h1>
          </div>
        </div>

        <div className="toolbar-actions" aria-label="Studio controls">
          <button
            type="button"
            className="toolbar-button"
            disabled={!undoLabel}
            title={undoLabel ? `Undo ${undoLabel}` : 'Nothing to undo'}
            onClick={undo}
          >
            <span className="button-icon" aria-hidden="true">↶</span>
            Undo
          </button>
          <button
            type="button"
            className="toolbar-button"
            disabled={!redoLabel}
            title={redoLabel ? `Redo ${redoLabel}` : 'Nothing to redo'}
            onClick={redo}
          >
            <span className="button-icon" aria-hidden="true">↷</span>
            Redo
          </button>
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
          className={`toolbar-status${signalDetected ? '' : ' toolbar-status--broken'}`}
          aria-live="polite"
        >
          <span className="status-indicator" aria-hidden="true" />
          <span className="toolbar-status-label">Derived trace</span>
          <span className="toolbar-status-value">
            {signalStatus} · optics-v1 / Raman-v1
          </span>
        </div>
      </header>

      <ProjectControls />
      <nav className="workspace-navigation" aria-label="Studio workspaces">
        {['Bench', '3D', 'Spectrum', 'Acquisition', 'Analysis', 'Diagnostics'].map((name) =>
          <button type="button" key={name} aria-pressed={workspace === name} onClick={() => setWorkspace(name)}>{name}</button>)}
      </nav>
      <section key={epoch} className={`studio-workspace${workspace === 'Bench' ? '' : ' studio-workspace--full'}`} aria-label={workspace === 'Bench' ? '2D Studio' : workspace + ' workspace'}>
        {workspace === 'Bench' && <ComponentLibrary />}
        <div className="studio-center-stack">
          {workspace === 'Bench' && <div className="bench-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Authoritative view</p>
                <h2>Optical Bench</h2>
              </div>
              <div className="bench-shortcuts">
                <a href="#component-library">Library</a>
                <a href="#property-inspector">Inspector</a>
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
              {traceFailure && <span role="alert">Trace failed · {traceFailure}</span>}
              <span>{scene.components.length} components</span>
              <span>{selectedCount} selected</span>
              <span>{trace.rays.length} rays</span>
              <span>{trace.segments.length} segments</span>
              <span>Grid {pitch_mm} mm</span>
              <span>World coordinates · mm</span>
            </footer>
          </div>}
          {workspace === '3D' && <PresentationSection />}
          {workspace === 'Spectrum' && <SpectrumPreview />}
          <div hidden={workspace !== 'Acquisition'}><AcquisitionPanel /></div>
          <div hidden={workspace !== 'Analysis'}><SpectrumAnalysis /></div>
          {workspace === 'Diagnostics' && <DiagnosticsPanel onLocate={() => setWorkspace('Bench')} />}
        </div>
        {workspace === 'Bench' && <PropertyInspector />}
      </section>
      <EngineeringStatus />
    </main>
  )
}

export default App
