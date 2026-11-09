import { PROJECT_FORMAT, PROJECT_VERSION, MAX_PROJECT_BYTES, RapidOpticsProjectSchema, type RapidOpticsProject } from './projectSchema'

export function parseJson(text: string): unknown {
  if (text.length > MAX_PROJECT_BYTES || new Blob([text]).size > MAX_PROJECT_BYTES) throw new Error('File exceeds the 128 MiB safety limit.')
  try { return JSON.parse(text.replace(/^\uFEFF/, '')) as unknown } catch {
    throw new Error('Invalid JSON. Check the file syntax.')
  }
}

/** Check shape limits before nested schemas copy or inspect large arrays. */
export function checkPlainData(root: unknown) {
  let entries = 0
  function visit(value: unknown, depth: number) {
    if (depth > 40 || ++entries > 12_000_000) throw new Error('File exceeds the data complexity limit.')
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Numbers must be finite.')
    if (Array.isArray(value)) {
      if (value.length > 1_000_000) throw new Error('Array exceeds the 1,000,000 entry limit.')
      for (const item of value) visit(item, depth + 1)
    } else if (value !== null && typeof value === 'object') {
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) throw new Error('Only plain data is supported.')
      for (const child of Object.values(value)) visit(child, depth + 1)
    } else if (value !== undefined && value !== null && !['string', 'boolean', 'number'].includes(typeof value)) {
      throw new Error('Only JSON-compatible data is supported.')
    }
  }
  visit(root, 0)
}

export function validateProject(data: unknown): RapidOpticsProject {
  if (!data || typeof data !== 'object' || !('format' in data) || data.format !== PROJECT_FORMAT) {
    throw new Error('Select a Rapid Optics Project file.')
  }
  // Phase 6 shipped no project format. Legacy Demo artifacts have their own adapter.
  if (!('schemaVersion' in data) || data.schemaVersion !== PROJECT_VERSION) {
    throw new Error('Unsupported project schema version: ' + ('schemaVersion' in data ? String(data.schemaVersion) : 'missing'))
  }
  checkPlainData(data)
  return RapidOpticsProjectSchema.parse(data)
}

export const deserializeProject = (text: string): RapidOpticsProject => validateProject(parseJson(text))

export function serializeProject(project: RapidOpticsProject): string {
  const text = JSON.stringify(validateProject(project))
  if (new Blob([text]).size > MAX_PROJECT_BYTES) throw new Error('Project exceeds the 128 MiB file limit.')
  return text
}
