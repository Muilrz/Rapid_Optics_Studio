import { useState } from 'react'
import { downloadFile } from '../../project/browserFiles'
import { spectrumCsv } from '../../project/dataFiles'
import type { SpectrumFile } from '../../project/projectSchema'
import { spectrumPng, spectrumSvg } from '../../project/spectrumFigure'

export interface ExportChoice {
  readonly label: string
  readonly load: () => SpectrumFile
}

export function SpectrumExport({ choices }: { choices: readonly ExportChoice[] }) {
  const [choice, setChoice] = useState('')
  const [format, setFormat] = useState('json')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = choices.find((item) => item.label === choice)
  const save = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const spectrum = selected.load()
      const name = 'rapid-optics-' + spectrum.kind + '.' + format
      const blob = format === 'png' ? await spectrumPng(spectrumSvg(spectrum)) :
        format === 'svg' ? new Blob([spectrumSvg(spectrum)], { type: 'image/svg+xml;charset=utf-8' }) :
          format === 'csv' ? new Blob([spectrumCsv(spectrum)], { type: 'text/csv;charset=utf-8' }) :
            new Blob([JSON.stringify(spectrum)], { type: 'application/json' })
      downloadFile(blob, name)
      setStatus('Download requested for ' + name)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <div className="analysis-controls">
    <label>Spectrum to export <select value={selected ? choice : ''} onChange={(event) => setChoice(event.target.value)}>
      <option value="">Select spectrum</option>
      {choices.map(({ label }) => <option key={label}>{label}</option>)}
    </select></label>
    <label>Export format <select value={format} onChange={(event) => setFormat(event.target.value)}>
      <option value="json">JSON</option><option value="csv">CSV</option>
      <option value="png">PNG</option><option value="svg">SVG</option>
    </select></label>
    <button type="button" disabled={busy || !selected} onClick={() => void save()}>Export Spectrum</button>
    <span role="status">{status}</span>
  </div>
}
