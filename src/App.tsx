import { CURRENT_PHASE, PRODUCT_STATUS } from './app/stage'

function App() {
  return (
    <main className="app-shell">
      <section className="status-card" aria-labelledby="product-title">
        <p className="eyebrow">Raman-first virtual optical instrument</p>
        <h1 id="product-title">Rapid Optics Studio</h1>
        <p className="status">{PRODUCT_STATUS}</p>
        <div className="phase" aria-label="Current development phase">
          <span className="phase-indicator" aria-hidden="true" />
          <span>{CURRENT_PHASE}</span>
        </div>
        <p className="note">
          The development foundation is ready. Product functionality begins in
          a later phase.
        </p>
      </section>
    </main>
  )
}

export default App
