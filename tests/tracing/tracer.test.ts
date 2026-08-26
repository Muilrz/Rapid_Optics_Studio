import { describe, expect, it } from 'vitest'
import {
  OpticalSceneSchema,
  SimulationConfigurationSchema,
  traceOpticalScene,
  type TraceResult,
} from '../../src/core/optics'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../fixtures/defaultRamanScene'
import { MINIMAL_TRACER_SCENE } from '../fixtures/minimalTracerScene'

const getComponent = (type: 'laser' | 'mirror' | 'spectrometer') =>
  DEFAULT_RAMAN_SCENE.components.find((component) => component.type === type)!

const terminationReasons = (result: TraceResult) =>
  result.events
    .filter((event) => event.kind === 'termination')
    .map((event) => event.reason)

const interactionIds = (result: TraceResult) =>
  result.events
    .filter((event) => event.kind === 'component-interaction')
    .map((event) => event.componentId)

describe('iterative tracer foundation', () => {
  it('records an escaped ray and a finite escape segment', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [getComponent('laser')],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(result.processedRayCount).toBe(1)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.distance_mm).toBe(
      DEFAULT_SIMULATION_CONFIGURATION.scene_escape_distance_mm,
    )
    expect(result.segments[0]?.hitComponentId).toBeNull()
    expect(terminationReasons(result)).toEqual(['escaped-scene'])
  })

  it('selects the nearest mapped component independent of scene order', () => {
    const mirror = getComponent('mirror')
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        {
          ...mirror,
          id: 'component:far',
          transform: { x_mm: 150, y_mm: -75, rotation_deg: 90 },
        },
        {
          ...mirror,
          id: 'component:near',
          transform: { x_mm: 100, y_mm: -75, rotation_deg: 90 },
        },
        getComponent('laser'),
      ],
    })

    expect(
      interactionIds(
        traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION),
      )[0],
    ).toBe('component:near')
  })

  it('records absorbed termination for a zero-reflectivity Mirror', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        getComponent('laser'),
        { ...getComponent('mirror'), parameters: { reflectivity: 0 } },
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(terminationReasons(result)).toContain('absorbed')
    expect(result.rays).toHaveLength(1)
  })

  it('terminates a child at the configured generation boundary', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [getComponent('laser'), getComponent('mirror')],
    })
    const result = traceOpticalScene(scene, {
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_generations: 1,
    })

    expect(result.rays.map((ray) => ray.generation)).toEqual([0, 1])
    expect(terminationReasons(result)).toContain('max-generation')
    expect(result.segments).toHaveLength(1)
  })

  it('terminates queued rays after the configured ray count', () => {
    const result = traceOpticalScene(MINIMAL_TRACER_SCENE, {
      ...DEFAULT_SIMULATION_CONFIGURATION,
      max_rays: 1,
    })

    expect(result.processedRayCount).toBe(1)
    expect(result.rays).toHaveLength(2)
    expect(terminationReasons(result)).toContain('max-ray-count')
  })

  it('terminates rays below the configured minimum power', () => {
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        getComponent('laser'),
        {
          ...getComponent('mirror'),
          parameters: { reflectivity: 0.001 },
        },
      ],
    })
    const result = traceOpticalScene(
      scene,
      SimulationConfigurationSchema.parse({
        ...DEFAULT_SIMULATION_CONFIGURATION,
        min_ray_power_mw: 0.1,
      }),
    )

    expect(result.rays[1]?.power_mw).toBeCloseTo(0.01, 12)
    expect(terminationReasons(result)).toContain('below-minimum-power')
  })

  it('detects at a Spectrometer as a zero-outgoing terminal interaction', () => {
    const spectrometer = getComponent('spectrometer')
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        getComponent('laser'),
        {
          ...spectrometer,
          transform: { x_mm: 100, y_mm: -75, rotation_deg: 90 },
        },
      ],
    })
    const result = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)

    expect(interactionIds(result)).toEqual(['component:spectrometer'])
    expect(terminationReasons(result)).toEqual(['detected'])
    expect(result.rays).toHaveLength(1)
  })

  it('processes multiple sources in stable ID and FIFO order', () => {
    const laser = getComponent('laser')
    const scene = OpticalSceneSchema.parse({
      breadboards: [],
      components: [
        { ...laser, id: 'component:laser-z', transform: { ...laser.transform, y_mm: 25 } },
        { ...laser, id: 'component:laser-a', transform: { ...laser.transform, y_mm: 0 } },
      ],
    })
    const first = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
    const second = traceOpticalScene(scene, DEFAULT_SIMULATION_CONFIGURATION)
    const emissions = first.events.filter(
      (event) => event.kind === 'source-emission',
    )

    expect(emissions.map((event) => event.componentId)).toEqual([
      'component:laser-a',
      'component:laser-z',
    ])
    expect(emissions.map((event) => event.rayId)).toEqual([
      'ray:000001',
      'ray:000002',
    ])
    expect(first).toEqual(second)
  })
})
