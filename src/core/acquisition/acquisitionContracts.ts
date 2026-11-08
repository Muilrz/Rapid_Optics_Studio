import { z } from 'zod'
import {
  ComponentIdSchema,
  OpticalSceneSchema,
  SimulationConfigurationSchema,
} from '../optics'
import {
  RamanMaterialDatasetSchema,
  RamanMaterialSchema,
  RamanOpticalContextSchema,
  RAMAN_SPECTRUM_MODEL_VERSION,
  SpectrumAxisSchema,
} from '../raman'
import {
  CCD_NOISE_MODEL_VERSION,
  ExpectedCcdSpectrumSchema,
  VirtualCcdConfigurationSchema,
  VirtualSpectrometerConfigurationSchema,
} from './contracts'
import { PEAK_SNR_MODEL_VERSION, PEAK_SNR_SEMANTICS, RAYLEIGH_OD_MODEL_VERSION,
  RAYLEIGH_OD_SEMANTICS, meanNoiseRmsCounts } from './numericalMetrics'

/** Contract versions do not claim that Phase 4B algorithms exist. */
export const ACQUISITION_CONTRACT_VERSION = 'acquisition-contract-v1' as const
export const ACQUISITION_CONFIGURATION_IDENTITY_VERSION =
  'acquisition-scientific-inputs-v1' as const
export const ACQUISITION_RNG_ORDER_VERSION =
  'exposure-bin-counting-read-four-uniforms-v1' as const
export const DEFAULT_ACQUISITION_EXPOSURES = 20

type DeepReadonly<T> = T extends string | number | boolean | null | undefined ? T : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T

// Only used on Zod's detached, strictly parsed plain-data outputs.
const freezeData = <T>(value: T): DeepReadonly<T> => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child)
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}
const copyPlainData = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((child) => copyPlainData(child)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyPlainData(child)])) as T
  }
  return value
}

const label = z.string().trim().min(1).max(512)
const finite = z.number().finite()
const nonnegative = finite.nonnegative()
const safeIndex = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const positiveInteger = safeIndex.min(1)
const runId = label
export const AcquisitionUtcTimestampSchema = z.iso.datetime({ precision: 3 })

/** Clock/seed production and scheduling belong to the application, not Core. */
export interface AcquisitionClock {
  now(): string
}

export const AcquisitionRequestSchema = z.strictObject({
  mode: z.enum(['single', 'average']),
  number_of_exposures: positiveInteger,
}).superRefine((request, ctx) => {
  if ((request.mode === 'single') !== (request.number_of_exposures === 1)) {
    ctx.addIssue({ code: 'custom', message: 'Single requires N=1; average requires N>1.' })
  }
}).transform(freezeData)
export type AcquisitionRequest = z.infer<typeof AcquisitionRequestSchema>

export const AcquisitionRngProvenanceSchema = z.strictObject({
  algorithm: z.literal('mulberry32'),
  algorithm_version: z.literal('mulberry32-v1'),
  seed_uint32: z.number().int().min(0).max(0xffff_ffff),
  sampling_algorithm: z.literal('box-muller-cosine'),
  sampling_algorithm_version: z.literal('box-muller-cosine-two-uniforms-v1'),
  consumption_order_version: z.literal(ACQUISITION_RNG_ORDER_VERSION),
  noise_model_version: z.literal(CCD_NOISE_MODEL_VERSION),
}).transform(freezeData)
export type AcquisitionRngProvenance = z.infer<typeof AcquisitionRngProvenanceSchema>

const TargetSchema = z.strictObject({
  laser_component_id: ComponentIdSchema,
  sample_component_id: ComponentIdSchema,
  spectrometer_component_id: ComponentIdSchema,
  resolution_version: z.literal('unique-traceable-chain-v1'),
})

const ModelsSchema = z.strictObject({
  optics: label,
  raman: label,
  raman_spectrum: z.literal(RAMAN_SPECTRUM_MODEL_VERSION),
  focus: label,
  spectrometer: label,
  ccd: label,
  noise: z.literal(CCD_NOISE_MODEL_VERSION),
  /** A scientific provenance manifest, not an application/file schema version. */
  contract: z.literal(ACQUISITION_CONTRACT_VERSION),
})

const SnapshotDataSchema = z.strictObject({
  optical_scene: OpticalSceneSchema,
  simulation_settings: SimulationConfigurationSchema,
  material: RamanMaterialSchema,
  material_dataset: RamanMaterialDatasetSchema,
  spectrometer: VirtualSpectrometerConfigurationSchema,
  detector: VirtualCcdConfigurationSchema,
  target: TargetSchema,
  context: RamanOpticalContextSchema,
  configuration_revision: safeIndex,
  simulation_model_version: ModelsSchema,
})

const sameData = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = Object.entries(left)
  const b = Object.entries(right)
  return a.length === b.length && a.every(([key, value]) =>
    Object.hasOwn(right, key) && sameData(value, (right as Record<string, unknown>)[key]),
  )
}

export const InstrumentSnapshotSchema = SnapshotDataSchema.superRefine((s, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  const find = (id: string) => s.optical_scene.components.find((c) => c.id === id && c.enabled)
  const laser = find(s.target.laser_component_id)
  const sample = find(s.target.sample_component_id)
  const detector = find(s.target.spectrometer_component_id)
  if (laser?.type !== 'laser' || sample?.type !== 'sample' || detector?.type !== 'spectrometer') {
    fail('Target must identify enabled Laser, Sample and Spectrometer components.')
    return
  }
  if (s.detector.integration_time_s <= 0) fail('Formal acquisition requires positive integration time.')
  if (sample.parameters.material_id !== s.material.id || s.context.material_id !== s.material.id ||
      s.context.sample_component_id !== sample.id) fail('Sample, material and context must agree.')
  if (!s.material_dataset.materials.some((m) => sameData(m, s.material))) fail('Material must match its recorded dataset.')
  if (s.spectrometer.spectrometer_component_id !== detector.id ||
      s.spectrometer.optical_throughput !== detector.parameters.optical_throughput) fail('Spectrometer configuration must match Scene.')
  const context = s.context
  if (context.source_component_id !== null && context.source_component_id !== laser.id) fail('Laser must match excitation lineage.')
  if (context.excitation_wavelength_nm !== null && context.excitation_wavelength_nm !== laser.parameters.wavelength_nm) fail('Laser wavelength must match context.')
  const ids = context.raman_return.spectrometer_component_ids
  if (ids.length > 1 || (ids.length === 1 && ids[0] !== detector.id)) fail('Ambiguous or mismatched Spectrometer lineage.')
  if (context.raman_return.path_reaches_spectrometer !== (ids.length === 1)) fail('Path reachability and Spectrometer identity must agree.')
  if (context.path_state === 'valid-signal-path' &&
      (!context.excitation_reached_sample || context.source_component_id === null || context.excitation_wavelength_nm === null ||
       ids.length !== 1 || !context.raman_return.path_reaches_spectrometer || context.raman_return.detected_effective_excitation_power_mw <= 0)) {
    fail('Signal path requires complete source and detector lineage.')
  }
  if (context.path_state === 'excited-no-return-path' &&
      (!context.excitation_reached_sample || context.source_component_id === null || context.excitation_wavelength_nm === null)) {
    fail('Excited context requires real source identity and wavelength.')
  }
  if (context.path_state === 'no-excitation-path') {
    if (context.excitation_reached_sample || context.source_component_id !== null ||
        context.excitation_wavelength_nm !== null || context.effective_excitation_power_mw !== 0 ||
        context.excitation_power_at_sample_mw !== 0 || context.raman_return.path_reaches_spectrometer || ids.length !== 0 ||
        context.raman_return.detected_effective_excitation_power_mw !== 0 || context.rayleigh_return.detected_effective_leakage_power_mw !== 0) fail('Dark-only context must not invent excitation.')
    if (s.optical_scene.components.filter((c) => c.enabled && c.type === 'laser').length !== 1) fail('Dark-only fallback Laser must be unambiguous.')
  }
  if (ids.length === 0 && s.optical_scene.components.filter((c) => c.enabled && c.type === 'spectrometer').length !== 1) {
    fail('Dark-only fallback Spectrometer must be unambiguous.')
  }
  const versions = s.simulation_model_version
  if (versions.optics !== s.simulation_settings.model_version || versions.raman !== context.model_version ||
      versions.focus !== context.focus.model_version || versions.spectrometer !== s.spectrometer.model_version ||
      versions.ccd !== s.detector.model_version) fail('Model manifest must match frozen inputs.')
}).transform(freezeData)
export type InstrumentSnapshot = z.infer<typeof InstrumentSnapshotSchema>

/** Data projection only. The comparison side may no longer have a valid target.
 * Inputs are schema-validated authoritative data; do not revalidate old lineage
 * against a changed/deleted component here, since that change must cancel. */
export const projectAcquisitionConfiguration = (input: InstrumentSnapshot) => {
  const s = input
  return freezeData(copyPlainData({
    identity_version: ACQUISITION_CONFIGURATION_IDENTITY_VERSION,
    components: s.optical_scene.components.map((c) => ({
      id: c.id, type: c.type, enabled: c.enabled,
      transform: c.transform, geometry: c.geometry, parameters: c.parameters,
    })),
    simulation_settings: s.simulation_settings,
    material: { id: s.material.id, fluorescence_level: s.material.fluorescence_level,
      peaks: s.material.peaks.map((p) => ({ shift_cm_1: p.shift_cm_1,
        relative_intensity: p.relative_intensity, width_cm_1: p.width_cm_1 })) },
    spectrometer: s.spectrometer, detector: s.detector,
    target: s.target, simulation_model_version: s.simulation_model_version,
  }))
}
export type AcquisitionConfigurationProjection = ReturnType<typeof projectAcquisitionConfiguration>
export const haveSameAcquisitionConfiguration = (left: InstrumentSnapshot, right: InstrumentSnapshot) =>
  sameData(projectAcquisitionConfiguration(left), projectAcquisitionConfiguration(right))

const ValuesSchema = z.array(nonnegative).min(2)
const BoundsSchema = z.strictObject({ minimum_counts: z.literal(0), maximum_counts: finite.positive() })

const validateCounts = (s: { axis: z.infer<typeof SpectrumAxisSchema>; counts: readonly number[];
  detector_bounds: z.infer<typeof BoundsSchema> }, ctx: z.RefinementCtx) => {
  if (s.counts.length !== s.axis.values_cm_1.length || s.counts.some((n) => n > s.detector_bounds.maximum_counts)) {
    ctx.addIssue({ code: 'custom', message: 'Counts must match axis and detector bounds.' })
  }
}

export const AcquisitionExposureSchema = z.strictObject({
  kind: z.literal('acquisition-exposure'),
  contract_version: z.literal(ACQUISITION_CONTRACT_VERSION),
  run_id: runId,
  exposure_index: safeIndex,
  axis: SpectrumAxisSchema,
  unit: z.literal('counts/bin'),
  counts: ValuesSchema,
  detector_bounds: BoundsSchema,
  rng: AcquisitionRngProvenanceSchema,
  clipped_low: z.array(z.boolean()).min(2),
  clipped_high: z.array(z.boolean()).min(2),
}).superRefine((s, ctx) => {
  validateCounts(s, ctx)
  if (s.clipped_low.length !== s.counts.length || s.clipped_high.length !== s.counts.length) {
    ctx.addIssue({ code: 'custom', message: 'Clipping masks must match counts.' })
  }
  s.counts.forEach((n, i) => {
    if ((s.clipped_low[i] && n !== 0) || (s.clipped_high[i] && n !== s.detector_bounds.maximum_counts) ||
        (s.clipped_low[i] && s.clipped_high[i])) ctx.addIssue({ code: 'custom', message: 'Clipped counts must be at the corresponding bound.' })
  })
}).transform(freezeData)
export type AcquisitionExposure = z.infer<typeof AcquisitionExposureSchema>

export const RawAcquiredSpectrumSchema = z.strictObject({
  kind: z.literal('raw-acquired-spectrum'),
  contract_version: z.literal(ACQUISITION_CONTRACT_VERSION),
  run_id: runId,
  axis: SpectrumAxisSchema,
  unit: z.literal('counts/bin'),
  counts: ValuesSchema,
  detector_bounds: BoundsSchema,
  aggregation: z.literal('arithmetic-mean'),
  number_of_exposures: positiveInteger,
}).superRefine(validateCounts).transform(freezeData)
export type RawAcquiredSpectrum = z.infer<typeof RawAcquiredSpectrumSchema>

/** Undefined is explicit data, not a fabricated zero or an omitted field. */
export const MetricAvailabilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available'), value: finite, unit: label, source: label,
    model_version: label, scientific_semantics: label }),
  z.strictObject({ status: z.literal('undefined'), value: z.null(), undefined_reason: label }),
]).transform(freezeData)
export type MetricAvailability = z.infer<typeof MetricAvailabilitySchema>

const UndefinedMetricSchema = z.strictObject({ status: z.literal('undefined'), value: z.null(), undefined_reason: label })
export const PeakSnrMetricSchema = z.discriminatedUnion('status', [UndefinedMetricSchema,
  z.strictObject({ status: z.literal('available'), value: finite.positive(), unit: z.literal('ratio'),
    source: z.literal('frozen-raman-ccd-and-noise-model'), model_version: z.literal(PEAK_SNR_MODEL_VERSION),
    scientific_semantics: z.literal(PEAK_SNR_SEMANTICS), peak_bin_index: safeIndex,
    peak_shift_cm_1: finite, peak_wavelength_nm: finite.positive(), signal_counts: finite.positive(),
    noise_rms_counts: finite.positive(), number_of_exposures: positiveInteger }),
]).transform(freezeData)
export const RayleighOdMetricSchema = z.discriminatedUnion('status', [UndefinedMetricSchema,
  z.strictObject({ status: z.literal('available'), value: nonnegative, unit: z.literal('OD'),
    source: z.literal('context.rayleigh_return.leakage_throughput_to_spectrometer_input'),
    model_version: z.literal(RAYLEIGH_OD_MODEL_VERSION), scientific_semantics: z.literal(RAYLEIGH_OD_SEMANTICS),
    transmission: finite.positive().max(1), excitation_wavelength_nm: finite.positive() }),
]).transform(freezeData)
const ProxyMetricSchema = z.strictObject({
  status: z.literal('available'), value: nonnegative, unit: z.literal('mW'),
  source: label, model_version: label,
  scientific_semantics: z.literal('detected-effective-power-proxy-not-absolute-raman-radiant-power'),
})
const MetricsSchema = z.strictObject({
  focus_efficiency: nonnegative.max(1),
  raman_power: ProxyMetricSchema,
  rayleigh_leakage: ProxyMetricSchema,
  snr: PeakSnrMetricSchema,
  rayleigh_od: RayleighOdMetricSchema,
  /** Expected mask + each exposure's masks are the saturation evidence. */
  saturation: z.strictObject({ evidence: z.literal('expected-mask-and-per-exposure-clipping'),
    expected_saturated_bin_count: safeIndex }),
})

const InputSchema = z.strictObject({
  id: runId,
  /** PRD timestamp is this field; a second timestamp alias is rejected. */
  started_at: AcquisitionUtcTimestampSchema,
  request: AcquisitionRequestSchema,
  instrument_snapshot: InstrumentSnapshotSchema,
  expected_spectrum: ExpectedCcdSpectrumSchema,
  rng: AcquisitionRngProvenanceSchema,
}).superRefine((s, ctx) => {
  const e = s.expected_spectrum
  const snapshot = s.instrument_snapshot
  if (e.material_id !== snapshot.material.id || !sameData(e.detector, snapshot.detector) ||
      !sameData(e.spectrometer, snapshot.spectrometer)) ctx.addIssue({ code: 'custom', message: 'Expected spectrum must match snapshot.' })
  if (snapshot.context.path_state === 'no-excitation-path' && e.signal_counts.some((n) => n !== 0)) {
    ctx.addIssue({ code: 'custom', message: 'Dark-only expected spectrum cannot contain invented signal.' })
  }
  if (e.saturated.some((flag, i) => flag !== (e.unclipped_expected_counts[i]! >= e.detector.full_well_counts))) {
    ctx.addIssue({ code: 'custom', message: 'Expected saturation mask must match full well.' })
  }
  if (e.expected_counts.some((value, i) => value !== Math.min(e.detector.full_well_counts, e.unclipped_expected_counts[i]!))) {
    ctx.addIssue({ code: 'custom', message: 'Expected counts must follow the recorded clipping evidence.' })
  }
}).transform(freezeData)
export const AcquisitionInputSchema = InputSchema
export type AcquisitionInput = z.infer<typeof AcquisitionInputSchema>

const ExposuresSchema = z.array(AcquisitionExposureSchema)
const validateFrames = (input: AcquisitionInput, frames: readonly AcquisitionExposure[], ctx: z.RefinementCtx) => {
  if (frames.length > input.request.number_of_exposures) ctx.addIssue({ code: 'custom', message: 'Too many accepted exposures.' })
  frames.forEach((frame, i) => {
    if (frame.run_id !== input.id || frame.exposure_index !== i ||
        !sameData(frame.axis, input.expected_spectrum.axis) || !sameData(frame.rng, input.rng) ||
        frame.detector_bounds.maximum_counts !== input.instrument_snapshot.detector.full_well_counts) {
      ctx.addIssue({ code: 'custom', message: 'Exposure must belong to this Run, index, axis, RNG and detector.', path: ['exposures', i] })
    }
  })
}

export const CompletedAcquisitionRunSchema = z.strictObject({
  status: z.literal('completed'),
  input: InputSchema,
  completed_at: AcquisitionUtcTimestampSchema,
  exposures: ExposuresSchema,
  acquired_spectrum: RawAcquiredSpectrumSchema,
  metrics: MetricsSchema,
}).superRefine((s, ctx) => {
  validateFrames(s.input, s.exposures, ctx)
  const n = s.input.request.number_of_exposures
  const raw = s.acquired_spectrum
  if (s.completed_at < s.input.started_at || s.exposures.length !== n || raw.number_of_exposures !== n ||
      raw.run_id !== s.input.id || !sameData(raw.axis, s.input.expected_spectrum.axis) ||
      raw.detector_bounds.maximum_counts !== s.input.instrument_snapshot.detector.full_well_counts) {
    ctx.addIssue({ code: 'custom', message: 'Completed Run must have N matching exposures, raw spectrum and ordered timestamps.' })
  }
  // N=1 identity is a contract check; no N>1 averaging algorithm is implemented.
  if (n === 1 && !sameData(raw.counts, s.exposures[0]?.counts)) ctx.addIssue({ code: 'custom', message: 'Single raw must equal its exposure.' })
  const context = s.input.instrument_snapshot.context
  const metrics = s.metrics
  if (metrics.focus_efficiency !== context.focus.efficiency ||
      metrics.saturation.expected_saturated_bin_count !== s.input.expected_spectrum.saturated_bin_count) {
    ctx.addIssue({ code: 'custom', message: 'Metrics must match frozen evidence.' })
  }
  const proxies = [
    [metrics.raman_power, 'raman_return.detected_effective_excitation_power_mw', context.raman_return.detected_effective_excitation_power_mw],
    [metrics.rayleigh_leakage, 'rayleigh_return.detected_effective_leakage_power_mw', context.rayleigh_return.detected_effective_leakage_power_mw],
  ] as const
  for (const [metric, source, value] of proxies) {
    if (metric.source !== source || metric.value !== value || metric.model_version !== context.model_version) {
      ctx.addIssue({ code: 'custom', message: 'Power proxy must match its declared frozen source and model.' })
    }
  }
  const od = metrics.rayleigh_od
  if (od.status === 'available' && (!context.rayleigh_return.geometric_path_reaches_spectrometer ||
      od.transmission !== context.rayleigh_return.leakage_throughput_to_spectrometer_input ||
      od.excitation_wavelength_nm !== context.excitation_wavelength_nm || od.value !== -Math.log10(od.transmission))) {
    ctx.addIssue({ code: 'custom', message: 'OD must match its frozen path reference and transmission.' })
  }
  const snr = metrics.snr
  if (snr.status === 'available') {
    const expected = s.input.expected_spectrum
    const i = snr.peak_bin_index
    if (i >= expected.expected_counts.length || snr.number_of_exposures !== n ||
        snr.peak_shift_cm_1 !== expected.axis.values_cm_1[i] || snr.peak_wavelength_nm !== expected.scattered_wavelength_nm[i] ||
        snr.signal_counts > expected.signal_counts[i]! || expected.saturated[i] ||
        s.exposures.some((e) => e.clipped_high[i] || e.clipped_low[i]) ||
        snr.noise_rms_counts !== meanNoiseRmsCounts(expected.expected_counts[i]!, expected.detector.read_noise_rms_counts, n) ||
        snr.value !== snr.signal_counts / snr.noise_rms_counts) {
      ctx.addIssue({ code: 'custom', message: 'Peak SNR must match its frozen bin, N, noise model and unclipped data.' })
    }
  }
}).transform(freezeData)
export type CompletedAcquisitionRun = z.infer<typeof CompletedAcquisitionRunSchema>

export const CancelledAcquisitionRunSchema = z.strictObject({
  status: z.literal('cancelled'),
  input: InputSchema,
  cancelled_at: AcquisitionUtcTimestampSchema,
  cancellation_reason: label,
  exposures: ExposuresSchema,
}).superRefine((s, ctx) => {
  validateFrames(s.input, s.exposures, ctx)
  if (s.cancelled_at < s.input.started_at) ctx.addIssue({ code: 'custom', message: 'Cancellation cannot precede start.' })
}).transform(freezeData)
export type CancelledAcquisitionRun = z.infer<typeof CancelledAcquisitionRunSchema>
export const AcquisitionRunSchema = z.union([CompletedAcquisitionRunSchema, CancelledAcquisitionRunSchema])
export type AcquisitionRun = z.infer<typeof AcquisitionRunSchema>

const activeRuntimeShape = {
  token: label,
  input: InputSchema,
  exposures: ExposuresSchema,
}
const RunningRuntimeSchema = z.strictObject({ status: z.literal('running'), ...activeRuntimeShape }).superRefine((s, ctx) => {
  validateFrames(s.input, s.exposures, ctx)
})
const ErrorRuntimeSchema = z.strictObject({ status: z.literal('error'), ...activeRuntimeShape, error_reason: label }).superRefine((s, ctx) => {
  validateFrames(s.input, s.exposures, ctx)
})
/** Plain runtime data only: no timers, RNG closures, transitions or Error Run. */
export const AcquisitionRuntimeSchema = z.union([
  z.strictObject({ status: z.literal('idle') }),
  RunningRuntimeSchema,
  ErrorRuntimeSchema,
  z.strictObject({ status: z.literal('completed'), run: CompletedAcquisitionRunSchema }),
  z.strictObject({ status: z.literal('cancelled'), run: CancelledAcquisitionRunSchema }),
]).transform(freezeData)
export type AcquisitionRuntime = z.infer<typeof AcquisitionRuntimeSchema>
