import { Component, lazy, Suspense, useState, type ReactNode } from 'react'

const PresentationPanel = lazy(() => import('./PresentationPanel'))

class PresentationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed
      ? <p className="presentation-details" role="alert">The 3D panel could not load. Reload the page to retry.</p>
      : this.props.children
  }
}

export function PresentationSection() {
  const [open, setOpen] = useState(false)

  return (
    <section className="presentation-panel" aria-label="3D Viewer">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Derived view</p>
          <h2>3D Viewer</h2>
        </div>
        <button type="button" className="toolbar-button" aria-expanded={open}
          onClick={() => setOpen(!open)}>{open ? 'Close 3D' : 'Open 3D'}</button>
      </div>
      {open && <PresentationBoundary>
        <Suspense fallback={<p className="presentation-details" role="status">Loading 3D viewer…</p>}>
          <PresentationPanel />
        </Suspense>
      </PresentationBoundary>}
    </section>
  )
}
