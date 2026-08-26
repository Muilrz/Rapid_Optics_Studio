import { useState, type KeyboardEvent } from 'react'
import { Transform2DSchema } from '../../core/optics'
import {
  COMPONENT_DEFINITIONS,
  type InspectorParameterField,
} from '../../project/components/componentDefinitions'
import { useStudioStore } from '../../store/studioStore'
import {
  formatInspectorError,
  parseFiniteNumericDraft,
} from './inspectorValidation'

interface DraftFieldProps {
  readonly fieldKey: string
  readonly label: string
  readonly value: string
  readonly unit?: string
  readonly numeric?: boolean
  readonly step?: number
  readonly onCommit: (value: string) => void
}

function DraftField({
  fieldKey,
  label,
  value,
  unit,
  numeric = false,
  step,
  onCommit,
}: DraftFieldProps) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    try {
      onCommit(draft)
      setError(null)
    } catch (commitError) {
      setError(formatInspectorError(commitError))
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setDraft(value)
      setError(null)
      event.currentTarget.blur()
    }
  }

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <span className="inspector-input-wrap">
        <input
          className="inspector-input"
          data-field-key={fieldKey}
          type="text"
          inputMode={numeric ? 'decimal' : 'text'}
          value={draft}
          aria-invalid={error !== null}
          aria-describedby={error ? `${fieldKey}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          step={step}
        />
        {unit && <span className="inspector-input-unit">{unit}</span>}
      </span>
      {error && (
        <span className="inspector-error" id={`${fieldKey}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

const asParameterRecord = (parameters: object) =>
  parameters as Readonly<Record<string, unknown>>

const visibleParameterFields = (
  fields: readonly InspectorParameterField[],
  parameters: Readonly<Record<string, unknown>>,
) =>
  fields.filter(
    (field) =>
      !('visibleWhen' in field) ||
      !field.visibleWhen ||
      parameters[field.visibleWhen.key] === field.visibleWhen.value,
  )

export function PropertyInspector() {
  const selectedComponentIds = useStudioStore(
    (state) => state.editor.selectedComponentIds,
  )
  const primaryComponentId = useStudioStore(
    (state) => state.editor.primaryComponentId,
  )
  const sceneComponents = useStudioStore(
    (state) => state.authoritative.scene.components,
  )
  const selected = new Set(selectedComponentIds)
  const selectedComponents = sceneComponents.filter(({ id }) => selected.has(id))
  const component =
    selectedComponents.length === 1 && selectedComponents[0]?.id === primaryComponentId
      ? selectedComponents[0]
      : undefined
  const trace = useStudioStore((state) => state.derived.trace)
  const updateCommon = useStudioStore((state) => state.updateComponentCommon)
  const updateTransform = useStudioStore(
    (state) => state.updateComponentTransform,
  )
  const updateGeometry = useStudioStore(
    (state) => state.updateComponentGeometry,
  )
  const updateParameters = useStudioStore(
    (state) => state.updateComponentParameters,
  )
  const deleteComponent = useStudioStore((state) => state.deleteComponent)
  const deleteSelectedComponents = useStudioStore(
    (state) => state.deleteSelectedComponents,
  )

  if (selectedComponentIds.length === 0 || !primaryComponentId) {
    return (
      <aside className="property-inspector" aria-label="Property Inspector">
        <div className="side-panel-header">
          <p className="info-label">Selection</p>
          <h2>Property Inspector</h2>
        </div>
        <div className="inspector-empty" data-inspector-empty>
          <span className="inspector-empty-mark" aria-hidden="true">
            ◇
          </span>
          <p>Select a component to inspect and edit its formal properties.</p>
        </div>
      </aside>
    )
  }

  if (selectedComponents.length > 1) {
    return (
      <aside
        className="property-inspector"
        aria-label="Property Inspector"
        data-inspector-multi-count={selectedComponents.length}
      >
        <div className="side-panel-header inspector-title-row">
          <div>
            <p className="info-label">Multiple selection</p>
            <h2>{selectedComponents.length} components</h2>
          </div>
          <button
            type="button"
            className="delete-component-button"
            onClick={deleteSelectedComponents}
          >
            Delete all
          </button>
        </div>
        <section className="inspector-section inspector-selection-summary">
          <h3>Selection summary</h3>
          <p>Drag any selected component to move the group while preserving relative layout.</p>
          <ul>
            {selectedComponents.map((selected) => (
              <li
                key={selected.id}
                data-summary-component-id={selected.id}
                data-summary-primary={selected.id === primaryComponentId}
              >
                <span>{selected.name}</span>
                <code>{selected.type}</code>
                {selected.id === primaryComponentId && <em>Primary</em>}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    )
  }

  if (!component) return null

  const definition = COMPONENT_DEFINITIONS[component.type]
  const parameters = asParameterRecord(component.parameters)
  const interaction = [...trace.events].reverse().find(
    (event) =>
      event.kind === 'component-interaction' &&
      event.componentId === component.id,
  )
  const sourceRay = trace.rays.find(
    (ray) =>
      ray.generation === 0 && ray.sourceComponentId === component.id,
  )

  const commitParameter = (key: string, value: unknown) => {
    updateParameters(component.id, { ...parameters, [key]: value })
  }

  const changeLeakageModel = (value: string) => {
    const common = {
      raman_transmission: parameters.raman_transmission,
      rayleigh_suppression_od: parameters.rayleigh_suppression_od,
    }
    updateParameters(
      component.id,
      value === 'constant'
        ? { ...common, leakage_model: 'constant' }
        : {
            ...common,
            leakage_model: 'angle-dependent',
            leakage_midpoint_aoi_deg: 26,
            leakage_transition_width_deg: 2,
          },
    )
  }

  return (
    <aside
      className="property-inspector"
      aria-label="Property Inspector"
      data-inspector-component-id={component.id}
    >
      <div className="side-panel-header inspector-title-row">
        <div>
          <p className="info-label">{definition.displayName}</p>
          <h2>Property Inspector</h2>
        </div>
        <button
          type="button"
          className="delete-component-button"
          onClick={() => deleteComponent(component.id)}
        >
          Delete
        </button>
      </div>

      <section className="inspector-section">
        <h3>Identity</h3>
        <DraftField
          key={`${component.id}:name:${component.name}`}
          fieldKey="name"
          label="Name"
          value={component.name}
          onCommit={(draft) => updateCommon(component.id, { name: draft })}
        />
        <div className="inspector-readonly-row">
          <span>Type</span>
          <code>{component.type}</code>
        </div>
        <div className="inspector-readonly-row">
          <span>ID</span>
          <code data-inspector-id>{component.id}</code>
        </div>
        <label className="inspector-toggle-row">
          <span>Enabled</span>
          <input
            type="checkbox"
            data-field-key="enabled"
            checked={component.enabled}
            onChange={(event) =>
              updateCommon(component.id, { enabled: event.target.checked })
            }
          />
        </label>
      </section>

      <section className="inspector-section">
        <h3>Transform · world mm</h3>
        {(
          [
            ['x_mm', 'X', 'mm'],
            ['y_mm', 'Y', 'mm'],
            ['rotation_deg', 'Rotation', 'deg'],
          ] as const
        ).map(([key, label, unit]) => (
          <DraftField
            key={`${component.id}:${key}:${component.transform[key]}`}
            fieldKey={key}
            label={label}
            value={String(component.transform[key])}
            unit={unit}
            numeric
            step={key === 'rotation_deg' ? 1 : 0.1}
            onCommit={(draft) =>
              updateTransform(
                component.id,
                Transform2DSchema.parse({
                  ...component.transform,
                  [key]: parseFiniteNumericDraft(draft),
                }),
              )
            }
          />
        ))}
      </section>

      <section className="inspector-section">
        <h3>Geometry</h3>
        <DraftField
          key={`${component.id}:aperture_mm:${component.geometry.aperture_mm}`}
          fieldKey="aperture_mm"
          label="Aperture"
          value={String(component.geometry.aperture_mm)}
          unit="mm"
          numeric
          step={0.1}
          onCommit={(draft) =>
            updateGeometry(component.id, parseFiniteNumericDraft(draft))
          }
        />
      </section>

      <section className="inspector-section">
        <h3>Optical parameters</h3>
        {visibleParameterFields(definition.parameterFields, parameters).map(
          (field) => {
            const value = parameters[field.key]
            if (field.kind === 'number' && typeof value === 'number') {
              return (
                <DraftField
                  key={`${component.id}:${field.key}:${value}`}
                  fieldKey={field.key}
                  label={field.label}
                  value={String(value)}
                  unit={field.unit}
                  numeric
                  step={field.step}
                  onCommit={(draft) =>
                    commitParameter(
                      field.key,
                      parseFiniteNumericDraft(draft),
                    )
                  }
                />
              )
            }
            if (field.kind === 'text' && typeof value === 'string') {
              return (
                <DraftField
                  key={`${component.id}:${field.key}:${value}`}
                  fieldKey={field.key}
                  label={field.label}
                  value={value}
                  onCommit={(draft) => commitParameter(field.key, draft)}
                />
              )
            }
            if (field.kind === 'select' && typeof value === 'string') {
              return (
                <label className="inspector-field" key={`${component.id}:${field.key}`}>
                  <span className="inspector-field-label">{field.label}</span>
                  <select
                    className="inspector-input inspector-select"
                    data-field-key={field.key}
                    value={value}
                    onChange={(event) =>
                      field.key === 'leakage_model'
                        ? changeLeakageModel(event.target.value)
                        : commitParameter(field.key, event.target.value)
                    }
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
            if (field.kind === 'readonly') {
              return (
                <div className="inspector-readonly-row" key={`${component.id}:${field.key}`}>
                  <span>{field.label}</span>
                  <code>{String(value)}</code>
                </div>
              )
            }
            return null
          },
        )}
      </section>

      <section className="inspector-section trace-response" aria-live="polite">
        <h3>Derived trace response</h3>
        {interaction?.kind === 'component-interaction' ? (
          <dl>
            <div>
              <dt>Outcome</dt>
              <dd>{interaction.outcome}</dd>
            </div>
            <div>
              <dt>Incoming</dt>
              <dd>{interaction.power.incoming_power_mw.toPrecision(5)} mW</dd>
            </div>
            <div>
              <dt>Outgoing</dt>
              <dd data-derived-outgoing-power>
                {interaction.power.outgoing_power_mw.toPrecision(5)} mW
              </dd>
            </div>
          </dl>
        ) : sourceRay ? (
          <p data-derived-source-power>
            Emitted power: {sourceRay.power_mw.toPrecision(5)} mW
          </p>
        ) : (
          <p>No current interaction for this component.</p>
        )}
      </section>
    </aside>
  )
}
