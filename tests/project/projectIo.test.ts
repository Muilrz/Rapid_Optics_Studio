import { describe, expect, it } from 'vitest'
import { createStudioStore } from '../../src/store/studioStore'
import { captureProject, newProject } from '../../src/project/studioProject'
import { deserializeProject, serializeProject } from '../../src/project/projectSerialization'
import { createPipeline, replayPipeline, runSpectra } from '../../src/core/analysis/processing'
import { parseMaterialCsv, parseOpticalConfiguration, parseSpectrumCsv,
  serializeOpticalConfiguration, spectrumCsv, spectrumFile } from '../../src/project/dataFiles'
import { parseSpectrumJson } from '../../src/project/legacySpectrum'
import { spectrumSvg } from '../../src/project/spectrumFigure'
import { saveProjectFile } from '../../src/project/browserFiles'

function setup() {
  const callbacks: (() => void)[] = []
  let sequence = 0
  const store = createStudioStore(undefined, undefined, undefined, {
    schedule: (callback) => { callbacks.push(callback); return () => undefined },
    id: () => 'test-run-' + ++sequence,
    seed: () => 42,
  })
  return { store, drain: () => { while (callbacks.length) callbacks.shift()!() } }
}

describe('Project v1', () => {
  it('round-trips the complete scientific history, edits, overlays and view preferences', () => {
    const { store, drain } = setup()
    const state = store.getState
    const material = parseMaterialCsv('shift_cm-1,relative_intensity,fwhm_cm-1\n520.7,1,6',
      'Custom silicon', 0.02, 'material:custom')
    state().addMaterial(material)
    const sample = state().authoritative.scene.components.find(({ type }) => type === 'sample')!
    state().updateComponentParameters(sample.id, { material_id: material.id })
    state().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    drain()
    expect(state().acquisition.lastStartError).toBeNull()
    const run = state().acquisition.completedRuns[0]!
    const pipeline = { ...createPipeline(run.input.id), steps: [
      { id: 1, kind: 'baseline' as const, enabled: true, radius: 20 },
      { id: 2, kind: 'smoothing' as const, enabled: true, radius: 2 },
      { id: 3, kind: 'normalize' as const, enabled: true, method: 'max-absolute' as const },
    ] }
    const processed = replayPipeline(run, pipeline)!
    state().updateAnalysis((analysis) => ({ ...analysis, pipelines: new Map([[run.input.id, pipeline]]),
      peakEdits: new Map([[processed.id, { threshold: 12, detecting: true, manual: [50], ignored: [10], assignments: {} }]]),
      visible: new Map([[processed.id, true], [run.input.id + '/raw', true]]) }))
    state().setGridVisible(false)
    const saved = captureProject(state())
    const parsed = deserializeProject(serializeProject(saved))
    expect(parsed).toEqual(saved)
    const restored = createStudioStore()
    expect(restored.getState().replaceProject(parsed)).toBe(true)
    expect(captureProject(restored.getState())).toEqual(saved)
    const record = restored.getState().acquisition.completedRuns[0]!
    expect(Object.isFrozen(record.exposures[0]!.counts)).toBe(true)
    expect(Object.isFrozen(record.input.instrument_snapshot.optical_scene.components[0]!.transform)).toBe(true)
    expect(record.input.instrument_snapshot.material).toEqual(material)
    const invalidMean = { ...record, acquired_spectrum: { ...record.acquired_spectrum,
      counts: [record.acquired_spectrum.counts[0] === 0 ? 1 : 0, ...record.acquired_spectrum.counts.slice(1)],
    } }
    expect(() => serializeProject({ ...saved, acquisitionRuns: [invalidMean] })).toThrow(/Raw Mean does not match/)
    expect(() => serializeProject({ ...saved, acquisitionRuns: [run, run] })).toThrow(/Duplicate Run ID/)
    restored.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    expect(restored.getState().acquisition.runtime.status).toBe('running')
    const newRun = restored.getState().acquisition.runtime
    if (newRun.status === 'running') expect(newRun.input.id).not.toBe(run.input.id)
    restored.getState().cancelAcquisition('Test complete.')
    expect(replayPipeline(record, restored.getState().analysis.pipelines.get(run.input.id)!)).toEqual(processed)
    expect(restored.getState().derived.trace).toEqual(state().derived.trace)
    expect(restored.getState().derived.spectrum.expectedCcdSpectrum).toEqual(state().derived.spectrum.expectedCcdSpectrum)
  })

  it('validates the whole workspace before replacement and invalidates stale acquisition callbacks on success', () => {
    const { store, drain } = setup()
    const state = store.getState
    state().addComponent('mirror', { x: 300, y: -200 })
    state().copySelection()
    state().startAcquisition({ mode: 'average', number_of_exposures: 3 })
    const before = state()
    const data = newProject(before)
    const updates: unknown[] = []
    const unsubscribe = store.subscribe((next) => updates.push(next))
    expect(() => before.replaceProject({ ...data, analysisState: { ...data.analysisState, visible: [['missing/raw', true]] } }))
      .toThrow(/Overlay spectrum ID/)
    expect(state()).toBe(before)
    expect(before.replaceProject(data, true, () => false)).toBe(false)
    expect(state()).toBe(before)
    expect(before.replaceProject(data, true)).toBe(true)
    expect(updates).toHaveLength(1)
    drain()
    expect(updates).toHaveLength(1)
    unsubscribe()
    expect(state().acquisition.runtime.status).toBe('idle')
    expect(state().editor.clipboard).toBeNull()
    expect(state().history.past).toHaveLength(0)
    expect(state().editor.selectedComponentIds).toEqual([])
  })

  it('rejects syntax, future versions, non-finite values, unknown components, and corrupted Run arrays', () => {
    const { store, drain } = setup()
    const state = store.getState
    state().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    drain()
    const saved = captureProject(state())
    expect(() => deserializeProject('{')).toThrow('Invalid JSON')
    expect(() => deserializeProject(JSON.stringify({ ...saved, schemaVersion: '2.0' }))).toThrow('Unsupported project schema version')
    expect(() => serializeProject({ ...saved, detectorConfiguration: { ...saved.detectorConfiguration, integration_time_s: Infinity } }))
      .toThrow('finite')
    expect(() => deserializeProject(serializeProject(saved).replace(/"integration_time_s":[0-9.]+/, '"integration_time_s":1e999')))
      .toThrow('finite')
    expect(() => deserializeProject(serializeProject(saved).replace('"type":"mirror"', '"type":"unknown"')))
      .toThrow()
    const raw = saved.acquisitionRuns[0]!
    expect(() => serializeProject({ ...saved, acquisitionRuns: [{ ...raw, acquired_spectrum: {
      ...raw.acquired_spectrum, counts: raw.acquired_spectrum.counts.slice(1),
    } }] })).toThrow()
  })
})

describe('Data files', () => {
  it('exports each data kind with its own samples, units and provenance and makes a standalone figure', () => {
    const { store, drain } = setup()
    store.getState().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    drain()
    const run = store.getState().acquisition.completedRuns[0]!
    const { raw, expected } = runSpectra(run)
    const pipeline = { ...createPipeline(raw.runId), steps: [{ id: 1, enabled: true, kind: 'normalize' as const, method: 'min-max' as const }] }
    const processed = replayPipeline(run, pipeline)!
    expect(raw.values).not.toEqual(expected.values)
    for (const series of [raw, expected, processed]) {
      const data = spectrumFile(series, 'Frozen input', series.kind === 'processed' ? pipeline : null)
      const csv = spectrumCsv(data)
      expect(csv).toContain(series.kind === 'processed' ? 'intensity_dimensionless' : 'intensity_counts_per_bin')
      expect(parseSpectrumCsv(csv)).toEqual(data)
      expect(parseSpectrumJson(JSON.stringify(data))).toEqual(data)
      const svg = spectrumSvg(data)
      expect(svg).toContain('Raman shift (cm⁻¹)')
      expect(svg).toContain('Intensity (' + data.unit + ')')
      expect(svg).not.toMatch(/NaN|Infinity/)
      expect(svg.match(/L\d+\.\d+,\d+\.\d+/g)).toHaveLength(data.axis.length - 1)
    }
    expect(run.acquired_spectrum.counts).toBe(raw.values)
  })

  it('validates optical configuration and material rows without replacing project history', () => {
    const { store, drain } = setup()
    const state = store.getState
    state().startAcquisition({ mode: 'single', number_of_exposures: 1 })
    drain()
    const project = captureProject(state())
    const { opticalScene, simulationConfiguration, detectorConfiguration, materials } = project
    const config = serializeOpticalConfiguration({ opticalScene, simulationConfiguration, detectorConfiguration, materials })
    state().applyOpticalConfiguration(parseOpticalConfiguration(config))
    expect(state().acquisition.completedRuns).toBe(project.acquisitionRuns)
    expect(() => parseMaterialCsv('shift_cm-1,relative_intensity,fwhm_cm-1\n500,1,4\n550,,4', 'Name', 0, 'material:test'))
      .toThrow(/row 3/)
    expect(() => parseMaterialCsv('shift,relative_intensity,fwhm_cm-1\n500,1,4', 'Name', 0, 'material:test')).toThrow(/header/)
    expect(() => parseOpticalConfiguration('{"type":"raman-optics-config","version":1}')).toThrow(/pixel/)
  })

  it('adapts actual Demo v1 Expected semantics and rejects incomplete or inconsistent inputs', () => {
    const demo = { type: 'raman-spectrum', version: 1, label: 'Si 532nm', exportedAt: '2026-11-09T00:00:00.000Z',
      excitation_nm: 532, material: 'si', material_name: 'Silicon', integration_s: 1,
      window: { n: 2, smin: -100, smax: 1900 },
      telemetry: { etaFocus: 1, ramanPower: 0.1, rayleighLeak: 0, rayleighOD: 9, snr: 0, ok: true },
      peaks: [{ shift: 520.7, rel: 1, width: 3 }], spectrum: { shift: [-100, 1900], counts: [1.2, 3] } }
    expect(parseSpectrumJson(JSON.stringify(demo))).toMatchObject({ kind: 'expected', runId: null,
      saturated: null, axis: [-100, 1900], values: [1.2, 3], legacyMetadata: { telemetry: demo.telemetry, peaks: demo.peaks } })
    expect(() => parseSpectrumJson(JSON.stringify({ ...demo, version: 2 }))).toThrow()
    expect(() => parseSpectrumJson(JSON.stringify({ ...demo, spectrum: { ...demo.spectrum, counts: [1] } }))).toThrow(/window/)
    expect(() => parseSpectrumJson('{"shift":[1,2],"counts":[3,4]}')).toThrow()
  })

  it('rejects oversized browser Files before reading them', async () => {
    const { readProjectFile } = await import('../../src/project/browserFiles')
    await expect(readProjectFile(new File(['abcdef'], 'large.json'), 5)).rejects.toThrow(/safety limit/)
  })

  it('aborts a failed existing-file write without reporting completion', async () => {
    // An existing handle uses the same write transaction regardless of the picker implementation.
    const { vi } = await import('vitest')
    vi.stubGlobal('window', {})
    try {
      const close = vi.fn()
      const abort = vi.fn(async () => undefined)
      const failure = new Error('Write failed')
      const target = { name: 'test.json', getFile: async () => new File([], 'test.json'),
        createWritable: async () => ({ write: async () => { throw failure }, close, abort }) }
      await expect(saveProjectFile(() => new Blob(['{}']), target.name, target)).rejects.toBe(failure)
      expect(abort).toHaveBeenCalledOnce()
      expect(close).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})
