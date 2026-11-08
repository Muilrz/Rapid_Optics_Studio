import { describe, expect, it } from 'vitest'
import {
  AcquisitionExposureSchema,
  AcquisitionInputSchema,
  AcquisitionRequestSchema,
  AcquisitionRngProvenanceSchema,
  AcquisitionRunSchema,
  AcquisitionRuntimeSchema,
  AcquisitionUtcTimestampSchema,
  CancelledAcquisitionRunSchema,
  CompletedAcquisitionRunSchema,
  DEFAULT_ACQUISITION_EXPOSURES,
  InstrumentSnapshotSchema,
  MetricAvailabilitySchema,
  RawAcquiredSpectrumSchema,
  VirtualCcdConfigurationSchema,
  projectAcquisitionConfiguration,
  type AcquisitionClock,
} from '../../src/core/acquisition'
import { deriveStudioSimulation } from '../../src/store/derivedSimulation'
import { Transform2DSchema } from '../../src/core/optics'
import { createStudioStore } from '../../src/store/studioStore'
import {
  acquisitionContractFixture,
  cancelledContractFixture,
  fixedAcquisitionClock,
} from '../fixtures/acquisitionContracts'

type Mutable<T> = T extends string | number | boolean | null | undefined ? T :
  { -readonly [K in keyof T]: Mutable<T[K]> }
// Break fixture aliases so negative cases change exactly one contract field.
const fixture = (n = 2) => JSON.parse(JSON.stringify(acquisitionContractFixture(n))) as Mutable<ReturnType<typeof acquisitionContractFixture>>
const frozenTree = (value: unknown) => {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) frozenTree(child)
  }
}

describe('Phase 4A acquisition data contracts', () => {
  it.each([1, 2])('accepts immutable N=%i fixtures with explicit undefined metrics', (n) => {
    const run = CompletedAcquisitionRunSchema.parse(fixture(n))
    expect(run.exposures).toHaveLength(n)
    expect(run.exposures[0]!.exposure_index).toBe(0)
    expect(run.input.rng.seed_uint32).toBe(0)
    expect(run.metrics.snr.value).toBeNull()
    // Historical contract fixtures retain their original undefined availability.
    expect(run.metrics.rayleigh_od.status).toBe('undefined')
    if (run.metrics.rayleigh_od.status === 'undefined') expect(run.metrics.rayleigh_od.undefined_reason).not.toBe('')
    expect(run.acquired_spectrum.counts).toEqual(n === 1 ? [1, 2] : [2, 3])
    frozenTree(run)
    expect(AcquisitionRunSchema.parse(run)).toEqual(run)
  })

  it('accepts positive safe N without imposing a product capacity limit', () => {
    expect(DEFAULT_ACQUISITION_EXPOSURES).toBe(20)
    expect(AcquisitionRequestSchema.safeParse({ mode: 'average', number_of_exposures: Number.MAX_SAFE_INTEGER }).success).toBe(true)
  })

  it.each([
    ['single', 2], ['average', 1], ['average', 0], ['average', -1],
    ['average', 1.5], ['average', NaN], ['average', Infinity],
    ['average', Number.MAX_SAFE_INTEGER + 1], ['preview', 1],
  ])('rejects mode=%s, N=%s', (mode, n) => {
    expect(AcquisitionRequestSchema.safeParse({ mode, number_of_exposures: n }).success).toBe(false)
  })

  it.each([0, -1, Infinity, NaN])('rejects integration=%s for acquisition only', (integration) => {
    const data = fixture()
    data.input.instrument_snapshot.detector.integration_time_s = integration
    expect(InstrumentSnapshotSchema.safeParse(data.input.instrument_snapshot).success).toBe(false)
    if (integration === 0) expect(VirtualCcdConfigurationSchema.safeParse(data.input.instrument_snapshot.detector).success).toBe(true)
  })

  it('requires complete versioned RNG provenance, including seed=0', () => {
    const rng = fixture().input.rng
    expect(AcquisitionRngProvenanceSchema.parse(rng).seed_uint32).toBe(0)
    for (const key of Object.keys(rng)) {
      const invalid: Record<string, unknown> = { ...rng }
      delete invalid[key]
      expect(AcquisitionRngProvenanceSchema.safeParse(invalid).success).toBe(false)
    }
    for (const seed of [-1, 0x1_0000_0000, 0.5, NaN, null]) {
      expect(AcquisitionRngProvenanceSchema.safeParse({ ...rng, seed_uint32: seed }).success).toBe(false)
    }
    expect(AcquisitionRngProvenanceSchema.safeParse({ ...rng, consumption_order_version: 'arbitrary-order' }).success).toBe(false)
  })

  it('requires metric availability, reasons and finite values without inventing SNR/OD', () => {
    expect(MetricAvailabilitySchema.safeParse({ status: 'undefined', value: null, undefined_reason: 'Not defined by this model.' }).success).toBe(true)
    for (const undefined_reason of ['', '   ', undefined]) {
      expect(MetricAvailabilitySchema.safeParse({ status: 'undefined', value: null, undefined_reason }).success).toBe(false)
    }
    const data = fixture()
    expect(CompletedAcquisitionRunSchema.safeParse({ ...data, metrics: { ...data.metrics, snr: { status: 'available', value: 20 } } }).success).toBe(false)
    expect(CompletedAcquisitionRunSchema.safeParse({ ...data, metrics: { ...data.metrics, snr: undefined } }).success).toBe(false)
    for (const value of [Infinity, NaN, null]) {
      expect(MetricAvailabilitySchema.safeParse({ ...data.metrics.raman_power, value }).success).toBe(false)
    }
  })

  it.each(['unit', 'source', 'model_version', 'scientific_semantics'])('rejects missing proxy %s', (key) => {
    const data = fixture()
    const proxy: Record<string, unknown> = { ...data.metrics.raman_power }
    delete proxy[key]
    expect(CompletedAcquisitionRunSchema.safeParse({ ...data, metrics: { ...data.metrics, raman_power: proxy } }).success).toBe(false)
  })

  it('rejects metrics detached from frozen evidence', () => {
    const data = fixture()
    data.metrics.raman_power.value += 1
    expect(CompletedAcquisitionRunSchema.safeParse(data).success).toBe(false)
    data.metrics.raman_power.value -= 1
    data.metrics.saturation.expected_saturated_bin_count += 1
    expect(CompletedAcquisitionRunSchema.safeParse(data).success).toBe(false)
  })

  it('rejects missing snapshot or model manifest', () => {
    const input = fixture().input
    expect(AcquisitionInputSchema.safeParse({ ...input, instrument_snapshot: undefined }).success).toBe(false)
    expect(InstrumentSnapshotSchema.safeParse({ ...input.instrument_snapshot, simulation_model_version: undefined }).success).toBe(false)
    const data = fixture()
    expect(InstrumentSnapshotSchema.safeParse({ ...data.input.instrument_snapshot,
      simulation_model_version: { ...data.input.instrument_snapshot.simulation_model_version, focus: 'unknown-model' } }).success).toBe(false)
  })

  it('rejects mismatched identities, material contents and multi-detector lineage', () => {
    const data = fixture()
    const snapshot = data.input.instrument_snapshot
    expect(InstrumentSnapshotSchema.safeParse({ ...snapshot, target: { ...snapshot.target, laser_component_id: 'component:absent' } }).success).toBe(false)
    snapshot.material.peaks[0]!.relative_intensity += 1
    expect(InstrumentSnapshotSchema.safeParse(snapshot).success).toBe(false)
    const ambiguous = fixture().input.instrument_snapshot
    ambiguous.context.raman_return.spectrometer_component_ids.push(ambiguous.target.spectrometer_component_id)
    expect(InstrumentSnapshotSchema.safeParse(ambiguous).success).toBe(false)
  })

  it.each([
    (d: ReturnType<typeof fixture>) => { d.exposures[1]!.run_id = 'other-run' },
    (d: ReturnType<typeof fixture>) => { d.exposures[1]!.exposure_index = 0 },
    (d: ReturnType<typeof fixture>) => { d.exposures[1]!.axis.values_cm_1[1]! += 1 },
    (d: ReturnType<typeof fixture>) => { d.exposures[1]!.rng.seed_uint32 = 1 },
    (d: ReturnType<typeof fixture>) => { d.exposures[1]!.detector_bounds.maximum_counts += 1 },
    (d: ReturnType<typeof fixture>) => { d.acquired_spectrum.number_of_exposures = 3 },
    (d: ReturnType<typeof fixture>) => { d.acquired_spectrum.run_id = 'other-run' },
    (d: ReturnType<typeof fixture>) => { d.exposures.pop() },
    (d: ReturnType<typeof fixture>) => { d.input.expected_spectrum.detector.integration_time_s += 1 },
  ])('rejects cross-run, axis, seed, index, count and snapshot inconsistencies %#', (change) => {
    const data = fixture()
    change(data)
    expect(CompletedAcquisitionRunSchema.safeParse(data).success).toBe(false)
  })

  it('validates standalone frame/raw kinds, arrays, finite values and clipping evidence', () => {
    const data = fixture()
    const exposure = data.exposures[0]!
    for (const counts of [[1], [1, -1], [1, Infinity], [1, NaN], [1, exposure.detector_bounds.maximum_counts + 1]]) {
      expect(AcquisitionExposureSchema.safeParse({ ...exposure, counts }).success).toBe(false)
      expect(RawAcquiredSpectrumSchema.safeParse({ ...data.acquired_spectrum, counts }).success).toBe(false)
    }
    expect(AcquisitionExposureSchema.safeParse({ ...exposure, kind: 'simulated-ccd-preview-exposure' }).success).toBe(false)
    expect(AcquisitionExposureSchema.safeParse({ ...exposure, clipped_high: [false] }).success).toBe(false)
    expect(AcquisitionExposureSchema.safeParse({ ...exposure, clipped_low: [true, false] }).success).toBe(false)
    const single = fixture(1)
    single.acquired_spectrum.counts[0] = 2
    expect(CompletedAcquisitionRunSchema.safeParse(single).success).toBe(false)
  })

  it.each([0, 1, 2])('retains immutable cancelled k=%i frames, never completed/raw', (k) => {
    const data = fixture()
    const input = AcquisitionInputSchema.parse(data.input)
    const cancelled = { ...cancelledContractFixture(input), exposures: data.exposures.slice(0, k) }
    const result = CancelledAcquisitionRunSchema.parse(cancelled)
    expect(result.exposures).toHaveLength(k)
    frozenTree(result)
    expect(CompletedAcquisitionRunSchema.safeParse(result).success).toBe(false)
    expect(CancelledAcquisitionRunSchema.safeParse({ ...cancelled, acquired_spectrum: data.acquired_spectrum }).success).toBe(false)
    expect(CancelledAcquisitionRunSchema.safeParse({ ...cancelled, completed_at: data.completed_at }).success).toBe(false)
    expect(CancelledAcquisitionRunSchema.safeParse({ ...cancelled, cancellation_reason: '' }).success).toBe(false)
  })

  it('validates runtime shapes without transitions, timers or persistent Error Runs', () => {
    const data = fixture()
    const active = { status: 'running', token: 'token:1', input: data.input, exposures: data.exposures.slice(0, 1) }
    expect(AcquisitionRuntimeSchema.safeParse({ status: 'idle' }).success).toBe(true)
    expect(AcquisitionRuntimeSchema.safeParse(active).success).toBe(true)
    expect(AcquisitionRuntimeSchema.safeParse({ ...active, status: 'error', error_reason: 'Generator failed.' }).success).toBe(true)
    expect(AcquisitionRuntimeSchema.safeParse({ ...active, status: 'error' }).success).toBe(false)
    expect(AcquisitionRuntimeSchema.safeParse({ ...active, error_reason: 'Invalid running reason.' }).success).toBe(false)
    expect(AcquisitionRuntimeSchema.safeParse({ status: 'completed', run: data }).success).toBe(true)
    expect(AcquisitionRuntimeSchema.safeParse({ ...active, timer: 123 }).success).toBe(false)
    expect(AcquisitionRunSchema.safeParse({ ...active, status: 'error', error_reason: 'Not a persisted Run.' }).success).toBe(false)
  })

  it('maps timestamp to started_at only and accepts injected UTC Clock', () => {
    const clock: AcquisitionClock = fixedAcquisitionClock
    const data = fixture()
    data.input.started_at = clock.now()
    expect(AcquisitionInputSchema.safeParse(data.input).success).toBe(true)
    expect(AcquisitionInputSchema.safeParse({ ...data.input, timestamp: clock.now() }).success).toBe(false)
    expect(AcquisitionUtcTimestampSchema.safeParse('2026-11-08T08:00:00.000+08:00').success).toBe(false)
    expect(AcquisitionUtcTimestampSchema.safeParse('invalid').success).toBe(false)
    expect(CompletedAcquisitionRunSchema.safeParse({ ...data, completed_at: '2026-11-07T23:59:59.999Z' }).success).toBe(false)
    expect(CancelledAcquisitionRunSchema.safeParse({ ...cancelledContractFixture(AcquisitionInputSchema.parse(data.input)), cancelled_at: '2026-11-07T00:00:00.000Z' }).success).toBe(false)
  })

  it('detaches every nested array/object from inputs and other Runs', () => {
    const data = fixture()
    const first = CompletedAcquisitionRunSchema.parse(data)
    const second = CompletedAcquisitionRunSchema.parse(acquisitionContractFixture(2, 'run:second'))
    const saved = structuredClone(first)
    Reflect.set(data.input.instrument_snapshot.optical_scene.components[0]!.transform, 'x_mm', 100)
    data.input.instrument_snapshot.material.peaks[0]!.relative_intensity += 1
    data.input.instrument_snapshot.detector.qe_model.width_nm += 1
    data.exposures[0]!.counts[0] = 99
    data.acquired_spectrum.counts[0] = 99
    expect(first).toEqual(saved)
    expect(second.exposures[0]!.counts).toEqual([1, 2])
    expect(first.exposures[0]!.counts).not.toBe(first.acquired_spectrum.counts)
    expect(first.exposures[0]!.axis).not.toBe(first.acquired_spectrum.axis)
    expect(Reflect.set(first.exposures[0]!.counts, '0', 100)).toBe(false)
    expect(Reflect.set(first.input.instrument_snapshot.optical_scene.components[0]!.transform, 'x_mm', 100)).toBe(false)
    expect(second.input.instrument_snapshot).not.toBe(first.input.instrument_snapshot)
  })

  it('uses scientific projection instead of revision or editor/display data', () => {
    const data = fixture()
    const original = projectAcquisitionConfiguration(InstrumentSnapshotSchema.parse(data.input.instrument_snapshot))
    const snapshot = data.input.instrument_snapshot
    snapshot.configuration_revision += 1
    snapshot.optical_scene.components[0]!.name = 'Renamed'
    snapshot.optical_scene.components[0]!.metadata = { manufacturer: 'Unrelated' }
    snapshot.material.name = 'Label only'
    snapshot.material_dataset.materials.find((m) => m.id === snapshot.material.id)!.name = 'Label only'
    const same = projectAcquisitionConfiguration(InstrumentSnapshotSchema.parse(snapshot))
    expect(same).toEqual(original)
    frozenTree(same)
    snapshot.detector.integration_time_s += 1
    const changed = projectAcquisitionConfiguration(InstrumentSnapshotSchema.parse(snapshot))
    expect(changed).not.toEqual(original)
  })

  it('keeps stored contract data outside live design/history and Preview', () => {
    const store = createStudioStore()
    const data = fixture()
    data.input.instrument_snapshot.optical_scene = structuredClone(store.getState().authoritative.scene)
    const run = CompletedAcquisitionRunSchema.parse(data)
    const saved = structuredClone(run)
    const component = store.getState().authoritative.scene.components.find((c) => c.type === 'mirror')!
    store.getState().updateComponentTransform(component.id, Transform2DSchema.parse({ ...component.transform, x_mm: component.transform.x_mm + 20 }))
    store.getState().undo()
    store.getState().redo()
    store.getState().setDetectorConfiguration({ ...store.getState().authoritative.detectorConfiguration, integration_time_s: 2 })
    expect(run).toEqual(saved)
    expect(store.getState().history.past.every((entry) => !('run' in entry))).toBe(true)
    expect(store.getState().derived.spectrum).not.toHaveProperty('acquired_spectrum')
  })

  it('accepts real Phase 3 dark-only data without fabricating configuration or signal', () => {
    const data = fixture()
    const snapshot = data.input.instrument_snapshot
    const laser = snapshot.optical_scene.components.find((c) => c.type === 'laser')!
    laser.transform = Transform2DSchema.parse({ ...laser.transform, y_mm: laser.transform.y_mm + 1000 })
    const simulation = deriveStudioSimulation({ scene: snapshot.optical_scene,
      simulationConfiguration: snapshot.simulation_settings, detectorConfiguration: snapshot.detector, sourceRevision: 1 })
    expect(simulation.spectrum.kind).toBe('ready')
    if (simulation.spectrum.kind !== 'ready') throw new Error(simulation.spectrum.reason)
    snapshot.context = JSON.parse(JSON.stringify(simulation.spectrum.context)) as typeof snapshot.context
    expect(snapshot.context.path_state).toBe('no-excitation-path')
    const input = AcquisitionInputSchema.parse({ ...data.input, instrument_snapshot: snapshot, expected_spectrum: simulation.spectrum.expectedCcdSpectrum })
    expect(input.expected_spectrum.signal_counts.every((n) => n === 0)).toBe(true)
    const invented = { ...input.expected_spectrum, signal_counts: input.expected_spectrum.signal_counts.map(() => 1) }
    expect(AcquisitionInputSchema.safeParse({ ...input, expected_spectrum: invented }).success).toBe(false)
  })
})
