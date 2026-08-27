import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { traceOpticalScene } from '../../src/core/optics'
import {
  BreadboardLayer,
  ComponentLayer,
  TraceLayer,
} from '../../src/features/studio/benchLayers'
import {
  COMPONENT_RENDER_REGISTRY,
} from '../../src/features/studio/componentRenderRegistry'
import { ComponentMarker } from '../../src/features/studio/ComponentMarker'
import {
  createCamera2D,
  createViewportSize,
} from '../../src/features/studio/camera'
import {
  DEFAULT_RAMAN_SCENE,
  DEFAULT_SIMULATION_CONFIGURATION,
} from '../../src/project/defaults/defaultRamanScene'
import { createBranchingStressScene } from '../fixtures/hardeningScenes'

const camera = createCamera2D({ x: 250, y: -150 }, 1.5)
const viewport = createViewportSize(1000, 600)

const count = (value: string, pattern: RegExp) => value.match(pattern)?.length ?? 0

describe('Studio bench rendering', () => {
  it('registers an explicit representation for all ten component types', () => {
    expect(Object.keys(COMPONENT_RENDER_REGISTRY)).toEqual([
      'laser',
      'mirror',
      'dichroic',
      'objective',
      'sample',
      'filter',
      'spectrometer',
      'prism',
      'beam-splitter',
      'pinhole',
    ])
    expect(
      Object.values(COMPONENT_RENDER_REGISTRY).map(({ label }) => label),
    ).toEqual([
      'Laser',
      'Mirror',
      'Dichroic',
      'Objective',
      'Sample',
      'Edge Filter',
      'Spectrometer',
      'Prism',
      'Beam Splitter',
      'Pinhole',
    ])
  })

  it('renders stable component identity and a view-only disabled state', () => {
    const laser = DEFAULT_RAMAN_SCENE.components.find(
      (component) => component.type === 'laser',
    )
    expect(laser).toBeDefined()
    if (!laser) return

    const markup = renderToStaticMarkup(
      <svg>
        <ComponentMarker
          component={{ ...laser, enabled: false }}
          camera={camera}
          viewport={viewport}
          selected
          primary
          showRotationHandle
        />
      </svg>,
    )

    expect(markup).toContain('data-component-id="component:laser"')
    expect(markup).toContain('data-world-x-mm="50"')
    expect(markup).toContain('component-marker--disabled')
    expect(markup).toContain('component-marker--selected')
    expect(markup).toContain('component-marker--primary')
    expect(markup).toContain('data-component-hit-target="component:laser"')
    expect(markup).toContain('data-rotation-handle="component:laser"')
    expect(markup).toContain('LASER')
  })

  it('renders the default breadboard, all components, and every trace segment', () => {
    const trace = traceOpticalScene(
      DEFAULT_RAMAN_SCENE,
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const breadboardMarkup = renderToStaticMarkup(
      <svg>
        <BreadboardLayer
          breadboards={DEFAULT_RAMAN_SCENE.breadboards}
          camera={camera}
          viewport={viewport}
          gridVisible
        />
      </svg>,
    )
    const componentMarkup = renderToStaticMarkup(
      <svg>
        <ComponentLayer
          components={DEFAULT_RAMAN_SCENE.components}
          camera={camera}
          viewport={viewport}
        />
      </svg>,
    )
    const traceMarkup = renderToStaticMarkup(
      <svg>
        <TraceLayer trace={trace} camera={camera} viewport={viewport} />
      </svg>,
    )

    expect(breadboardMarkup).toContain('25 MM PITCH')
    expect(count(componentMarkup, /data-component-id=/g)).toBe(
      DEFAULT_RAMAN_SCENE.components.length,
    )
    expect(count(traceMarkup, /data-ray-id=/g)).toBe(trace.segments.length)
    expect(traceMarkup).toContain('trace-excitation')
    expect(traceMarkup).toContain('trace-sample-return-placeholder')
  })

  it('distinguishes every selected component from one primary without group rotation UI', () => {
    const [laser, mirror] = DEFAULT_RAMAN_SCENE.components
    if (!laser || !mirror) throw new Error('Fixture is incomplete.')
    const markup = renderToStaticMarkup(
      <svg>
        <ComponentLayer
          components={DEFAULT_RAMAN_SCENE.components}
          camera={camera}
          viewport={viewport}
          selectedComponentIds={[laser.id, mirror.id]}
          primaryComponentId={mirror.id}
        />
      </svg>,
    )

    expect(count(markup, /data-selected="true"/g)).toBe(2)
    expect(count(markup, /data-primary="true"/g)).toBe(1)
    expect(markup).not.toContain('data-rotation-handle=')
  })

  it('renders locked components as selectable without a rotation handle', () => {
    const mirror = DEFAULT_RAMAN_SCENE.components.find(({ type }) => type === 'mirror')!
    const markup = renderToStaticMarkup(
      <svg>
        <ComponentMarker
          component={mirror}
          camera={camera}
          viewport={viewport}
          selected
          primary
          locked
          showRotationHandle
        />
      </svg>,
    )

    expect(markup).toContain('component-marker--locked')
    expect(markup).toContain('data-locked="true"')
    expect(markup).toContain(`data-component-hit-target="${mirror.id}"`)
    expect(markup).not.toContain('data-rotation-handle=')
  })

  it('renders every segment of a branching trace without flattening branches', () => {
    const trace = traceOpticalScene(
      createBranchingStressScene(2),
      DEFAULT_SIMULATION_CONFIGURATION,
    )
    const markup = renderToStaticMarkup(
      <svg>
        <TraceLayer trace={trace} camera={camera} viewport={viewport} />
      </svg>,
    )

    expect(trace.rays.length).toBeGreaterThan(3)
    expect(count(markup, /data-ray-id=/g)).toBe(trace.segments.length)
  })
})
