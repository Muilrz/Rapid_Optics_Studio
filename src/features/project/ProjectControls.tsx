import { ZodError } from 'zod'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { studioStore, useStudioStore, type StudioState } from '../../store/studioStore'
import { captureProject, newProject } from '../../project/studioProject'
import { parseJson, serializeProject } from '../../project/projectSerialization'
import { chooseFile, downloadFile, isFileCancellation, openProjectFile, readProjectFile,
  saveProjectFile, type ProjectFileHandle } from '../../project/browserFiles'
import { parseOpticalConfiguration, parseSpectrumCsv, serializeOpticalConfiguration } from '../../project/dataFiles'
import { parseSpectrumJson } from '../../project/legacySpectrum'
import { MaterialInput } from './MaterialInput'

const snapshot = (state: StudioState) => [
  state.authoritative, state.acquisition.completedRuns, state.analysis, state.spectrumLibrary,
  state.view.cameraAdjusted ? state.view.camera : null, state.view.gridVisible, state.editor.snapEnabled, state.projectMetadata.name,
] as const
const read = studioStore.getState
type Snapshot = ReturnType<typeof snapshot>
const differs = (current: Snapshot, saved: Snapshot) => current.some((item, i) => item !== saved[i])

function SimulationSettings() {
  const configuration = useStudioStore((state) => state.authoritative.simulationConfiguration)
  const update = useStudioStore((state) => state.setSimulationConfiguration)
  const [error, setError] = useState('')
  const fields = [
    ['max_rays', 'Max rays'], ['max_generations', 'Max generations'], ['min_ray_power_mw', 'Minimum ray power (mW)'],
    ['scene_escape_distance_mm', 'Escape distance (mm)'], ['ray_origin_offset_mm', 'Ray origin offset (mm)'],
  ] as const
  return <details className="project-options">
    <summary>Simulation Settings</summary>
    <div className="analysis-controls">
      {fields.map(([field, label]) => <label key={field}>{label} <input type="number" step="any"
        key={configuration[field]} defaultValue={configuration[field]}
        onBlur={(event) => {
          try {
            update({ ...configuration, [field]: event.target.valueAsNumber })
            setError('')
          } catch {
            setError('Invalid value for ' + label + '.')
            event.target.value = String(configuration[field])
          }
        }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>)}
    </div>
    <span role="status">{error}</span>
  </details>
}

export function ProjectControls() {
  const current = useStudioStore(useShallow(snapshot))
  const epoch = useStudioStore((state) => state.projectEpoch)
  const runtime = useStudioStore((state) => state.acquisition.runtime.status)
  const [saved, setSaved] = useState(() => snapshot(read()))
  const savedRef = useRef(saved)
  const remember = (signature: Snapshot) => { savedRef.current = signature; setSaved(signature) }
  const [busy, setBusy] = useState('')
  const pending = useRef(false)
  const [handle, setHandle] = useState<ProjectFileHandle>()
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const dirty = differs(current, saved)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!differs(snapshot(read()), savedRef.current) && read().acquisition.runtime.status !== 'running') return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const run = async (label: string, action: () => void | Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setBusy(label)
    setStatus('')
    setError('')
    try { await action() } catch (error) {
      if (isFileCancellation(error)) setStatus('File operation cancelled.')
      else if (error instanceof ZodError) setError(error.issues.slice(0, 5)
        .map((issue) => (issue.path.length ? issue.path.join('.') + ' · ' : '') + issue.message).join('\n'))
      else setError(error instanceof Error ? error.message : String(error))
    } finally { pending.current = false; setBusy('') }
  }
  const confirmReplace = () => {
    const state = read()
    const modified = differs(snapshot(state), savedRef.current)
    const acquiring = state.acquisition.runtime.status === 'running'
    return (!modified && !acquiring) || window.confirm([
      modified ? 'Discard unsaved project changes?' : '',
      acquiring ? 'The active acquisition will stop.' : '',
    ].filter(Boolean).join(' '))
  }
  const open = () => run('Opening project…', async () => {
    const selected = await openProjectFile()
    if (!selected) { setStatus('Open cancelled.'); return }
    const text = await readProjectFile(selected.file)
    const data = parseJson(text)
    if (!read().replaceProject(data, false, confirmReplace)) { setStatus('Open cancelled.'); return }
    setHandle(selected.handle)
    remember(snapshot(read()))
    setStatus('Opened ' + selected.file.name)
  })
  const create = () => run('Creating project…', () => {
    if (!read().replaceProject(newProject(read()), true, confirmReplace)) { setStatus('New Project cancelled.'); return }
    setHandle(undefined)
    remember(snapshot(read()))
    setStatus('New project ready.')
  })
  const save = (as: boolean) => run('Saving project…', async () => {
    const state = read()
    const signature = snapshot(state)
    const project = captureProject(state)
    const name = project.metadata.name.replace(/[<>:"/\\|?*]/g, '_') + '.rapid-optics.json'
    const metadata = Object.freeze({ ...project.metadata,
      updatedAt: [project.metadata.updatedAt, new Date().toISOString()].sort().at(-1)! })
    const result = await saveProjectFile(() => new Blob([serializeProject({ ...project, metadata })], {
      type: 'application/json',
    }), name, as ? undefined : handle)
    if (!result) { setStatus('Save cancelled.'); return }
    if (result === 'download') {
      setStatus('Download requested. Open the downloaded copy to verify it. No file was overwritten.')
      return
    }
    setHandle(result.handle)
    const latest = read().projectMetadata
    studioStore.setState({ projectMetadata: Object.freeze({ ...latest, updatedAt: metadata.updatedAt }) })
    remember(signature)
    setStatus('Saved ' + result.handle.name + (differs(snapshot(read()), signature) ? '. Newer changes are unsaved.' : '.'))
  })
  const importConfiguration = () => run('Reading configuration…', async () => {
    const file = await chooseFile('.json,application/json')
    if (!file) { setStatus('Import cancelled.'); return }
    const design = parseOpticalConfiguration(await readProjectFile(file))
    if (!window.confirm('Replace the current optical design and settings? Completed Runs and analysis will be kept.')) return
    read().applyOpticalConfiguration(design)
    setStatus('Imported optical configuration.')
  })
  const exportConfiguration = () => run('Exporting configuration…', () => {
    const { scene: opticalScene, simulationConfiguration, detectorConfiguration, materials } = read().authoritative
    const text = serializeOpticalConfiguration({ opticalScene, simulationConfiguration, detectorConfiguration, materials })
    downloadFile(new Blob([text], { type: 'application/json' }), 'rapid-optics-configuration.json')
    setStatus('Configuration download requested.')
  })
  const importSpectrum = () => run('Reading spectrum…', async () => {
    const file = await chooseFile('.json,.csv,application/json,text/csv')
    if (!file) { setStatus('Import cancelled.'); return }
    const text = await readProjectFile(file)
    read().addSpectrum(file.name.toLowerCase().endsWith('.csv') ? parseSpectrumCsv(text) : parseSpectrumJson(text))
    setStatus('Spectrum added to the project overlay library.')
  })
  return <section className="project-controls" aria-label="Project">
    <div className="analysis-controls">
      <label>Project name <input aria-label="Project name" value={current[7]} maxLength={128}
        onChange={(event) => studioStore.setState({ projectMetadata: Object.freeze({
          ...read().projectMetadata, name: event.target.value,
        }) })} onBlur={(event) => {
          const name = event.currentTarget.value.trim()
          if (name !== read().projectMetadata.name) studioStore.setState({
            projectMetadata: Object.freeze({ ...read().projectMetadata, name }),
          })
        }} /></label>
      <button type="button" disabled={!!busy} onClick={() => void create()}>New Project</button>
      <button type="button" disabled={!!busy} onClick={() => void open()}>Open Project</button>
      <button type="button" disabled={!!busy} onClick={() => void save(false)}>Save</button>
      <button type="button" disabled={!!busy} onClick={() => void save(true)}>Save As</button>
      <span className="project-dirty" data-dirty={dirty}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}{handle ? ' · ' + handle.name : ' · no linked file'}</span>
    </div>
    {runtime === 'running' && <p>Save includes completed Runs. Switching projects stops the active acquisition.</p>}
    <details className="project-tools">
      <summary>Import, export &amp; settings</summary>
      <div className="analysis-controls">
      <button type="button" disabled={!!busy} onClick={() => void importConfiguration()}>Import Optical Configuration</button>
      <button type="button" disabled={!!busy} onClick={() => void exportConfiguration()}>Export Optical Configuration</button>
      <button type="button" disabled={!!busy} onClick={() => void importSpectrum()}>Import Spectrum</button>
      </div>
      <SimulationSettings key={'simulation-' + epoch} />
      <MaterialInput key={'materials-' + epoch} />
    </details>
    <div role="status">{busy || status}</div>
    {error && <div role="alert" className="project-error">{error}</div>}
  </section>
}
