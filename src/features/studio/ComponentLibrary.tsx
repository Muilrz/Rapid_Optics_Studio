import type { OpticalComponentType } from '../../core/optics'
import {
  COMPONENT_DEFINITIONS,
  type ComponentDefinition,
} from '../../project/components/componentDefinitions'
import { useStudioStore } from '../../store/studioStore'
import { COMPONENT_RENDER_REGISTRY } from './componentRenderRegistry'
import { snapWorldPoint } from './editorMath'

const definitions = Object.values(
  COMPONENT_DEFINITIONS,
) as readonly ComponentDefinition[]

export function ComponentLibrary() {
  const scene = useStudioStore((state) => state.authoritative.scene)
  const camera = useStudioStore((state) => state.view.camera)
  const snapEnabled = useStudioStore((state) => state.editor.snapEnabled)
  const addComponent = useStudioStore((state) => state.addComponent)
  const breadboard = scene.breadboards[0]

  const addAtViewportCenter = (type: OpticalComponentType) => {
    const insertion_mm = snapEnabled
      ? snapWorldPoint(
          camera.center_mm,
          breadboard?.hole_pitch_mm ?? 25,
          breadboard?.origin_mm ?? { x: 0, y: 0 },
        )
      : camera.center_mm
    addComponent(type, insertion_mm)
  }

  return (
    <aside className="component-library" aria-label="Component Library">
      <div className="side-panel-header">
        <p className="info-label">Build the scene</p>
        <h2>Component Library</h2>
      </div>
      <div className="component-library-list">
        {definitions.map((definition) => {
          const renderer = COMPONENT_RENDER_REGISTRY[definition.type]
          const Glyph = renderer.Glyph
          return (
            <button
              key={definition.type}
              type="button"
              className="component-library-item"
              data-library-component-type={definition.type}
              onClick={() => addAtViewportCenter(definition.type)}
              aria-label={`Add ${definition.displayName}`}
            >
              <svg
                className="library-item-icon"
                viewBox="-24 -24 48 48"
                aria-hidden="true"
                style={{ color: renderer.accent }}
              >
                <g className="component-glyph">
                  <Glyph size_px={30} aperture_px={30} />
                </g>
              </svg>
              <span>{definition.displayName}</span>
              <span className="library-add-mark" aria-hidden="true">
                +
              </span>
            </button>
          )
        })}
      </div>
      <p className="library-note">
        Adds at viewport center · {snapEnabled ? 'Grid-snapped' : 'Continuous mm'}
      </p>
    </aside>
  )
}
