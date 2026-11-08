import {
  AcquisitionRequestSchema, AcquisitionUtcTimestampSchema, CancelledAcquisitionRunSchema,
  AcquisitionExposureSchema, CompletedAcquisitionRunSchema,
  completeAcquisition, createAcquisitionRandom, simulateAcquisitionExposure,
  type AcquisitionClock, type AcquisitionExposure, type AcquisitionInput, type AcquisitionRequest,
  type AcquisitionRuntime, type CompletedAcquisitionRun, type CancelledAcquisitionRun,
  type RandomNumberGenerator,
} from '../core/acquisition'
import { buildAcquisitionInput, type AcquisitionDesign } from '../core/acquisition/instrumentInput'

export interface StudioAcquisitionState {
  readonly runtime: AcquisitionRuntime
  readonly completedRuns: readonly CompletedAcquisitionRun[]
  readonly cancelledRuns: readonly CancelledAcquisitionRun[]
  readonly lastStartError: string | null
}
export const initialAcquisitionState = (): StudioAcquisitionState => Object.freeze({
  runtime: Object.freeze({ status: 'idle' }), completedRuns: Object.freeze([]),
  cancelledRuns: Object.freeze([]), lastStartError: null,
})

export interface AcquisitionServices {
  readonly clock?: AcquisitionClock
  readonly seed?: () => number
  readonly id?: () => string
  /** Asynchronous task scheduling. Return an idempotent cancellation function. */
  readonly schedule?: (callback: () => void) => () => void
  readonly expose?: typeof simulateAcquisitionExposure
  readonly complete?: typeof completeAcquisition
}

interface Job {
  readonly token: string
  readonly input: AcquisitionInput
  readonly random: RandomNumberGenerator
  frames: readonly AcquisitionExposure[]
  unschedule: (() => void) | undefined
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export const createAcquisitionController = (
  read: () => StudioAcquisitionState,
  publish: (state: StudioAcquisitionState) => void,
  design: () => AcquisitionDesign,
  services: AcquisitionServices = {},
) => {
  const clock = services.clock ?? { now: () => new Date().toISOString() }
  const schedule = services.schedule ?? ((callback) => {
    const handle = setTimeout(callback, 100)
    return () => clearTimeout(handle)
  })
  let job: Job | undefined
  let sequence = 0
  const now = () => AcquisitionUtcTimestampSchema.parse(clock.now())
  const fail = (active: Job, error: unknown) => {
    if (job !== active) return
    job = undefined
    active.unschedule?.()
    publish(Object.freeze({ ...read(), runtime: Object.freeze({ status: 'error', token: active.token,
      input: active.input, exposures: active.frames, error_reason: message(error) }) }))
  }
  const running = (active: Job): AcquisitionRuntime => Object.freeze({ status: 'running',
    token: active.token, input: active.input, exposures: active.frames })
  const enqueue = (active: Job) => {
    if (job !== active) return
    const index = active.frames.length
    active.unschedule = schedule(() => {
      if (job !== active || active.frames.length !== index) return
      active.unschedule = undefined
      try {
        const frame = AcquisitionExposureSchema.parse((services.expose ?? simulateAcquisitionExposure)(active.input, index, active.random))
        if (job !== active) return
        const expectedAxis = active.input.expected_spectrum.axis.values_cm_1
        if (frame.run_id !== active.input.id || frame.exposure_index !== index || frame.rng.seed_uint32 !== active.input.rng.seed_uint32 ||
            frame.detector_bounds.maximum_counts !== active.input.instrument_snapshot.detector.full_well_counts ||
            frame.axis.values_cm_1.length !== expectedAxis.length || frame.axis.values_cm_1.some((v, i) => v !== expectedAxis[i])) {
          throw new Error('Exposure does not match the active Run.')
        }
        active.frames = Object.freeze([...active.frames, frame])
        if (active.frames.length === active.input.request.number_of_exposures) {
          const run = CompletedAcquisitionRunSchema.parse((services.complete ?? completeAcquisition)(active.input, active.frames, now()))
          if (job !== active) return
          job = undefined
          const state = read()
          publish(Object.freeze({ ...state, runtime: Object.freeze({ status: 'completed', run }),
            completedRuns: Object.freeze([...state.completedRuns, run]) }))
        } else {
          publish(Object.freeze({ ...read(), runtime: running(active) }))
          enqueue(active)
        }
      } catch (error) { fail(active, error) }
    })
  }
  return {
    start: (requestData: AcquisitionRequest): boolean => {
      if (job) return false
      try {
        const request = AcquisitionRequestSchema.parse(requestData)
        const id = (services.id ?? (() => crypto.randomUUID()))()
        if ([...read().completedRuns, ...read().cancelledRuns].some((r) => r.input.id === id)) throw new Error('Run ID already exists.')
        const seed = (services.seed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!))()
        const input = buildAcquisitionInput(design(), request, id, now(), seed)
        const active: Job = { token: `acquisition:${++sequence}`, input,
          random: createAcquisitionRandom(input), frames: Object.freeze([]), unschedule: undefined }
        job = active
        publish(Object.freeze({ ...read(), runtime: running(active), lastStartError: null }))
        try { enqueue(active) } catch (error) { fail(active, error) }
        return true
      } catch (error) {
        publish(Object.freeze({ ...read(), lastStartError: message(error) }))
        return false
      }
    },
    cancel: (reason: string) => {
      const active = job
      if (!active) return
      try {
        const run = CancelledAcquisitionRunSchema.parse({ status: 'cancelled', input: active.input,
          cancelled_at: now(), cancellation_reason: reason, exposures: active.frames })
        job = undefined
        active.unschedule?.()
        const state = read()
        publish(Object.freeze({ ...state, runtime: Object.freeze({ status: 'cancelled', run }),
          cancelledRuns: Object.freeze([...state.cancelledRuns, run]) }))
      } catch (error) { fail(active, error) }
    },
  }
}
