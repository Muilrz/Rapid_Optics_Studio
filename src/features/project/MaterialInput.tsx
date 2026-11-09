import { useState } from 'react'
import { studioStore, useStudioStore } from '../../store/studioStore'
import { chooseFile, readProjectFile } from '../../project/browserFiles'
import { parseMaterialCsv } from '../../project/dataFiles'

const header = 'shift_cm-1,relative_intensity,fwhm_cm-1'
export function MaterialInput() {
  const addMaterial = useStudioStore((state) => state.addMaterial)
  const [name, setName] = useState('')
  const [fluorescence, setFluorescence] = useState('0')
  const [peaks, setPeaks] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async (csv: boolean) => {
    if (!name.trim() || !fluorescence.trim()) {
      setStatus('Enter a material name and fluorescence level.')
      return
    }
    const epoch = studioStore.getState().projectEpoch
    setBusy(true)
    try {
      const file = csv ? await chooseFile('.csv,text/csv') : undefined
      if (csv && !file) return
      const text = file ? await readProjectFile(file, 1024 * 1024) : header + '\n' + peaks
      if (studioStore.getState().projectEpoch !== epoch) return
      addMaterial(parseMaterialCsv(text, name, Number(fluorescence), 'material:' + crypto.randomUUID()))
      setStatus('Material added. Select it in the Sample material menu.')
      setName('')
      setPeaks('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <details className="project-options">
    <summary>Custom Raman Material</summary>
    <div className="analysis-controls">
      <label>Material name <input value={name} maxLength={128} onChange={(event) => setName(event.target.value)} /></label>
      <label>Fluorescence <input type="number" min="0" step="any" value={fluorescence}
        onChange={(event) => setFluorescence(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void create(true)}>Import Material CSV</button>
    </div>
    <div className="analysis-controls">
      <label>Peak rows ({header}) <textarea value={peaks} onChange={(event) => setPeaks(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void create(false)}>Create Material</button>
    </div>
    <span role="status">{status}</span>
  </details>
}
