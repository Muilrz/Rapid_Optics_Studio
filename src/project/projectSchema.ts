import { z } from 'zod'
import { AcquisitionUtcTimestampSchema, CompletedAcquisitionRunSchema, meanExposureCounts, VirtualCcdConfigurationSchema } from '../core/acquisition'
import { PROCESSING_VERSION, validateSamples } from '../core/analysis/processing'
import { OpticalSceneSchema, SimulationConfigurationSchema, StableIdSchema, Vec2Schema } from '../core/optics'
import { BUILT_IN_RAMAN_MATERIALS, RamanMaterialSchema } from '../core/raman'

export const PROJECT_VERSION = '1.0'
export const PROJECT_FORMAT = 'rapid-optics-project'
export const MAX_PROJECT_BYTES = 128 * 1024 * 1024
const spectrumId = z.string().min(1).max(150)
const bin = z.number().int().min(0).max(999_999)
const step = { id: z.number().int().positive().max(1_000_000_000), enabled: z.boolean() }
const radius = z.number().int().min(1).max(200)
export const PipelineSchema = z.strictObject({
  runId: StableIdSchema, rawSpectrumId: spectrumId, algorithmVersion: z.literal(PROCESSING_VERSION),
  steps: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ ...step, kind: z.literal('baseline'), radius }),
    z.strictObject({ ...step, kind: z.literal('smoothing'), radius }),
    z.strictObject({ ...step, kind: z.literal('normalize'), method: z.enum(['max-absolute', 'min-max']) }),
  ])).max(64).readonly(),
}).refine((pipeline) => pipeline.rawSpectrumId === pipeline.runId + '/raw' &&
  new Set(pipeline.steps.map(({ id }) => id)).size === pipeline.steps.length, 'Invalid Pipeline provenance or duplicate step ID.')

const PeakEditsSchema = z.strictObject({
  threshold: z.number().min(1).max(100), detecting: z.boolean(),
  manual: z.array(bin).max(10_000).readonly(), ignored: z.array(bin).max(10_000).readonly(),
  assignments: z.record(z.string().regex(/^(auto|manual)-(0|[1-9][0-9]{0,5})$/), z.strictObject({
    materialId: StableIdSchema, label: z.string().min(1).max(512), referencePosition_cm_1: z.number(),
  })),
})
export type PeakEdits = z.infer<typeof PeakEditsSchema>
export const DemoSpectrumMetadataSchema = z.strictObject({
  type: z.literal('raman-spectrum'), version: z.literal(1),
  label: z.string().min(1).max(200), exportedAt: z.iso.datetime(),
  excitation_nm: z.number().positive(), material: z.string().min(1), material_name: z.string().min(1),
  integration_s: z.number().positive(),
  window: z.strictObject({ smin: z.number(), smax: z.number(), n: z.number().int().min(2).max(1_000_000) }),
  telemetry: z.strictObject({
    etaFocus: z.number(), ramanPower: z.number(), rayleighLeak: z.number(),
    rayleighOD: z.number(), snr: z.number(), ok: z.boolean(),
  }),
  peaks: z.array(z.strictObject({ shift: z.number(), rel: z.number().nonnegative(), width: z.number().positive() })),
})

export const SpectrumFileSchema = z.strictObject({
  format: z.literal('rapid-optics-spectrum'), schemaVersion: z.literal(PROJECT_VERSION),
  kind: z.enum(['expected', 'raw', 'processed']), axisUnit: z.literal('cm^-1'),
  unit: z.enum(['counts/bin', 'dimensionless']), saturated: z.boolean().nullable(),
  axis: z.array(z.number().min(-1e8).max(1e8)).min(2).max(1_000_000).readonly(),
  values: z.array(z.number()).min(2).max(1_000_000).readonly(),
  runId: StableIdSchema.nullable(), pipeline: PipelineSchema.nullable(),
  source: z.string().min(1).max(512),
  legacyMetadata: DemoSpectrumMetadataSchema.optional(),
}).superRefine((s, ctx) => {
  try { validateSamples(s.axis, s.values) } catch (error) {
    ctx.addIssue({ code: 'custom', message: String(error), path: ['axis'] })
  }
  const dimensionless = s.pipeline?.steps.some((step) => step.enabled && step.kind === 'normalize') ?? false
  if ((s.kind === 'processed') !== Boolean(s.pipeline) ||
      (s.pipeline && (s.pipeline.runId !== s.runId || !s.pipeline.steps.some((step) => step.enabled))) ||
      (s.unit === 'dimensionless') !== dimensionless ||
      (s.kind !== 'processed' && s.values.some((value) => value < 0))) {
    ctx.addIssue({ code: 'custom', message: 'Spectrum kind, units or Pipeline provenance disagree.' })
  }
}).readonly()
export type SpectrumFile = z.infer<typeof SpectrumFileSchema>

const AnalysisSchema = z.strictObject({
  pipelines: z.array(PipelineSchema).max(2000),
  visible: z.array(z.tuple([spectrumId, z.boolean()])).max(8000),
  peakEdits: z.array(z.tuple([spectrumId, PeakEditsSchema])).max(4000),
})
export interface SpectrumAnalysisState {
  readonly pipelines: ReadonlyMap<string, z.infer<typeof PipelineSchema>>
  readonly visible: ReadonlyMap<string, boolean>
  readonly peakEdits: ReadonlyMap<string, PeakEdits>
}
export const emptyAnalysis = (): SpectrumAnalysisState => ({
  pipelines: new Map(), visible: new Map(), peakEdits: new Map(),
})

export const projectDesignShape = {
  opticalScene: OpticalSceneSchema,
  simulationConfiguration: SimulationConfigurationSchema,
  detectorConfiguration: VirtualCcdConfigurationSchema,
  materials: z.array(RamanMaterialSchema).max(256).readonly(),
}
export function validateDesign(design: { opticalScene: z.infer<typeof OpticalSceneSchema>; materials: readonly z.infer<typeof RamanMaterialSchema>[] }) {
  const ids = new Set<string>(BUILT_IN_RAMAN_MATERIALS.map(({ id }) => id))
  for (const material of design.materials) {
    if (ids.has(material.id)) throw new Error('Duplicate material ID: ' + material.id)
    if (material.peaks.length > 10_000) throw new Error('Too many material peaks: ' + material.id)
    ids.add(material.id)
  }
  for (const component of design.opticalScene.components) {
    if (component.type === 'sample' && !ids.has(component.parameters.material_id)) {
      throw new Error('Unknown material ' + component.parameters.material_id + ' on ' + component.id)
    }
  }
}
export const RapidOpticsProjectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT), schemaVersion: z.literal(PROJECT_VERSION),
  metadata: z.strictObject({
    id: StableIdSchema, name: z.string().trim().min(1).max(128),
    createdAt: AcquisitionUtcTimestampSchema, updatedAt: AcquisitionUtcTimestampSchema,
  }).readonly(),
  ...projectDesignShape,
  acquisitionRuns: z.array(CompletedAcquisitionRunSchema).max(2000).readonly(),
  spectrumLibrary: z.array(z.strictObject({ id: StableIdSchema, spectrum: SpectrumFileSchema }).readonly()).max(256).readonly(),
  analysisState: AnalysisSchema,
  viewState: z.strictObject({
    gridVisible: z.boolean(), snapEnabled: z.boolean(),
    camera: z.strictObject({ center_mm: Vec2Schema, zoom_px_per_mm: z.number().min(0.2).max(12) }),
  }),
}).superRefine((project, ctx) => {
  const fail = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path })
  try { validateDesign(project) } catch (error) { fail(String(error), ['opticalScene']) }
  if (project.metadata.createdAt > project.metadata.updatedAt) fail('Timestamps are out of order.', ['metadata'])
  const runs = new Map(project.acquisitionRuns.map((run) => [run.input.id, run]))
  for (const [i, run] of project.acquisitionRuns.entries()) {
    if (run.exposures.length > 1 && meanExposureCounts(run.exposures)
      .some((value, bin) => value !== run.acquired_spectrum.counts[bin])) {
      fail('Raw Mean does not match the frozen exposures.', ['acquisitionRuns', i, 'acquired_spectrum', 'counts'])
    }
  }
  if (runs.size !== project.acquisitionRuns.length) fail('Duplicate Run ID.', ['acquisitionRuns'])
  const spectra = new Set<string>()
  for (const { id } of project.spectrumLibrary) {
    const key = 'library/' + id
    if (spectra.has(key)) fail('Duplicate imported spectrum ID.', ['spectrumLibrary'])
    spectra.add(key)
  }
  for (const id of runs.keys()) for (const kind of ['expected', 'raw', 'processed']) spectra.add(id + '/' + kind)
  const { pipelines, visible, peakEdits } = project.analysisState
  let work = 0
  const pipelineIds = new Set<string>()
  for (const pipeline of pipelines) {
    const run = runs.get(pipeline.runId)
    if (!run || pipelineIds.has(pipeline.runId)) fail('Unknown or duplicate Pipeline Run ID.', ['analysisState', 'pipelines'])
    pipelineIds.add(pipeline.runId)
    if (run) work += run.acquired_spectrum.counts.length * pipeline.steps.reduce((sum, step) =>
      sum + ('radius' in step ? (2 * step.radius + 1) * (step.kind === 'baseline' ? 2 : 1) : 1), 0)
  }
  if (work > 100_000_000) fail('Processing complexity exceeds the project safety limit.', ['analysisState', 'pipelines'])
  if (new Map(visible).size !== visible.length || visible.some(([id]) => !spectra.has(id))) {
    fail('Unknown or duplicate Overlay spectrum ID.', ['analysisState', 'visible'])
  }
  if (new Map(peakEdits).size !== peakEdits.length) fail('Duplicate Peak spectrum ID.', ['analysisState', 'peakEdits'])
  for (const [id, edits] of peakEdits) {
    const [runId, kind] = id.split('/')
    const run = runs.get(runId!)
    if (!run || !spectra.has(id) || (kind !== 'raw' && kind !== 'processed')) {
      fail('Unknown Peak spectrum ID: ' + id, ['analysisState', 'peakEdits'])
      continue
    }
    const material = run.input.instrument_snapshot.material
    const n = run.acquired_spectrum.counts.length
    if ([...edits.manual, ...edits.ignored].some((bin) => bin >= n) ||
        new Set(edits.manual).size !== edits.manual.length || new Set(edits.ignored).size !== edits.ignored.length) {
      fail('Invalid or duplicate Peak bin.', ['analysisState', 'peakEdits'])
    }
    for (const [key, assignment] of Object.entries(edits.assignments)) {
      const [source, binText] = key.split('-')
      if (Number(binText) >= n || (source === 'manual' && !edits.manual.includes(Number(binText))) ||
          assignment.materialId !== material.id || !material.peaks.some((peak) =>
            peak.shift_cm_1 === assignment.referencePosition_cm_1 && peak.assignment === assignment.label)) {
        fail('Peak assignment does not match its frozen material or sampled bin.', ['analysisState', 'peakEdits', key])
      }
    }
  }
})
export type RapidOpticsProject = z.infer<typeof RapidOpticsProjectSchema>
export type ProjectMetadata = RapidOpticsProject['metadata']
